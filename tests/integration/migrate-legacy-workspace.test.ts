import { describe, expect, it } from 'vitest';
import type { NormalizedLegacyWorkspace } from '../../worker/application/migration/legacy-migration-model';
import {
  migrateLegacyWorkspace,
  MigrationTargetConflictError,
} from '../../worker/application/migration/migrate-legacy-workspace';
import { R2PrivateMetadataStore } from '../../worker/infrastructure/r2/r2-private-metadata-store';
import { r2ObjectKeys } from '../../worker/infrastructure/r2/r2-object-keys';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';
import { MOMO_ADAPTER_PRESET, type WorkspaceSnapshot } from '../../shared';
import { exportSyncBusinessFiles } from '../../worker/application/sync/export-workspace';
import { dryRunLegacyMigration } from '../../worker/infrastructure/legacy/legacy-migration-dry-run';

const migratedAt = '2026-07-14T12:00:00.000Z';

function normalized(): NormalizedLegacyWorkspace {
  return {
    source: {
      owner: 'owner',
      repo: 'repo',
      branch: 'main',
      commitSha: 'commit-1',
      files: [],
    },
    settings: {
      pat: 'github-token',
      owner: 'owner',
      repo: 'repo',
      userLogin: 'user',
      userAvatar: '',
      defaultBranch: 'main',
    },
    profiles: [],
    assets: { nodes: {}, templates: {}, adapters: {}, rulesets: {} },
  };
}

function command() {
  return {
    workspaceId: 'workspace-1',
    revisionId: 'revision-1',
    migratedAt,
    normalized: normalized(),
  };
}

describe('migrateLegacyWorkspace', () => {
  it('creates the first workspace revision, migration record, and private credentials', async () => {
    const bucket = new InMemoryR2Bucket();
    const workspaceStore = new R2WorkspaceStore(bucket);
    const privateMetadataStore = new R2PrivateMetadataStore(bucket);

    await expect(migrateLegacyWorkspace(command(), { workspaceStore, privateMetadataStore }))
      .resolves.toEqual({ workspaceId: 'workspace-1', revision: 'revision-1', previousRevision: null });
    await expect(workspaceStore.read('workspace-1')).resolves.toMatchObject({
      snapshot: {
        settings: { authVersion: 1, tokenVersion: 1 },
        migration: { source: 'github-import', commitSha: 'commit-1', migratedAt },
      },
    });
    await expect(privateMetadataStore.read('workspace-1')).resolves.toMatchObject({
      credentials: { github: { pat: 'github-token' } },
    });
    const revision = await bucket.get(r2ObjectKeys.revision('workspace-1', 'revision-1'));
    expect(await revision?.text()).not.toContain('github-token');
  });

  it('rejects a target with existing private metadata before creating a visible head', async () => {
    const bucket = new InMemoryR2Bucket();
    const workspaceStore = new R2WorkspaceStore(bucket);
    const privateMetadataStore = new R2PrivateMetadataStore(bucket);
    await privateMetadataStore.create({
      schemaVersion: 1,
      workspaceId: 'workspace-1',
      github: { pat: 'other', owner: 'other', repo: 'repo', defaultBranch: 'main' },
      updatedAt: migratedAt,
    });

    await expect(migrateLegacyWorkspace(command(), { workspaceStore, privateMetadataStore }))
      .rejects.toBeInstanceOf(MigrationTargetConflictError);
    expect(bucket.has(r2ObjectKeys.head('workspace-1'))).toBe(false);
    await expect(privateMetadataStore.read('workspace-1')).resolves.toMatchObject({
      credentials: { github: { pat: 'other' } },
    });
  });

  it('does not overwrite an existing workspace head', async () => {
    const bucket = new InMemoryR2Bucket();
    const workspaceStore = new R2WorkspaceStore(bucket);
    const privateMetadataStore = new R2PrivateMetadataStore(bucket);
    await migrateLegacyWorkspace(command(), { workspaceStore, privateMetadataStore });
    const existing = (await workspaceStore.read('workspace-1')).snapshot;
    await workspaceStore.create({
      workspaceId: 'workspace-2',
      snapshot: {
        ...existing,
        workspaceId: 'workspace-2',
        revisionId: 'existing-revision',
      },
    });

    await expect(migrateLegacyWorkspace({
      ...command(),
      workspaceId: 'workspace-2',
      revisionId: 'revision-2',
    }, { workspaceStore, privateMetadataStore })).rejects.toThrow('Workspace already exists');
    await expect(privateMetadataStore.read('workspace-2')).resolves.toBeNull();
  });

  it('restores an exported editable tree and records the pinned GitHub commit as its sync base', async () => {
    const original: WorkspaceSnapshot = {
      schemaVersion: 2,
      workspaceId: 'primary',
      revisionId: 'source-revision',
      previousRevisionId: null,
      createdAt: migratedAt,
      settings: { userLogin: 'Administrator', userAvatar: '', authVersion: 1, tokenVersion: 1 },
      profiles: [{
        name: 'default', templateUrl: '', nodesPath: 'sing-sub/nodes/default.json',
        rules: [], inboundRules: [], order: 0,
      }],
      assets: {
        nodes: { default: { path: 'sing-sub/nodes/default.json', content: [{ tag: 'proxy' }] } },
        templates: {},
        adapters: {
          momo: {
            path: 'sing-sub/adapters/momo.json',
            note: 'OpenWrt Momo',
            content: MOMO_ADAPTER_PRESET,
          },
        },
        rulesets: {},
      },
      builds: {},
      sync: { status: 'never' },
    };
    const exported = await exportSyncBusinessFiles(original);
    const settings = normalized().settings;
    const source = {
      owner: settings.owner,
      repo: settings.repo,
      branch: settings.defaultBranch,
      commitSha: 'recovery-commit',
      files: exported.files.map(file => ({
        path: file.path,
        blobSha: file.contentHash,
        content: file.content,
        size: Buffer.byteLength(file.content),
      })),
    };
    const dryRun = dryRunLegacyMigration(source, settings);
    expect(dryRun.valid).toBe(true);
    expect(dryRun.normalized).toBeDefined();
    const bucket = new InMemoryR2Bucket();
    const workspaceStore = new R2WorkspaceStore(bucket);
    const privateMetadataStore = new R2PrivateMetadataStore(bucket);

    await migrateLegacyWorkspace({
      workspaceId: 'primary',
      revisionId: 'recovered-revision',
      migratedAt,
      normalized: dryRun.normalized!,
    }, { workspaceStore, privateMetadataStore });

    await expect(workspaceStore.read('primary')).resolves.toMatchObject({
      snapshot: {
        profiles: original.profiles,
        assets: original.assets,
        sync: {
          status: 'synced',
          baseWorkspaceRevision: 'recovered-revision',
          baseRemoteRevision: 'recovery-commit',
          baseRepository: 'owner/repo',
          baseContentHash: exported.contentHash,
        },
      },
    });
  });
});
