import { describe, expect, it } from 'vitest';
import { exportSyncBusinessFiles, SYNC_METADATA_PATH } from '../../worker/application/sync/export-workspace';
import { importSyncTree } from '../../worker/application/sync/import-sync-tree';
import { parseStrictJson } from '../../worker/lib/strict-json';
import { normalizeWorkspace, persistWorkspace, projectWorkspace } from '../../worker/lib/workspace-metadata';
import { legacySnapshot } from '../fakes/metadata-fixture';
import { InMemoryWorkspaceStore } from '../fakes/in-memory-workspace-store';
import { getWorkspaceSyncStatus, pullWorkspaceFromGithub, pushWorkspaceToGithub } from '../../worker/application/sync/sync-workspace';
import type { SyncFile, SyncGateway } from '../../worker/application/ports/sync-gateway';

async function exported() { return exportSyncBusinessFiles(normalizeWorkspace(legacySnapshot())); }
function editMetadata(files: SyncFile[], edit: (document: { entities: Record<string, Record<string, unknown>> }) => void) {
  const file = files.find(file => file.path === SYNC_METADATA_PATH)!;
  const document = JSON.parse(file.content); edit(document); file.content = JSON.stringify(document);
}
describe('metadata sync format', () => {
  it('preserves valid remote times and never borrows a local time for a different note', async () => {
    for (const remoteTime of ['2026-10-16T01:00:00.000Z', undefined]) {
      const source = normalizeWorkspace(legacySnapshot());
      const remote = structuredClone(source); const path = 'sing-sub/templates/base.json';
      remote.assets.templates.base.note = 'remote note';
      delete remote.assets.templates.base.updatedAt;
      remote.metadata!.entities[path].note = 'remote note';
      if (remoteTime) remote.metadata!.entities[path].updatedAt = remoteTime;
      else delete remote.metadata!.entities[path].updatedAt;
      const files = (await exportSyncBusinessFiles(remote)).files;
      const store = new InMemoryWorkspaceStore('primary', source);
      const gateway: SyncGateway = { download: async () => ({ remoteRevision: 'c1', files }), push: async () => { throw new Error('Unexpected push'); } };
      await pullWorkspaceFromGithub({ workspaceStore: store, gateway, connection: { owner: 'owner', repo: 'repo', pat: 'test', defaultBranch: 'main' } }, { workspaceId: 'primary', expectedRevision: 'r1', overwrite: true });
      expect((await store.read('primary')).snapshot.metadata!.entities[path].updatedAt).toBe(remoteTime);
    }
  });
  it('round trips one sidecar and pure bodies with stable hashes, including note-only edits', async () => {
    const first = await exported();
    const imported = await importSyncTree(first.files);
    const second = await exportSyncBusinessFiles(imported);
    expect(second).toEqual(first);
    expect(first.files.filter(file => file.path === SYNC_METADATA_PATH)).toHaveLength(1);
    expect(first.files.find(file => file.path.endsWith('/home.json'))!.content).not.toContain('private-profile');
    editMetadata(first.files, document => { document.entities['sing-sub/configs/home.json'].note = 'other-device'; });
    const changed = await importSyncTree(first.files);
    expect(changed.contentHash).not.toBe(imported.contentHash);
    expect(changed.profiles[0].note).toBe('other-device');
  });
  it('requires complete new-format metadata and never downgrades damaged trees', async () => {
    const tree = await exported();
    await expect(importSyncTree(tree.files.filter(file => file.path !== SYNC_METADATA_PATH), { requireMetadata: true })).rejects.toMatchObject({ path: SYNC_METADATA_PATH });
    editMetadata(tree.files, document => { delete document.entities['sing-sub/templates/base.json']; });
    await expect(importSyncTree(tree.files)).rejects.toMatchObject({ code: 'INVALID_SCHEMA' });
    await expect(importSyncTree([], { manifestContent: '{"schemaVersion":3}' })).rejects.toMatchObject({ path: SYNC_METADATA_PATH });
  });
  it('does not invent optional profile metadata or borrow a missing repository time', async () => {
    const tree = await exported();
    editMetadata(tree.files, document => {
      delete document.entities['sing-sub/configs/home.json'].order;
      document.entities['sing-sub/configs/home.json'].createdAt = '2026-10-14T00:00:00Z';
      document.entities['sing-sub/configs/home.json'].updatedAt = '2026-10-15T00:00:00Z';
      delete document.entities['sing-sub/templates/base.json'].updatedAt;
    });
    const imported = await importSyncTree(tree.files);
    const source = normalizeWorkspace(legacySnapshot());
    const store = new InMemoryWorkspaceStore('primary', source);
    const gateway: SyncGateway = { download: async () => ({ remoteRevision: 'c1', files: tree.files }), push: async () => { throw new Error('Unexpected push'); } };
    await pullWorkspaceFromGithub({ workspaceStore: store, gateway, connection: { owner: 'owner', repo: 'repo', pat: 'test', defaultBranch: 'main' } }, { workspaceId: 'primary', expectedRevision: 'r1', overwrite: true });
    expect((await store.read('primary')).snapshot.assets.templates.base.updatedAt).toBeUndefined();
    expect((await exportSyncBusinessFiles(imported)).serializedHash).toBe(imported.serializedHash);
  });
  it('treats an IDE field reorder as representation-only without changing the sidecar', async () => {
    const source = normalizeWorkspace(legacySnapshot());
    source.assets.templates.base.content = { route: {}, log: { level: 'info' } };
    const tree = await exportSyncBusinessFiles(source);
    tree.files.find(file => file.path === 'sing-sub/templates/base.json')!.content = '{"log":{"level":"info"},"route":{}}';
    const imported = await importSyncTree(tree.files);
    expect(imported.contentHash).toBe(tree.contentHash);
    expect(imported.serializedHash).not.toBe(tree.serializedHash);
    expect((await exportSyncBusinessFiles(imported)).serializedHash).toBe(imported.serializedHash);
  });
  it('preserves repository metadata and times when a body is edited independently', async () => {
    const source = normalizeWorkspace(legacySnapshot());
    source.assets.rulesets.ad = { path: 'sing-sub/rulesets/ad.json', content: { version: 2, rules: [{ domain: ['before.com'] }] } };
    source.metadata!.entities['sing-sub/rulesets/ad.json'] = { note: 'ad', order: 0, updatedAt: '2026-10-15T00:00:00.000Z', editor: { ruleset: { manual: { domain: ['before.com'] }, sources: [] } } };
    const tree = await exportSyncBusinessFiles(source);
    const originalMetadata = JSON.parse(tree.files.find(file => file.path === SYNC_METADATA_PATH)!.content);
    tree.files.find(file => file.path === 'sing-sub/rulesets/ad.json')!.content = '{"version":2,"rules":[{"domain":["after.com"]}]}';
    const imported = await importSyncTree(tree.files);
    const metadata = imported.metadata.entities['sing-sub/rulesets/ad.json'];
    expect(metadata.note).toBe('ad'); expect(metadata.order).toBe(0);
    expect(metadata.updatedAt).toBe('2026-10-15T00:00:00.000Z');
    expect(metadata.editor?.ruleset?.needsReview).toBeUndefined();
    expect(imported.assets.rulesets.ad.content).toEqual({ version: 2, rules: [{ domain: ['after.com'] }] });
    const roundTrip = await exportSyncBusinessFiles(imported);
    expect(imported.contentHash).toBe(roundTrip.contentHash);
    expect(imported.serializedHash).toBe(roundTrip.serializedHash);
    expect(JSON.parse(roundTrip.files.find(file => file.path === SYNC_METADATA_PATH)!.content)).toEqual(originalMetadata);
    expect(imported.warnings).toEqual([]);
  });
  it('keeps template display metadata and known profile/asset times through persisted pull and repeated IDE edits', async () => {
    const source = normalizeWorkspace(legacySnapshot());
    const templatePath = 'sing-sub/templates/base.json';
    const profilePath = 'sing-sub/configs/home.json';
    source.metadata!.entities[templatePath].display = { outboundOrder: ['proxy', 'other'] };
    const original = await exportSyncBusinessFiles(source);
    const files = structuredClone(original.files);
    let remoteRevision = 'c1';
    let pushCalls = 0;
    const store = new InMemoryWorkspaceStore('primary', source);
    const gateway: SyncGateway = {
      download: async () => ({ remoteRevision, files: structuredClone(files) }),
      push: async () => { pushCalls++; throw new Error('Pull must not write GitHub'); },
    };
    const dependencies = { workspaceStore: store, gateway, connection: { owner: 'owner', repo: 'repo', pat: 'test', defaultBranch: 'main' } };
    const aligned = await pullWorkspaceFromGithub(dependencies, { workspaceId: 'primary', expectedRevision: 'r1', overwrite: false });
    let revision = aligned.revision;
    for (const level of ['debug', 'warn']) {
      files.find(file => file.path === templatePath)!.content = JSON.stringify({ log: { level }, outbounds: [] });
      const profile = JSON.parse(files.find(file => file.path === profilePath)!.content);
      profile.rules = [{ group: level, filters: [] }];
      files.find(file => file.path === profilePath)!.content = JSON.stringify(profile);
      remoteRevision += 'a';
      expect(await getWorkspaceSyncStatus(dependencies, 'primary')).toMatchObject({ status: 'remote-ahead', canPull: true, requiresResolution: false });
      const pulled = await pullWorkspaceFromGithub(dependencies, { workspaceId: 'primary', expectedRevision: revision, overwrite: false });
      expect(pulled.warnings).not.toEqual(expect.arrayContaining([expect.stringContaining('timestamp')]));
      revision = pulled.revision;
      const current = (await store.read('primary')).snapshot;
      const persisted = projectWorkspace(persistWorkspace(current));
      expect(persisted.assets.templates.base.updatedAt).toBe(source.assets.templates.base.updatedAt);
      expect(persisted.profiles[0].updated_at).toBe(source.profiles[0].updated_at);
      const exported = await exportSyncBusinessFiles(persisted);
      expect(exported.files.find(file => file.path === SYNC_METADATA_PATH)!.content).toBe(original.files.find(file => file.path === SYNC_METADATA_PATH)!.content);
      expect(await getWorkspaceSyncStatus(dependencies, 'primary')).toMatchObject({
        status: 'synced', sameContent: true, canPull: true,
        local: { changes: { added: [], modified: [], deleted: [] } },
        remote: { changes: { added: [], modified: [], deleted: [] } },
      });
      expect((await pullWorkspaceFromGithub(dependencies, { workspaceId: 'primary', expectedRevision: revision, overwrite: false })).action).toBe('noop');
    }
    expect(pushCalls).toBe(0);
  });
  it('allows a safe pull to restore repository metadata after a previous version cleared it', async () => {
    const source = normalizeWorkspace(legacySnapshot());
    const path = 'sing-sub/templates/base.json';
    const tree = await exportSyncBusinessFiles(source);
    tree.files.find(file => file.path === path)!.content = '{"outbounds":[]}';
    const remote = await importSyncTree(tree.files);
    const sanitized = { ...source, profiles: remote.profiles, assets: remote.assets, metadata: remote.metadata };
    delete sanitized.assets.templates.base.updatedAt;
    delete sanitized.metadata.entities[path].updatedAt;
    delete sanitized.metadata.entities[path].contentHash;
    const localBase = await exportSyncBusinessFiles(sanitized);
    const store = new InMemoryWorkspaceStore('primary', sanitized);
    await store.publish({ workspaceId: 'primary', expectedRevision: 'r1', snapshot: {
      ...sanitized, revisionId: 'r2', previousRevisionId: 'r1', sync: {
        status: 'local-ahead', baseRepository: 'owner/repo', baseFormatVersion: 3,
        baseWorkspaceRevision: 'r1', baseRemoteRevision: 'c1', baseContentHash: remote.contentHash,
        baseWorkspaceContentHash: localBase.contentHash,
      },
    } });
    const gateway: SyncGateway = { download: async () => ({ remoteRevision: 'c1', files: structuredClone(tree.files) }), push: async () => { throw new Error('Unexpected push'); } };
    const dependencies = { workspaceStore: store, gateway, connection: { owner: 'owner', repo: 'repo', pat: 'test', defaultBranch: 'main' } };
    expect(await getWorkspaceSyncStatus(dependencies, 'primary')).toMatchObject({ canPull: true, requiresResolution: false, local: { changedFromBase: false } });
    const pulled = await pullWorkspaceFromGithub(dependencies, { workspaceId: 'primary', expectedRevision: 'r2', overwrite: false });
    expect((await store.read('primary')).snapshot.assets.templates.base.updatedAt).toBe(source.assets.templates.base.updatedAt);
    expect(await getWorkspaceSyncStatus(dependencies, 'primary')).toMatchObject({ status: 'synced' });
    expect(pulled.action).toBe('pulled');
  });
  it('warns about orphan records without resurrecting deleted entities', async () => {
    const tree = await exported();
    tree.files = tree.files.filter(file => file.path !== 'sing-sub/templates/base.json');
    const imported = await importSyncTree(tree.files);
    expect(imported.metadata.entities['sing-sub/templates/base.json']).toBeUndefined();
    expect(imported.warnings[0]).toContain('orphan');
  });
  it('keeps unassociated annotations with a warning and rejects private source URLs', async () => {
    const tree = await exported();
    tree.files.find(file => file.path === 'sing-sub/templates/base.json')!.content = '{"outbounds":[]}';
    expect((await importSyncTree(tree.files)).warnings.some(message => message.includes('annotation outbound/proxy'))).toBe(true);
    editMetadata(tree.files, document => { document.entities['sing-sub/rulesets/ad.json'] = { contentHash: 'a'.repeat(64), editor: { ruleset: { manual: {}, sources: [{ url: 'https://127.0.0.1/rules.json', intervalHours: 0 }] } } }; });
    await expect(importSyncTree(tree.files)).rejects.toMatchObject({ code: 'INVALID_SCHEMA', path: 'sing-sub/rulesets/ad.json' });
  });
  it('rejects duplicate escaped JSON keys and case-colliding metadata identities', async () => {
    expect(() => parseStrictJson('{"a":1,"a":2}')).toThrow('Duplicate');
    expect(() => parseStrictJson('{"a":1,"\\u0061":2}')).toThrow('Duplicate');
    expect(parseStrictJson('{"a":[{"b":1},{"b":2}],"c":true}')).toEqual({ a: [{ b: 1 }, { b: 2 }], c: true });
    const tree = await exported();
    editMetadata(tree.files, document => { document.entities['sing-sub/templates/Base.json'] = document.entities['sing-sub/templates/base.json']; });
    await expect(importSyncTree(tree.files)).rejects.toMatchObject({ code: 'INVALID_SCHEMA' });
  });
  it('verifies an old base with the v2 projection and upgrades it without resetting B/L/G', async () => {
    const source = legacySnapshot();
    const old = await exportSyncBusinessFiles(source, 2);
    const store = new InMemoryWorkspaceStore('primary', source);
    await store.publish({ workspaceId: 'primary', expectedRevision: 'r1', snapshot: { ...source, revisionId: 'r2', previousRevisionId: 'r1', sync: {
      status: 'synced', baseWorkspaceRevision: 'r1', baseRemoteRevision: 'c1', baseContentHash: old.contentHash, baseRepository: 'owner/repo',
    } } });
    let files = old.files;
    const gateway: SyncGateway = { download: async () => ({ remoteRevision: 'c1', files }), push: async command => { files = command.files.filter(file => !file.path.endsWith('/manifest.json')); return { remoteRevision: 'c2' }; } };
    const dependencies = { workspaceStore: store, gateway, connection: { owner: 'owner', repo: 'repo', pat: 'secret', defaultBranch: 'main' } };
    expect(await getWorkspaceSyncStatus(dependencies, 'primary')).toMatchObject({ status: 'local-ahead', canPush: true });
    await pushWorkspaceToGithub(dependencies, { workspaceId: 'primary', expectedRevision: 'r2', overwrite: false });
    expect((await store.read('primary')).snapshot.sync.baseFormatVersion).toBe(3);
    expect(await getWorkspaceSyncStatus(dependencies, 'primary')).toMatchObject({ status: 'synced' });
  });
});
