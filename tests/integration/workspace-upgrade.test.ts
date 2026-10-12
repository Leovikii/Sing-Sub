import worker from '../../worker/index';
import type { Env } from '../../worker/types';
import { describe, expect, it, vi } from 'vitest';
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

async function seedLegacy(bucket: InMemoryR2Bucket) {
  const { source, head } = await legacy();
  await bucket.put('workspaces/primary/revisions/old.json', JSON.stringify(source), {
    customMetadata: { revisionId: 'old', createdAt: source.createdAt, contentHash: head.contentHash },
  });
  await bucket.put('workspaces/primary/head.json', JSON.stringify(head));
  return { source, head };
}

describe('automatic workspace upgrade', () => {
  it('migrates once on read, preserves a backup and supports retention and subsequent writes', async () => {
    const bucket = new InMemoryR2Bucket();
    const { source, head } = await seedLegacy(bucket);
    const store = new R2WorkspaceStore(bucket);
    const current = await store.read('primary');
    expect(current.snapshot.schemaVersion).toBe(3);
    expect(current.snapshot.profiles.map(p => p.name)).toEqual(['keep']);
    expect(current.snapshot.settings).toEqual(source.settings);
    expect(current.snapshot.assets.templates).toEqual(source.assets.templates);
    expect(current.snapshot.sync).toEqual({ status: 'never' });
    const backup = await bucket.get('workspaces/primary/migrations/v3/old.json');
    expect(JSON.parse(await backup!.text())).toEqual({ head, snapshot: source });
    expect(JSON.parse(await (await bucket.get('workspaces/primary/revisions/old.json'))!.text())).toEqual(source);
    const put = vi.spyOn(bucket, 'put');
    expect(await store.read('primary')).toEqual(current);
    expect(put).not.toHaveBeenCalled();
    await expect(new R2RetentionService(bucket).pruneWorkspace('primary', { revisionLimit: 30, artifactHistoryLimit: 3 }, true)).resolves.toMatchObject({ deletedRevisions: 0 });
    await store.publish({ workspaceId: 'primary', expectedRevision: current.revision,
      snapshot: { ...current.snapshot, revisionId: 'saved', previousRevisionId: current.revision } });
    expect((await store.read('primary')).revision).toBe('saved');
  });

  it('allows concurrent first readers to converge on one published migration', async () => {
    const bucket = new InMemoryR2Bucket();
    await seedLegacy(bucket);
    const reads = await Promise.all(Array.from({ length: 4 }, () => new R2WorkspaceStore(bucket).read('primary')));
    expect(new Set(reads.map(r => r.revision)).size).toBe(1);
    expect(reads.every(r => r.snapshot.schemaVersion === 3)).toBe(true);
  });

  it('retries from a concurrent old-version save instead of losing it', async () => {
    const bucket = new InMemoryR2Bucket();
    const { source, head } = await seedLegacy(bucket);
    const newer = { ...source, revisionId: 'newer', profiles: [{ ...source.profiles[0], note: 'concurrent edit' }] };
    await bucket.put('workspaces/primary/revisions/newer.json', JSON.stringify(newer));
    bucket.raceNextConditionalPut('workspaces/primary/head.json', JSON.stringify({
      ...head, currentRevision: 'newer', contentHash: await sha256Hex(canonicalJson(newer)),
    }));
    const result = await new R2WorkspaceStore(bucket).read('primary');
    expect(result.snapshot.profiles[0].note).toBe('concurrent edit');
  });

  it('leaves head unchanged on partial failure and safely retries later', async () => {
    const bucket = new InMemoryR2Bucket();
    const { head } = await seedLegacy(bucket);
    const originalPut = bucket.put.bind(bucket);
    let writes = 0;
    const put = vi.spyOn(bucket, 'put').mockImplementation(async (key, value, options) => {
      if (key.includes('/revisions/') && ++writes === 2) throw new Error('R2 unavailable');
      return originalPut(key, value, options);
    });
    await expect(new R2WorkspaceStore(bucket).read('primary')).rejects.toThrow('R2 unavailable');
    expect(JSON.parse(await (await bucket.get('workspaces/primary/head.json'))!.text())).toEqual(head);
    put.mockRestore();
    expect((await new R2WorkspaceStore(bucket).read('primary')).snapshot.schemaVersion).toBe(3);
  });

  it('does not migrate corrupt data or accept historical v2 through the normal revision reader', async () => {
    const bucket = new InMemoryR2Bucket();
    const { source } = await seedLegacy(bucket);
    bucket.forcePut('workspaces/primary/revisions/old.json', JSON.stringify({ ...source, profiles: [] }));
    const put = vi.spyOn(bucket, 'put');
    await expect(new R2WorkspaceStore(bucket).read('primary')).rejects.toThrow();
    expect(put).not.toHaveBeenCalled();
    await expect(new R2WorkspaceStore(bucket).readRevision('primary', 'old')).rejects.toThrow();
  });
});

it('serves bootstrap and login against a legacy bucket immediately after deployment', async () => {
  const bucket = new InMemoryR2Bucket();
  await seedLegacy(bucket);
  const env = {
    WORKSPACE_BUCKET: bucket, ADMIN_PASSWORD: 'correct-password',
    SESSION_SIGNING_SECRET: 'session-secret-with-at-least-32-bytes',
    SUBSCRIPTION_SIGNING_SECRET: 'subscription-secret-with-at-least-32-bytes',
  } as unknown as Env;
  const bootstrap = await worker.fetch(new Request('https://example.com/api/bootstrap'), env);
  expect(bootstrap.status).toBe(200);
  expect(await bootstrap.json()).toMatchObject({ data: { setupRequired: false } });
  const login = await worker.fetch(new Request('https://example.com/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword: 'correct-password' }),
  }), env);
  expect(login.status).toBe(200);
  const cookie = login.headers.get('Set-Cookie')!.split(';')[0];
  const state = await worker.fetch(new Request('https://example.com/api/bootstrap', {
    headers: { Cookie: cookie },
  }), env);
  expect(await state.json()).toMatchObject({ data: { state: { profiles: [{ name: 'keep' }] } } });
});
