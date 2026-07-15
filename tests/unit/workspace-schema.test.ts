import { describe, expect, it } from 'vitest';
import {
  buildJobSchema,
  privateCredentialsSchema,
  workspaceHeadSchema,
  workspaceSnapshotSchema,
} from '../../shared';
import { r2ObjectKeys } from '../../worker/infrastructure/r2/r2-object-keys';

const hash = 'a'.repeat(64);
const now = '2026-07-14T12:00:00.000Z';

const snapshot = {
  schemaVersion: 1,
  workspaceId: 'workspace-1',
  revisionId: 'revision-1',
  previousRevisionId: null,
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

describe('R2 workspace schemas', () => {
  it('accepts the canonical version 1 workspace and head', () => {
    expect(workspaceSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(workspaceHeadSchema.safeParse({
      schemaVersion: 1,
      workspaceId: 'workspace-1',
      currentRevision: 'revision-1',
      previousRevision: null,
      updatedAt: now,
      contentHash: hash,
    }).success).toBe(true);
  });

  it('accepts a local workspace without GitHub and rejects partial coordinates', () => {
    const local = structuredClone(snapshot);
    delete (local.settings as Partial<typeof local.settings>).owner;
    delete (local.settings as Partial<typeof local.settings>).repo;
    delete (local.settings as Partial<typeof local.settings>).defaultBranch;
    expect(workspaceSnapshotSchema.safeParse(local).success).toBe(true);

    local.settings.owner = 'owner';
    expect(workspaceSnapshotSchema.safeParse(local).success).toBe(false);
  });

  it('rejects secrets and unknown fields in exportable revisions', () => {
    expect(workspaceSnapshotSchema.safeParse({ ...snapshot, pat: 'secret' }).success).toBe(false);
  });

  it('keeps GitHub credentials in a separate private schema', () => {
    expect(privateCredentialsSchema.safeParse({
      schemaVersion: 1,
      workspaceId: 'workspace-1',
      github: { pat: 'secret', owner: 'owner', repo: 'repo', defaultBranch: 'main' },
      updatedAt: now,
    }).success).toBe(true);
  });

  it('validates deterministic build job identity fields', () => {
    expect(buildJobSchema.safeParse({
      schemaVersion: 1,
      jobId: 'job-1',
      workspaceId: 'workspace-1',
      rulesetId: 'private-domains',
      sourceRevision: 'revision-1',
      sourceHash: hash,
      compilerVersion: '1.12.0',
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    }).success).toBe(true);
  });
});

describe('R2 object key codec', () => {
  it('generates scoped keys for every object family', () => {
    expect(r2ObjectKeys.head('workspace-1')).toBe('workspaces/workspace-1/head.json');
    expect(r2ObjectKeys.revision('workspace-1', 'revision-1'))
      .toBe('workspaces/workspace-1/revisions/revision-1.json');
    expect(r2ObjectKeys.privateCredentials('workspace-1'))
      .toBe('workspaces/workspace-1/private/credentials.json');
    expect(r2ObjectKeys.job('workspace-1', 'job-1'))
      .toBe('workspaces/workspace-1/jobs/job-1.json');
    expect(r2ObjectKeys.srsArtifact('workspace-1', 'private.domains', hash))
      .toBe(`workspaces/workspace-1/artifacts/srs/private.domains/${hash}.srs`);
  });

  it.each(['', '../other', 'nested/id', '.hidden'])('rejects unsafe segment %s', value => {
    expect(() => r2ObjectKeys.head(value)).toThrow('Invalid R2 workspace ID');
  });
});
