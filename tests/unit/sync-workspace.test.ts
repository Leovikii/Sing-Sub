import { describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '../../shared';
import type {
  SyncDownload,
  SyncFile,
  SyncGateway,
  SyncPushCommand,
  SyncRepositoryConnection,
} from '../../worker/application/ports/sync-gateway';
import { saveProfiles } from '../../worker/application/commands/profiles/save-profiles';
import { exportSyncBusinessFiles, SYNC_MANIFEST_PATH } from '../../worker/application/sync/export-workspace';
import {
  getWorkspaceSyncStatus,
  pullWorkspaceFromGithub,
  pushWorkspaceToGithub,
  SyncConflictError,
} from '../../worker/application/sync/sync-workspace';
import { InMemoryWorkspaceStore } from '../fakes/in-memory-workspace-store';
import { sha256Hex } from '../../worker/domain/revisions/canonical-json';

function snapshot(note = 'base'): WorkspaceSnapshot {
  return {
    schemaVersion: 3,
    workspaceId: 'primary',
    revisionId: 'revision-1',
    previousRevisionId: null,
    createdAt: '2026-07-15T05:00:00.000Z',
    settings: {
      userLogin: 'Administrator', userAvatar: '', authVersion: 1, tokenVersion: 1,
    },
    profiles: [{
      name: 'default', note, templateUrl: '', nodesPath: '', rules: [], inboundRules: [], order: 0,
    }],
    assets: { nodes: {}, templates: {}, rulesets: {} },
    builds: {},
    sync: { status: 'never' },
  };
}

function snapshotWithTemplate(order: 'route-first' | 'log-first'): WorkspaceSnapshot {
  const source = snapshot();
  source.assets.templates.default = {
    path: 'sing-sub/templates/default.json',
    content: order === 'route-first'
      ? { route: {}, log: { level: 'info' } }
      : { log: { level: 'info' }, route: {} },
  };
  return source;
}

class FakeSyncGateway implements SyncGateway {
  remoteRevision = 'commit-1';
  files: SyncFile[] = [];
  pushCalls: SyncPushCommand[] = [];

  async setRemote(source: WorkspaceSnapshot, revision?: string) {
    this.files = (await exportSyncBusinessFiles(source)).files;
    if (revision) this.remoteRevision = revision;
  }

  async download(): Promise<SyncDownload> {
    return { remoteRevision: this.remoteRevision, files: structuredClone(this.files) };
  }

  async push(command: SyncPushCommand): Promise<{ remoteRevision: string }> {
    if (command.expectedRemoteRevision !== this.remoteRevision) throw new Error('unexpected remote revision');
    this.pushCalls.push(structuredClone(command));
    this.files = structuredClone(command.files.filter(file => file.path !== SYNC_MANIFEST_PATH));
    this.remoteRevision = `commit-${Number(this.remoteRevision.split('-')[1] || 1) + 1}`;
    return { remoteRevision: this.remoteRevision };
  }
}

const connection: SyncRepositoryConnection = {
  owner: 'owner', repo: 'private-data', pat: 'token', defaultBranch: 'main',
};

describe('safe directional GitHub sync', () => {
  it('preserves manual timestamps only for unchanged imported assets, including missing legacy times', async () => {
    const local = snapshotWithTemplate('route-first');
    const modifiedAt = '2026-07-15T04:00:00.000Z';
    local.assets.templates.default.updatedAt = modifiedAt;
    local.assets.nodes.legacy = { path: 'sing-sub/nodes/legacy.json', content: {} };
    local.assets.rulesets.manual = {
      path: 'sing-sub/rulesets/manual.json', content: { version: 2, rules: [], _sing_sub: { sources: [] } }, updatedAt: modifiedAt,
    };
    const store = new InMemoryWorkspaceStore('primary', local);
    const gateway = new FakeSyncGateway();
    const remote = structuredClone(local);
    remote.profiles[0].note = 'changed elsewhere';
    remote.assets.nodes.new = { path: 'sing-sub/nodes/new.json', content: {} };
    await gateway.setRemote(remote);
    const dependencies = { workspaceStore: store, gateway, connection };
    const result = await pullWorkspaceFromGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: true,
    });
    const imported = (await store.read('primary')).snapshot;
    expect(imported.assets.templates.default.updatedAt).toBe(modifiedAt);
    expect(imported.assets.rulesets.manual.updatedAt).toBe(modifiedAt);
    expect(imported.assets.nodes.legacy.updatedAt).toBeUndefined();
    expect(imported.assets.nodes.new.updatedAt).toBeUndefined();
    remote.assets.templates.default.content = { log: { level: 'info' }, route: {} };
    await gateway.setRemote(remote, 'commit-2');
    await pullWorkspaceFromGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: result.revision, overwrite: true,
    });
    expect((await store.read('primary')).snapshot.assets.templates.default.updatedAt).toBeUndefined();
  });

  it('only allows an explicit R2 overwrite when the remote tree has an invalid profile schema', async () => {
    const store = new InMemoryWorkspaceStore('primary', snapshot());
    const gateway = new FakeSyncGateway();
    const invalidProfile = JSON.stringify({
      name: 'default',
      unsupported: true,
    });
    gateway.files = [{
      path: 'sing-sub/configs/default.json',
      content: invalidProfile,
      contentHash: await sha256Hex(invalidProfile),
    }];
    const dependencies = { workspaceStore: store, gateway, connection };

    await expect(getWorkspaceSyncStatus(dependencies, 'primary')).resolves.toMatchObject({
      connected: true,
      status: 'conflict',
      requiresResolution: true,
      canPush: false,
      canPull: false,
    });
    await expect(pushWorkspaceToGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: false,
    })).rejects.toMatchObject<Partial<SyncConflictError>>({ status: 'conflict', direction: 'push' });
    await expect(pullWorkspaceFromGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: true,
    })).rejects.toMatchObject({ code: 'INVALID_SCHEMA' });

    const pushed = await pushWorkspaceToGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: true,
    });
    expect(pushed.action).toBe('pushed');
    expect(gateway.pushCalls).toHaveLength(1);
    expect(gateway.pushCalls[0].files.find(file => file.path === 'sing-sub/configs/default.json')?.content)
      .not.toContain('unsupported');
    expect(gateway.pushCalls[0].files.some(file => file.path === SYNC_MANIFEST_PATH)).toBe(true);
  });

  it('requires an explicit side on a different first sync', async () => {
    const store = new InMemoryWorkspaceStore('primary', snapshot());
    const gateway = new FakeSyncGateway();
    const dependencies = { workspaceStore: store, gateway, connection };

    await expect(pushWorkspaceToGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: false,
    })).rejects.toMatchObject<Partial<SyncConflictError>>({ status: 'never', direction: 'push' });
    await expect(pullWorkspaceFromGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: false,
    })).rejects.toMatchObject<Partial<SyncConflictError>>({ status: 'never', direction: 'pull' });

    const pushed = await pushWorkspaceToGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: true,
    });
    expect(pushed.action).toBe('pushed');
    expect(gateway.pushCalls).toHaveLength(1);
    expect(gateway.pushCalls[0].files.some(file => file.path === SYNC_MANIFEST_PATH)).toBe(true);
  });

  it('aligns equal content, permits the safe direction, and blocks divergent changes', async () => {
    const store = new InMemoryWorkspaceStore('primary', snapshot());
    const gateway = new FakeSyncGateway();
    await gateway.setRemote(snapshot());
    const dependencies = { workspaceStore: store, gateway, connection };

    const aligned = await pushWorkspaceToGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: false,
    });
    expect(aligned.action).toBe('aligned');
    expect(gateway.pushCalls).toHaveLength(0);

    await saveProfiles(store, {
      workspaceId: 'primary', expectedRevision: aligned.revision, revisionId: 'revision-3',
      createdAt: '2026-07-15T05:10:00.000Z',
      state: { profiles: snapshot('local').profiles },
    });
    await expect(getWorkspaceSyncStatus(dependencies, 'primary')).resolves.toMatchObject({
      status: 'local-ahead', canPush: true, canPull: false,
    });
    const pushed = await pushWorkspaceToGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-3', overwrite: false,
    });
    expect(pushed.action).toBe('pushed');
    expect(gateway.pushCalls).toHaveLength(1);

    await gateway.setRemote(snapshot('remote'), 'commit-3');
    await expect(getWorkspaceSyncStatus(dependencies, 'primary')).resolves.toMatchObject({
      status: 'remote-ahead', canPush: false, canPull: true,
    });
    const pulled = await pullWorkspaceFromGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: pushed.revision, overwrite: false,
    });
    expect(pulled.action).toBe('pulled');
    await expect(store.read('primary')).resolves.toMatchObject({
      snapshot: { profiles: [{ note: 'remote' }] },
    });

    const localDiverged = await saveProfiles(store, {
      workspaceId: 'primary', expectedRevision: pulled.revision, revisionId: 'revision-7',
      createdAt: '2026-07-15T05:20:00.000Z',
      state: { profiles: snapshot('local-2').profiles },
    });
    await gateway.setRemote(snapshot('remote-2'), 'commit-4');
    await expect(getWorkspaceSyncStatus(dependencies, 'primary')).resolves.toMatchObject({
      status: 'conflict', canPush: false, canPull: false, requiresResolution: true,
    });
    await expect(pushWorkspaceToGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: localDiverged.revision, overwrite: false,
    })).rejects.toBeInstanceOf(SyncConflictError);
    await expect(pullWorkspaceFromGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: localDiverged.revision, overwrite: false,
    })).rejects.toBeInstanceOf(SyncConflictError);

    const overwritten = await pullWorkspaceFromGithub(dependencies, {
      workspaceId: 'primary', expectedRevision: localDiverged.revision, overwrite: true,
    });
    expect(overwritten.action).toBe('pulled');
    await expect(store.read('primary')).resolves.toMatchObject({
      snapshot: { profiles: [{ note: 'remote-2' }] },
    });
  });

  it('applies the selected direction when only JSON object order differs', async () => {
    const pushStore = new InMemoryWorkspaceStore('primary', snapshotWithTemplate('route-first'));
    const pushGateway = new FakeSyncGateway();
    await pushGateway.setRemote(snapshotWithTemplate('route-first'));
    const pushDependencies = { workspaceStore: pushStore, gateway: pushGateway, connection };
    const alignedPush = await pushWorkspaceToGithub(pushDependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: false,
    });
    await pushGateway.setRemote(snapshotWithTemplate('log-first'), 'commit-2');

    await expect(getWorkspaceSyncStatus(pushDependencies, 'primary')).resolves.toMatchObject({
      status: 'synced', sameContent: true, canPush: true, canPull: true,
    });
    const pushed = await pushWorkspaceToGithub(pushDependencies, {
      workspaceId: 'primary', expectedRevision: alignedPush.revision, overwrite: false,
    });
    expect(pushed.action).toBe('pushed');
    const pushedTemplate = pushGateway.pushCalls.at(-1)!.files
      .find(file => file.path === 'sing-sub/templates/default.json')!.content;
    expect(pushedTemplate.indexOf('"route"')).toBeLessThan(pushedTemplate.indexOf('"log"'));

    const pullStore = new InMemoryWorkspaceStore('primary', snapshotWithTemplate('route-first'));
    const pullGateway = new FakeSyncGateway();
    await pullGateway.setRemote(snapshotWithTemplate('route-first'));
    const pullDependencies = { workspaceStore: pullStore, gateway: pullGateway, connection };
    const alignedPull = await pullWorkspaceFromGithub(pullDependencies, {
      workspaceId: 'primary', expectedRevision: 'revision-1', overwrite: false,
    });
    await pullGateway.setRemote(snapshotWithTemplate('log-first'), 'commit-2');
    const pulled = await pullWorkspaceFromGithub(pullDependencies, {
      workspaceId: 'primary', expectedRevision: alignedPull.revision, overwrite: false,
    });
    expect(pulled.action).toBe('pulled');
    const pulledSnapshot = (await pullStore.read('primary')).snapshot;
    expect(Object.keys(pulledSnapshot.assets.templates.default.content as Record<string, unknown>))
      .toEqual(['log', 'route']);
  });
});
