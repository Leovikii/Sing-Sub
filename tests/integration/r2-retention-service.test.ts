import { describe, expect, it } from 'vitest';
import type { BuildJob, SrsArtifactPointer, WorkspaceSnapshot } from '../../shared';
import type { SrsArtifactDescriptor } from '../../worker/application/ports/artifact-store';
import { canonicalJson } from '../../worker/domain/revisions/canonical-json';
import { R2ArtifactStore } from '../../worker/infrastructure/r2/r2-artifact-store';
import { R2JobStore } from '../../worker/infrastructure/r2/r2-job-store';
import { r2ObjectKeys } from '../../worker/infrastructure/r2/r2-object-keys';
import {
  R2RetentionService,
  RetentionHeadChangedError,
} from '../../worker/infrastructure/r2/r2-retention-service';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';

const hashes = {
  a: 'a'.repeat(64),
  b: 'b'.repeat(64),
  c: 'c'.repeat(64),
  d: 'd'.repeat(64),
};

function snapshot(
  revisionId: string,
  previousRevisionId: string | null,
  createdAt: string,
  jobId: string,
  artifact: SrsArtifactPointer,
  baseWorkspaceRevision?: string,
): WorkspaceSnapshot {
  return {
    schemaVersion: 2,
    workspaceId: 'workspace-1',
    revisionId,
    previousRevisionId,
    createdAt,
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
    assets: { nodes: {}, templates: {}, adapters: {}, rulesets: {} },
    builds: {
      'ruleset-1': {
        jobId,
        rulesetId: 'ruleset-1',
        sourceHash: artifact.sourceHash,
        compilerVersion: 'sing-box-1.12.0',
        status: 'ready',
        activeArtifact: artifact,
        updatedAt: createdAt,
      },
    },
    sync: baseWorkspaceRevision ? {
      status: 'synced',
      baseWorkspaceRevision,
      baseRemoteRevision: 'commit-base',
      baseContentHash: hashes.a,
      baseRepository: 'owner/repo',
    } : { status: 'synced' },
  };
}

function job(jobId: string, revision: string, sourceHash: string, updatedAt: string): BuildJob {
  return {
    schemaVersion: 1,
    jobId,
    workspaceId: 'workspace-1',
    rulesetId: 'ruleset-1',
    sourceRevision: revision,
    sourceHash,
    compilerVersion: 'sing-box-1.12.0',
    status: 'ready',
    attempts: 1,
    createdAt: updatedAt,
    updatedAt,
  };
}

function pointer(artifact: SrsArtifactDescriptor, createdAt: string): SrsArtifactPointer {
  return {
    rulesetId: artifact.rulesetId,
    sourceHash: artifact.sourceHash,
    contentHash: artifact.contentHash,
    size: artifact.size,
    createdAt,
  };
}

async function fixture(baseWorkspaceRevision?: string) {
  let currentTime = new Date('2026-07-01T00:00:00.000Z');
  const bucket = new InMemoryR2Bucket(() => new Date(currentTime));
  const artifacts = new R2ArtifactStore(bucket);
  const jobs = new R2JobStore(bucket);
  const workspaces = new R2WorkspaceStore(bucket);

  const artifactA = await artifacts.putSrs(
    { workspaceId: 'workspace-1', rulesetId: 'ruleset-1', sourceHash: hashes.a },
    new Uint8Array([1]),
  );
  await jobs.create(job('job-1', 'revision-1', hashes.a, currentTime.toISOString()));
  await workspaces.create({
    workspaceId: 'workspace-1',
    snapshot: snapshot(
      'revision-1',
      null,
      currentTime.toISOString(),
      'job-1',
      pointer(artifactA, currentTime.toISOString()),
    ),
  });

  currentTime = new Date('2026-07-02T00:00:00.000Z');
  const artifactB = await artifacts.putSrs(
    { workspaceId: 'workspace-1', rulesetId: 'ruleset-1', sourceHash: hashes.b },
    new Uint8Array([2]),
  );
  await jobs.create(job('job-2', 'revision-2', hashes.b, currentTime.toISOString()));
  await workspaces.publish({
    workspaceId: 'workspace-1',
    expectedRevision: 'revision-1',
    snapshot: snapshot(
      'revision-2',
      'revision-1',
      currentTime.toISOString(),
      'job-2',
      pointer(artifactB, currentTime.toISOString()),
    ),
  });

  currentTime = new Date('2026-07-03T00:00:00.000Z');
  const artifactC = await artifacts.putSrs(
    { workspaceId: 'workspace-1', rulesetId: 'ruleset-1', sourceHash: hashes.c },
    new Uint8Array([3]),
  );
  await jobs.create(job('job-3', 'revision-3', hashes.c, currentTime.toISOString()));
  await workspaces.publish({
    workspaceId: 'workspace-1',
    expectedRevision: 'revision-2',
    snapshot: snapshot(
      'revision-3',
      'revision-2',
      currentTime.toISOString(),
      'job-3',
      pointer(artifactC, currentTime.toISOString()),
      baseWorkspaceRevision,
    ),
  });

  currentTime = new Date('2026-07-04T00:00:00.000Z');
  await artifacts.putSrs(
    { workspaceId: 'workspace-1', rulesetId: 'ruleset-1', sourceHash: hashes.d },
    new Uint8Array([4]),
  );

  const now = new Date('2026-07-10T00:00:00.000Z');
  const retention = new R2RetentionService(bucket, () => now);
  return { bucket, retention };
}

const policy = { revisionLimit: 1, artifactHistoryLimit: 1, orphanGraceSeconds: 86400 };

describe('R2RetentionService', () => {
  it('removes old unreferenced revisions, artifacts, and jobs', async () => {
    const { bucket, retention } = await fixture();

    await expect(retention.pruneWorkspace('workspace-1', policy)).resolves.toEqual({
      deletedRevisions: 1,
      deletedArtifacts: 1,
      deletedJobs: 2,
      skippedUnknown: 0,
      dryRun: false,
    });
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-1'))).toBe(false);
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-2'))).toBe(true);
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-3'))).toBe(true);
    expect(bucket.has(r2ObjectKeys.srsArtifact('workspace-1', 'ruleset-1', hashes.a))).toBe(false);
    expect(bucket.has(r2ObjectKeys.srsArtifact('workspace-1', 'ruleset-1', hashes.b))).toBe(true);
    expect(bucket.has(r2ObjectKeys.srsArtifact('workspace-1', 'ruleset-1', hashes.c))).toBe(true);
    expect(bucket.has(r2ObjectKeys.srsArtifact('workspace-1', 'ruleset-1', hashes.d))).toBe(true);
    expect(bucket.has(r2ObjectKeys.job('workspace-1', 'job-3'))).toBe(true);
  });

  it('protects the local sync-base revision', async () => {
    const { bucket, retention } = await fixture('revision-1');

    const report = await retention.pruneWorkspace('workspace-1', policy);

    expect(report.deletedRevisions).toBe(0);
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-1'))).toBe(true);
  });

  it('supports a dry run without deleting planned objects', async () => {
    const { bucket, retention } = await fixture();

    const report = await retention.pruneWorkspace('workspace-1', policy, true);

    expect(report).toMatchObject({ deletedRevisions: 1, deletedArtifacts: 1, deletedJobs: 2, dryRun: true });
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-1'))).toBe(true);
  });

  it('aborts all deletion when head changes during planning', async () => {
    const { bucket, retention } = await fixture();
    bucket.replaceOnFutureGet(r2ObjectKeys.head('workspace-1'), 2, canonicalJson({
      schemaVersion: 1,
      workspaceId: 'workspace-1',
      currentRevision: 'revision-race',
      previousRevision: 'revision-3',
      updatedAt: '2026-07-10T00:00:00.000Z',
      contentHash: hashes.a,
    }));

    await expect(retention.pruneWorkspace('workspace-1', policy))
      .rejects.toBeInstanceOf(RetentionHeadChangedError);
    expect(bucket.has(r2ObjectKeys.revision('workspace-1', 'revision-1'))).toBe(true);
    expect(bucket.has(r2ObjectKeys.srsArtifact('workspace-1', 'ruleset-1', hashes.a))).toBe(true);
  });
});
