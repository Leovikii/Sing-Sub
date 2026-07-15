import { describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '../../shared';
import { WorkspaceConflictError } from '../../worker/application/errors/workspace-conflict';
import { canonicalJson } from '../../worker/domain/revisions/canonical-json';
import { r2ObjectKeys } from '../../worker/infrastructure/r2/r2-object-keys';
import {
  WorkspaceAlreadyExistsError,
  WorkspaceStorageCorruptError,
} from '../../worker/infrastructure/r2/r2-workspace-errors';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';

const now = '2026-07-14T12:00:00.000Z';

function snapshot(revisionId: string, previousRevisionId: string | null): WorkspaceSnapshot {
  return {
    schemaVersion: 1,
    workspaceId: 'workspace-1',
    revisionId,
    previousRevisionId,
    createdAt: now,
    settings: {
      owner: 'owner',
      repo: 'repo',
      userLogin: 'user',
      userAvatar: '',
      defaultBranch: 'main',
      authVersion: 1,
      tokenVersion: 1,
    },
    profiles: [],
    assets: { nodes: {}, templates: {}, patches: {}, rulesets: {} },
    builds: {},
    sync: { status: 'never' },
  };
}

describe('R2WorkspaceStore', () => {
  it('creates immutable revision and head objects, then reads the workspace', async () => {
    const bucket = new InMemoryR2Bucket();
    const store = new R2WorkspaceStore(bucket);

    await expect(store.create({ workspaceId: 'workspace-1', snapshot: snapshot('revision-1', null) }))
      .resolves.toEqual({ revision: 'revision-1', previousRevision: null });

    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-1'))).toBe(true);
    expect(bucket.has(r2ObjectKeys.head('workspace-1'))).toBe(true);
    await expect(store.read('workspace-1')).resolves.toMatchObject({
      workspaceId: 'workspace-1',
      revision: 'revision-1',
      snapshot: { revisionId: 'revision-1' },
    });
  });

  it('does not replace an existing workspace head', async () => {
    const bucket = new InMemoryR2Bucket();
    const store = new R2WorkspaceStore(bucket);
    await store.create({ workspaceId: 'workspace-1', snapshot: snapshot('revision-1', null) });

    await expect(store.create({ workspaceId: 'workspace-1', snapshot: snapshot('revision-2', null) }))
      .rejects.toBeInstanceOf(WorkspaceAlreadyExistsError);
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-2'))).toBe(true);
    await expect(store.read('workspace-1')).resolves.toMatchObject({ revision: 'revision-1' });
  });

  it('publishes a new revision through an expected-head ETag update', async () => {
    const bucket = new InMemoryR2Bucket();
    const store = new R2WorkspaceStore(bucket);
    await store.create({ workspaceId: 'workspace-1', snapshot: snapshot('revision-1', null) });

    await expect(store.publish({
      workspaceId: 'workspace-1',
      expectedRevision: 'revision-1',
      snapshot: snapshot('revision-2', 'revision-1'),
    })).resolves.toEqual({ revision: 'revision-2', previousRevision: 'revision-1' });
    await expect(store.readRevision('workspace-1', 'revision-1')).resolves.toMatchObject({ revisionId: 'revision-1' });
    await expect(store.read('workspace-1')).resolves.toMatchObject({ revision: 'revision-2' });
  });

  it('rejects a stale expected revision before writing another revision', async () => {
    const bucket = new InMemoryR2Bucket();
    const store = new R2WorkspaceStore(bucket);
    await store.create({ workspaceId: 'workspace-1', snapshot: snapshot('revision-1', null) });
    await store.publish({
      workspaceId: 'workspace-1',
      expectedRevision: 'revision-1',
      snapshot: snapshot('revision-2', 'revision-1'),
    });

    const error = await store.publish({
      workspaceId: 'workspace-1',
      expectedRevision: 'revision-1',
      snapshot: snapshot('revision-3', 'revision-1'),
    }).catch(value => value);
    expect(error).toBeInstanceOf(WorkspaceConflictError);
    expect(error).toMatchObject({ expectedRevision: 'revision-1', actualRevision: 'revision-2' });
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-3'))).toBe(false);
  });

  it('leaves a written revision invisible when the head changes concurrently', async () => {
    const bucket = new InMemoryR2Bucket();
    const store = new R2WorkspaceStore(bucket);
    await store.create({ workspaceId: 'workspace-1', snapshot: snapshot('revision-1', null) });
    bucket.raceNextConditionalPut(r2ObjectKeys.head('workspace-1'), canonicalJson({
      schemaVersion: 1,
      workspaceId: 'workspace-1',
      currentRevision: 'revision-race',
      previousRevision: 'revision-1',
      updatedAt: now,
      contentHash: 'b'.repeat(64),
    }));

    const error = await store.publish({
      workspaceId: 'workspace-1',
      expectedRevision: 'revision-1',
      snapshot: snapshot('revision-2', 'revision-1'),
    }).catch(value => value);

    expect(error).toMatchObject({ expectedRevision: 'revision-1', actualRevision: 'revision-race' });
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-2'))).toBe(true);
  });

  it('detects revision corruption against the head content hash', async () => {
    const bucket = new InMemoryR2Bucket();
    const store = new R2WorkspaceStore(bucket);
    await store.create({ workspaceId: 'workspace-1', snapshot: snapshot('revision-1', null) });
    const changed = snapshot('revision-1', null);
    changed.settings.repo = 'tampered';
    bucket.forcePut(r2ObjectKeys.revision('workspace-1', 'revision-1'), canonicalJson(changed));

    await expect(store.read('workspace-1')).rejects.toBeInstanceOf(WorkspaceStorageCorruptError);
  });

  it('lists revision metadata and restores old content as a new revision', async () => {
    const bucket = new InMemoryR2Bucket();
    const store = new R2WorkspaceStore(bucket);
    const initial = snapshot('revision-1', null);
    initial.settings.repo = 'original';
    initial.builds.rules = {
      jobId: 'job-a',
      rulesetId: 'rules',
      sourceHash: 'a'.repeat(64),
      compilerVersion: 'sing-box-1',
      status: 'ready',
      activeArtifact: {
        rulesetId: 'rules',
        sourceHash: 'a'.repeat(64),
        contentHash: 'b'.repeat(64),
        size: 128,
        createdAt: now,
      },
      updatedAt: now,
    };
    await store.create({ workspaceId: 'workspace-1', snapshot: initial });
    const changed = snapshot('revision-2', 'revision-1');
    changed.settings.repo = 'changed';
    changed.createdAt = '2026-07-14T13:00:00.000Z';
    changed.builds.rules = {
      jobId: 'job-b',
      rulesetId: 'rules',
      sourceHash: 'c'.repeat(64),
      compilerVersion: 'sing-box-1',
      status: 'ready',
      activeArtifact: {
        rulesetId: 'rules',
        sourceHash: 'c'.repeat(64),
        contentHash: 'd'.repeat(64),
        size: 256,
        createdAt: changed.createdAt,
      },
      updatedAt: changed.createdAt,
    };
    await store.publish({ workspaceId: 'workspace-1', expectedRevision: 'revision-1', snapshot: changed });

    await expect(store.listRevisions('workspace-1')).resolves.toMatchObject([
      { revisionId: 'revision-2', createdAt: '2026-07-14T13:00:00.000Z' },
      { revisionId: 'revision-1', createdAt: now },
    ]);
    await store.restore({
      workspaceId: 'workspace-1',
      targetRevision: 'revision-1',
      newRevision: 'revision-3',
      expectedRevision: 'revision-2',
      createdAt: '2026-07-14T14:00:00.000Z',
    });
    await expect(store.read('workspace-1')).resolves.toMatchObject({
      revision: 'revision-3',
      snapshot: {
        previousRevisionId: 'revision-2',
        settings: { repo: 'original' },
        builds: { rules: { activeArtifact: { sourceHash: 'a'.repeat(64), size: 128 } } },
      },
    });
    await expect(store.readRevision('workspace-1', 'revision-1')).resolves.toMatchObject({
      settings: { repo: 'original' },
    });
    await expect(store.readRevision('workspace-1', 'revision-2')).resolves.toMatchObject({
      settings: { repo: 'changed' },
    });
    await expect(store.restore({
      workspaceId: 'workspace-1',
      targetRevision: 'revision-2',
      newRevision: 'revision-4',
      expectedRevision: 'revision-2',
      createdAt: '2026-07-14T15:00:00.000Z',
    })).rejects.toBeInstanceOf(WorkspaceConflictError);
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-4'))).toBe(false);
  });

  it('recovers a missing head only from an explicitly selected revision', async () => {
    const bucket = new InMemoryR2Bucket();
    const store = new R2WorkspaceStore(bucket);
    await store.create({ workspaceId: 'workspace-1', snapshot: snapshot('revision-1', null) });
    bucket.forceDelete(r2ObjectKeys.head('workspace-1'));

    await expect(store.recoverHead('workspace-1', 'revision-1'))
      .resolves.toEqual({ revision: 'revision-1', previousRevision: null });
    await expect(store.read('workspace-1')).resolves.toMatchObject({ revision: 'revision-1' });
    await expect(store.recoverHead('workspace-1', 'revision-1'))
      .rejects.toBeInstanceOf(WorkspaceAlreadyExistsError);
  });
});
