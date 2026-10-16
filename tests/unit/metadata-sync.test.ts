import { describe, expect, it } from 'vitest';
import { exportSyncBusinessFiles, SYNC_METADATA_PATH } from '../../worker/application/sync/export-workspace';
import { importSyncTree } from '../../worker/application/sync/import-sync-tree';
import { parseStrictJson } from '../../worker/lib/strict-json';
import { normalizeWorkspace } from '../../worker/lib/workspace-metadata';
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
  it('invalidates stale times and editor definitions while retaining notes/order and the actual remote digest', async () => {
    const source = normalizeWorkspace(legacySnapshot());
    source.assets.rulesets.ad = { path: 'sing-sub/rulesets/ad.json', content: { version: 2, rules: [{ domain: ['before.com'] }] } };
    source.metadata!.entities['sing-sub/rulesets/ad.json'] = { note: 'ad', order: 0, updatedAt: '2026-10-15T00:00:00.000Z', editor: { ruleset: { manual: { domain: ['before.com'] }, sources: [] } } };
    const tree = await exportSyncBusinessFiles(source);
    tree.files.find(file => file.path === 'sing-sub/rulesets/ad.json')!.content = '{"version":2,"rules":[{"domain":["after.com"]}]}';
    const imported = await importSyncTree(tree.files);
    const metadata = imported.metadata.entities['sing-sub/rulesets/ad.json'];
    expect(metadata.note).toBe('ad'); expect(metadata.order).toBe(0);
    expect(metadata.updatedAt).toBeUndefined(); expect(metadata.editor?.ruleset?.needsReview).toBe(true);
    expect(imported.assets.rulesets.ad.content).toEqual({ version: 2, rules: [{ domain: ['after.com'] }] });
    expect(imported.contentHash).not.toBe((await exportSyncBusinessFiles(imported)).contentHash);
    expect(imported.warnings).toHaveLength(1);
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
