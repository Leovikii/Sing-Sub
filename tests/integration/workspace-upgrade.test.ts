import { describe, expect, it } from 'vitest';
import { prepareWorkspaceUpgrade } from '../../scripts/prepare-workspace-upgrade';
import { canonicalJson, sha256Hex } from '../../worker/domain/revisions/canonical-json';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import { R2RetentionService } from '../../worker/infrastructure/r2/r2-retention-service';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';

async function legacy() {
  const source = {
    schemaVersion: 2, workspaceId: 'primary', revisionId: 'old', previousRevisionId: null,
    createdAt: '2026-10-12T00:00:00.000Z',
    settings: { userLogin: 'Administrator', userAvatar: '', authVersion: 1, tokenVersion: 1 },
    profiles: [
      { name: 'keep', note: 'profile note', templateUrl: 'sing-sub/templates/base.json', nodesPath: '', rules: [], inboundRules: [], order: 0, adapterUrl: '' },
      { name: 'remove', templateUrl: '', nodesPath: '', rules: [], inboundRules: [], order: 1, adapterUrl: 'sing-sub/adapters/momo.json' },
    ],
    assets: { nodes: {}, templates: { base: { path: 'sing-sub/templates/base.json', content: { route: {}, log: {}, note: 'Windows GUI' } } }, adapters: { momo: { path: 'sing-sub/adapters/momo.json', content: { name: 'momo' } } }, rulesets: {} },
    builds: {}, sync: { status: 'synced', baseWorkspaceRevision: 'old', baseRemoteRevision: 'remote', baseContentHash: 'a'.repeat(64), baseRepository: 'owner/repo' },
  };
  const head = { schemaVersion: 1, workspaceId: 'primary', currentRevision: 'old', previousRevision: null, updatedAt: source.createdAt, contentHash: await sha256Hex(canonicalJson(source)) };
  return { source, head };
}

describe('offline workspace upgrade', () => {
  it('produces a readable new revision, removes dependent profiles, and preserves other source data', async () => {
    const { source, head } = await legacy();
    const before = structuredClone(source);
    const result = await prepareWorkspaceUpgrade(head, source);
    expect(source).toEqual(before);
    expect(result.snapshot.schemaVersion).toBe(3);
    expect(result.snapshot.previousRevisionId).toBe(result.previousSnapshot.revisionId);
    expect(result.previousSnapshot.previousRevisionId).toBe('old');
    expect(result.snapshot.profiles.map(profile => profile.name)).toEqual(['keep']);
    expect(result.snapshot.profiles[0]).not.toHaveProperty('adapterUrl');
    expect(result.snapshot.assets).not.toHaveProperty('adapters');
    expect(result.snapshot.assets.templates).toEqual(source.assets.templates);
    expect(result.snapshot.settings).toEqual(source.settings);
    expect(result.snapshot.sync).toEqual({ status: 'never' });
    expect(result.report.removedProfiles).toEqual(['remove']);
    expect(result.report.removedAdapters).toEqual(['momo']);
    const bucket = new InMemoryR2Bucket();
    await bucket.put(result.report.revisionKey, JSON.stringify(result.snapshot), { customMetadata: result.report.revisionMetadata });
    await bucket.put(result.report.previousRevisionKey, JSON.stringify(result.previousSnapshot), { customMetadata: result.report.previousRevisionMetadata });
    bucket.forcePut(result.report.headKey, JSON.stringify(result.head));
    const stored = await new R2WorkspaceStore(bucket).read('primary');
    expect(stored.snapshot).toEqual(result.snapshot);
    await expect(new R2RetentionService(bucket).pruneWorkspace('primary', { revisionLimit: 30, artifactHistoryLimit: 3 }, true)).resolves.toMatchObject({ dryRun: true, deletedRevisions: 0 });
    expect(result.sync.files.map(file => file.path)).toEqual(['sing-sub/configs/keep.json', 'sing-sub/templates/base.json', 'sing-sub/manifest.json']);
    expect(result.sync.files[1].content).toContain('Windows GUI');
    expect(Object.keys(result.snapshot.assets.templates.base.content as object)).toEqual(['route', 'log', 'note']);
  });

  it('refuses wrong heads, corrupted snapshots and already upgraded input', async () => {
    const { source, head } = await legacy();
    await expect(prepareWorkspaceUpgrade({ ...head, currentRevision: 'other' }, source)).rejects.toThrow();
    await expect(prepareWorkspaceUpgrade(head, { ...source, profiles: [] })).rejects.toThrow();
    await expect(prepareWorkspaceUpgrade(head, { ...source, schemaVersion: 3 })).rejects.toThrow();
    const invalid = { ...source, unexpected: true };
    await expect(prepareWorkspaceUpgrade({ ...head, contentHash: await sha256Hex(canonicalJson(invalid)) }, invalid)).rejects.toThrow();
  });
});
