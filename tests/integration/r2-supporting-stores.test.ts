import { describe, expect, it } from 'vitest';
import type { BuildJob, PrivateCredentials } from '../../shared';
import { WorkspaceConflictError } from '../../worker/application/errors/workspace-conflict';
import {
  ArtifactCollisionError,
  R2ArtifactStore,
} from '../../worker/infrastructure/r2/r2-artifact-store';
import { R2JobStore } from '../../worker/infrastructure/r2/r2-job-store';
import { R2PrivateMetadataStore } from '../../worker/infrastructure/r2/r2-private-metadata-store';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';

const sourceHash = 'a'.repeat(64);
const artifactIdentity = {
  workspaceId: 'workspace-1',
  rulesetId: 'ruleset-1',
  sourceHash,
};

function credentials(pat = 'github-token'): PrivateCredentials {
  return {
    schemaVersion: 1,
    workspaceId: 'workspace-1',
    github: {
      pat,
      owner: 'owner',
      repo: 'repo',
      defaultBranch: 'main',
    },
    updatedAt: '2026-07-14T12:00:00.000Z',
  };
}

function job(overrides: Partial<BuildJob> = {}): BuildJob {
  return {
    schemaVersion: 1,
    jobId: 'job-1',
    workspaceId: 'workspace-1',
    rulesetId: 'ruleset-1',
    sourceRevision: 'revision-1',
    sourceHash,
    compilerVersion: 'sing-box-1.12.0',
    status: 'pending',
    attempts: 0,
    createdAt: '2026-07-14T12:00:00.000Z',
    updatedAt: '2026-07-14T12:00:00.000Z',
    ...overrides,
  };
}

describe('R2ArtifactStore', () => {
  it('creates and reads an immutable SRS artifact', async () => {
    const store = new R2ArtifactStore(new InMemoryR2Bucket());
    const content = new Uint8Array([0x73, 0x72, 0x73, 0x00]);

    await expect(store.putSrs(artifactIdentity, content)).resolves.toMatchObject({
      ...artifactIdentity,
      size: 4,
    });
    await expect(store.getSrs(artifactIdentity)).resolves.toEqual(content);
  });

  it('treats a repeated write with identical bytes as idempotent', async () => {
    const store = new R2ArtifactStore(new InMemoryR2Bucket());
    const content = new Uint8Array([1, 2, 3]);
    const first = await store.putSrs(artifactIdentity, content);

    await expect(store.putSrs(artifactIdentity, content)).resolves.toEqual(first);
  });

  it('rejects different bytes for an existing artifact identity', async () => {
    const store = new R2ArtifactStore(new InMemoryR2Bucket());
    await store.putSrs(artifactIdentity, new Uint8Array([1, 2, 3]));

    await expect(store.putSrs(artifactIdentity, new Uint8Array([3, 2, 1])))
      .rejects.toBeInstanceOf(ArtifactCollisionError);
  });
});

describe('R2PrivateMetadataStore', () => {
  it('creates, reads, and conditionally updates private credentials', async () => {
    const store = new R2PrivateMetadataStore(new InMemoryR2Bucket());
    const initialVersion = await store.create(credentials());

    await expect(store.read('workspace-1')).resolves.toMatchObject({
      credentials: { github: { pat: 'github-token' } },
      version: initialVersion,
    });

    const next = credentials('rotated-token');
    const nextVersion = await store.update(next, initialVersion);
    expect(nextVersion).not.toBe(initialVersion);
    await expect(store.read('workspace-1')).resolves.toMatchObject({
      credentials: { github: { pat: 'rotated-token' } },
      version: nextVersion,
    });
  });

  it('rejects a credential update with a stale ETag', async () => {
    const store = new R2PrivateMetadataStore(new InMemoryR2Bucket());
    const initialVersion = await store.create(credentials());
    await store.update(credentials('rotated-token'), initialVersion);

    await expect(store.update(credentials('stale-token'), initialVersion))
      .rejects.toBeInstanceOf(WorkspaceConflictError);
  });
});

describe('R2JobStore', () => {
  it('returns an existing deterministic job with the same immutable identity', async () => {
    const store = new R2JobStore(new InMemoryR2Bucket());
    const first = await store.create(job());

    await expect(store.create(job({ status: 'compiling', attempts: 1 }))).resolves.toEqual(first);
  });

  it.each([
    { rulesetId: 'ruleset-2' },
    { sourceRevision: 'revision-2' },
    { sourceHash: 'b'.repeat(64) },
    { compilerVersion: 'sing-box-1.13.0' },
  ])('rejects a reused job ID with changed identity: %o', async override => {
    const store = new R2JobStore(new InMemoryR2Bucket());
    await store.create(job());

    await expect(store.create(job(override))).rejects.toBeInstanceOf(WorkspaceConflictError);
  });

  it('updates job status with the current ETag', async () => {
    const store = new R2JobStore(new InMemoryR2Bucket());
    const created = await store.create(job());
    const compiling = job({ status: 'compiling', attempts: 1, updatedAt: '2026-07-14T12:01:00.000Z' });

    const updated = await store.update(compiling, created.version);
    expect(updated).toMatchObject({ job: { status: 'compiling', attempts: 1 } });
    expect(updated.version).not.toBe(created.version);
  });

  it('rejects a job status update with a stale ETag', async () => {
    const store = new R2JobStore(new InMemoryR2Bucket());
    const created = await store.create(job());
    const updated = await store.update(job({ status: 'compiling' }), created.version);

    await expect(store.update(job({ status: 'ready' }), created.version))
      .rejects.toMatchObject({
        name: 'WorkspaceConflictError',
        expectedRevision: created.version,
        actualRevision: updated.version,
      });
  });
});
