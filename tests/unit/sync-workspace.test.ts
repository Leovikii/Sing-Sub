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

function snapshot(note = 'base'): WorkspaceSnapshot {
  return {
    schemaVersion: 2,
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
    assets: { nodes: {}, templates: {}, adapters: {}, rulesets: {} },
    builds: {},
    sync: { status: 'never' },
  };
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
});
