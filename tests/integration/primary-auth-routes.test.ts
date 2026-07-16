import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOMO_ADAPTER_PRESET, type WorkspaceSnapshot } from '../../shared';
import {
  handleBootstrap,
  handleLogin,
} from '../../worker/routes/auth';
import type { Env } from '../../worker/types';
import { R2ArtifactStore } from '../../worker/infrastructure/r2/r2-artifact-store';
import { R2PrivateMetadataStore } from '../../worker/infrastructure/r2/r2-private-metadata-store';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';
import { InMemoryCacheApi } from '../fakes/in-memory-cache-api';
import worker from '../../worker/index';

function snapshot(): WorkspaceSnapshot {
  return {
    schemaVersion: 2,
    workspaceId: 'primary',
    revisionId: 'revision-1',
    previousRevisionId: null,
    createdAt: '2026-07-14T12:00:00.000Z',
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
    builds: {},
    sync: { status: 'never' },
  };
}

function environment(bucket: InMemoryR2Bucket): Env {
  return {
    WORKSPACE_BUCKET: bucket,
    ADMIN_PASSWORD: 'correct-password',
    SESSION_SIGNING_SECRET: 'session-secret-with-at-least-32-bytes',
    SUBSCRIPTION_SIGNING_SECRET: 'subscription-secret-with-at-least-32-bytes',
  } as unknown as Env;
}

async function data(response: Response) {
  return (await response.json() as { data: unknown }).data;
}

afterEach(() => vi.unstubAllGlobals());

describe('primary workspace auth routes', () => {
  it('reports setupRequired for an empty bucket', async () => {
    const response = await handleBootstrap(new Request('https://example.com/api/bootstrap'), environment(new InMemoryR2Bucket()));

    expect(response.status).toBe(200);
    await expect(data(response)).resolves.toEqual({ settings: null, setupRequired: true });
  });

  it('initializes an empty workspace with only the administrator password', async () => {
    const bucket = new InMemoryR2Bucket();
    const env = environment(bucket);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('__Host-sing-sub-session=');
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await data(response) as { subToken: string }).subToken).toMatch(/^s2\.[a-zA-Z0-9_-]{22}$/);
    await expect(new R2WorkspaceStore(bucket).read('primary')).resolves.toMatchObject({
      snapshot: {
        settings: { userLogin: 'Administrator', authVersion: 1, tokenVersion: 1 },
        profiles: [],
        assets: {
          nodes: {},
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
      },
    });
    await expect(new R2PrivateMetadataStore(bucket).read('primary')).resolves.toBeNull();
  });

  it('rejects legacy GitHub fields instead of importing during login', async () => {
    const bucket = new InMemoryR2Bucket();
    const response = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({
        adminPassword: 'correct-password',
        owner: 'owner',
        repo: 'repo',
        pat: 'github-token',
      }),
    }), environment(bucket));

    expect(response.status).toBe(400);
    await expect(new R2WorkspaceStore(bucket).read('primary')).rejects.toThrow('Workspace not found');
  });

  it('rejects an incorrect administrator password', async () => {
    const bucket = new InMemoryR2Bucket();
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: snapshot() });

    const response = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'wrong-password' }),
    }), environment(bucket));

    expect(response.status).toBe(401);
  });

  it('logs into an existing workspace without calling GitHub and restores bootstrap from the signed cookie', async () => {
    const bucket = new InMemoryR2Bucket();
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: snapshot() });
    const env = environment(bucket);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const login = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), env);

    expect(login.status).toBe(200);
    const cookie = login.headers.get('Set-Cookie');
    expect(cookie).toContain('__Host-sing-sub-session=');
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(data(login)).resolves.toMatchObject({ revision: 'revision-1', owner: 'owner' });

    const bootstrap = await handleBootstrap(new Request('https://example.com/api/bootstrap', {
      headers: { Cookie: cookie!.split(';')[0] },
    }), env);
    expect(bootstrap.status).toBe(200);
    await expect(data(bootstrap)).resolves.toMatchObject({
      setupRequired: false,
      revision: 'revision-1',
      settings: { owner: 'owner' },
      state: { profiles: [] },
    });
  });

  it('publishes profiles through expected revision and rejects stale saves', async () => {
    const bucket = new InMemoryR2Bucket();
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: snapshot() });
    const env = environment(bucket);
    const login = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), env);
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0];
    const state = {
      profiles: [{
        name: 'default',
        templateUrl: '',
        nodesPath: '',
        rules: [],
        inboundRules: [],
        order: 0,
      }],
    };

    const saved = await worker.fetch(new Request('https://example.com/api/state', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, expectedRevision: 'revision-1' }),
    }), env);
    expect(saved.status).toBe(200);
    const savedData = await data(saved) as { revision: string };
    expect(savedData.revision).not.toBe('revision-1');

    const stale = await worker.fetch(new Request('https://example.com/api/state', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, expectedRevision: 'revision-1' }),
    }), env);
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: 'REVISION_CONFLICT', details: { actualRevision: savedData.revision } },
    });
  });

  it('creates, reads, rotates access for, and deletes R2 assets through revisioned routes', async () => {
    const bucket = new InMemoryR2Bucket();
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: snapshot() });
    const env = environment(bucket);
    const login = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), env);
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0];
    const initialToken = (await data(login) as { subToken: string }).subToken;

    const created = await worker.fetch(new Request('https://example.com/api/file', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'sing-sub/nodes/default.json',
        content: '{"outbounds":[]}',
        expectedRevision: 'revision-1',
      }),
    }), env);
    expect(created.status).toBe(200);
    const createdData = await data(created) as { revision: string };

    const loaded = await worker.fetch(new Request(
      'https://example.com/api/file?path=sing-sub%2Fnodes%2Fdefault.json',
      { headers: { Cookie: cookie } },
    ), env);
    await expect(data(loaded)).resolves.toMatchObject({
      content: expect.stringContaining('"outbounds"'),
      sha: createdData.revision,
    });

    const rotated = await worker.fetch(new Request('https://example.com/api/settings', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: createdData.revision,
        rotateSubscriptionToken: true,
      }),
    }), env);
    expect(rotated.status).toBe(200);
    const rotatedData = await data(rotated) as { revision: string; subToken: string };
    expect(rotatedData.subToken).not.toBe(initialToken);

    const deleted = await worker.fetch(new Request(
      `https://example.com/api/file?path=sing-sub%2Fnodes%2Fdefault.json&expectedRevision=${encodeURIComponent(rotatedData.revision)}`,
      { method: 'DELETE', headers: { Cookie: cookie } },
    ), env);
    expect(deleted.status).toBe(200);
    const missing = await worker.fetch(new Request(
      'https://example.com/api/file?path=sing-sub%2Fnodes%2Fdefault.json',
      { headers: { Cookie: cookie } },
    ), env);
    expect(missing.status).toBe(404);
  });

  it('validates adapter assets before publishing them', async () => {
    const bucket = new InMemoryR2Bucket();
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: snapshot() });
    const env = environment(bucket);
    const login = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), env);
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0];
    const invalid = await worker.fetch(new Request('https://example.com/api/file', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'sing-sub/adapters/custom.json',
        content: JSON.stringify({ schemaVersion: 1, name: 'other', replacements: [] }),
        expectedRevision: 'revision-1',
      }),
    }), env);
    expect(invalid.status).toBe(400);

    const saved = await worker.fetch(new Request('https://example.com/api/file', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'sing-sub/adapters/custom.json',
        content: JSON.stringify({
          schemaVersion: 1,
          name: 'custom',
          replacements: [{ path: ['inbounds'], value: [] }],
        }),
        expectedRevision: 'revision-1',
      }),
    }), env);
    expect(saved.status).toBe(200);
    await expect(new R2WorkspaceStore(bucket).read('primary')).resolves.toMatchObject({
      snapshot: { assets: { adapters: { custom: { content: { name: 'custom' } } } } },
    });
  });

  it('builds subscriptions from the current revision, bypasses stale cache, and invalidates rotated tokens', async () => {
    const bucket = new InMemoryR2Bucket();
    const configured = snapshot();
    configured.profiles = [{
      name: 'default',
      templateUrl: 'sing-sub/templates/default.json',
      nodesPath: '',
      rules: [],
      inboundRules: [],
      order: 0,
    }];
    configured.assets.templates.default = {
      path: 'sing-sub/templates/default.json',
      content: {
        log: { level: 'info' },
        route: {
          rule_set: [{ tag: 'public-rules', url: 'https://example.com/rules/legacy-token/public-rules.srs' }],
        },
      },
    };
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: configured });
    const env = environment(bucket);
    vi.stubGlobal('caches', { default: new InMemoryCacheApi() });
    const login = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), env);
    const loginData = await data(login) as { subToken: string };
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0];
    const subscriptionUrl = `https://example.com/sub/${loginData.subToken}/default.json`;

    const legacyTokenResponse = await worker.fetch(new Request(
      'https://example.com/sub/v1.legacy.payload/default.json',
      { headers: { 'User-Agent': 'sing-box/1.12' } },
    ), env);
    expect(legacyTokenResponse.status).toBe(404);

    const first = await worker.fetch(new Request(subscriptionUrl, {
      headers: { 'User-Agent': 'sing-box/1.12' },
    }), env);
    expect(first.status).toBe(200);
    expect(await first.text()).toContain('"level": "info"');
    const normalizedSubscription = await worker.fetch(new Request(subscriptionUrl, {
      headers: { 'User-Agent': 'sing-box/1.12' },
    }), env);
    const normalizedBody = await normalizedSubscription.text();
    expect(normalizedBody).toContain('https://example.com/rules/public-rules.srs');
    expect(normalizedBody).not.toContain('legacy-token');

    const preview = await worker.fetch(new Request('https://example.com/api/preview/default.json', {
      headers: { Cookie: cookie },
    }), env);
    const previewData = await data(preview) as { content: string };
    expect(previewData.content).toContain('https://example.com/rules/public-rules.srs');
    expect(previewData.content).not.toContain('legacy-token');

    const updated = await worker.fetch(new Request('https://example.com/api/file', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'sing-sub/templates/default.json',
        content: '{"log":{"level":"warn"}}',
        expectedRevision: 'revision-1',
      }),
    }), env);
    const updatedData = await data(updated) as { revision: string };
    const second = await worker.fetch(new Request(subscriptionUrl, {
      headers: { 'User-Agent': 'sing-box/1.12' },
    }), env);
    expect(second.status).toBe(200);
    expect(await second.text()).toContain('"level": "warn"');

    const rotated = await worker.fetch(new Request('https://example.com/api/settings', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedRevision: updatedData.revision,
        rotateSubscriptionToken: true,
      }),
    }), env);
    expect(rotated.status).toBe(200);
    const invalidated = await worker.fetch(new Request(subscriptionUrl, {
      headers: { 'User-Agent': 'sing-box/1.12' },
    }), env);
    expect(invalidated.status).toBe(404);
  });

  it('serves public SRS without exposing or depending on the private subscription token', async () => {
    const bucket = new InMemoryR2Bucket();
    const configured = snapshot();
    const sourceHash = 'a'.repeat(64);
    const artifact = new Uint8Array([0x53, 0x52, 0x53, 0x00]);
    const descriptor = await new R2ArtifactStore(bucket).putSrs({
      workspaceId: 'primary',
      rulesetId: 'public-rules',
      sourceHash,
    }, artifact);
    configured.builds['public-rules'] = {
      jobId: 'job-public-rules',
      rulesetId: 'public-rules',
      sourceHash,
      compilerVersion: 'sing-box-1.12.0',
      status: 'ready',
      activeArtifact: {
        rulesetId: 'public-rules',
        sourceHash,
        contentHash: descriptor.contentHash,
        size: descriptor.size,
        createdAt: '2026-07-14T12:00:00.000Z',
      },
      updatedAt: '2026-07-14T12:00:00.000Z',
    };
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: configured });
    vi.stubGlobal('caches', { default: new InMemoryCacheApi() });
    const baseEnv = environment(bucket);
    const env = { ...baseEnv, SUBSCRIPTION_SIGNING_SECRET: 'invalid' };

    const response = await worker.fetch(
      new Request('https://example.com/rules/public-rules.srs'),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(response.headers.get('ETag')).toBe(`"${descriptor.contentHash}"`);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(artifact);

    const legacy = await worker.fetch(
      new Request('https://example.com/rules/exposed-subscription-token/public-rules.srs'),
      env,
    );
    expect(legacy.status).toBe(404);
  });

  it('always serves public source rulesets from the current R2 revision without editor metadata', async () => {
    const bucket = new InMemoryR2Bucket();
    const configured = snapshot();
    configured.assets.rulesets['public-rules'] = {
      path: 'sing-sub/rulesets/public-rules.json',
      content: {
        version: 2,
        rules: [{ domain_suffix: ['example.com'] }],
        _sing_sub: { note: 'editor-only', sources: [] },
      },
    };
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: configured });
    vi.stubGlobal('caches', { default: new InMemoryCacheApi() });
    const baseEnv = environment(bucket);
    const env = { ...baseEnv, SUBSCRIPTION_SIGNING_SECRET: 'invalid' };

    const response = await worker.fetch(
      new Request('https://example.com/rules/public-rules.json'),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(response.headers.get('ETag')).toMatch(/^"[a-f0-9]{64}"$/);
    await expect(response.json()).resolves.toEqual({
      version: 2,
      rules: [{ domain_suffix: ['example.com'] }],
    });

    const tokenized = await worker.fetch(
      new Request('https://example.com/rules/private-subscription-token/public-rules.json'),
      env,
    );
    expect(tokenized.status).toBe(404);

    const unauthenticatedStatus = await worker.fetch(
      new Request('https://example.com/api/rulesets/public-rules/build'),
      baseEnv,
    );
    expect(unauthenticatedStatus.status).toBe(401);
    const login = await handleLogin(new Request('https://example.com/api/login', {
      method: 'POST',
      body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), baseEnv);
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0];
    const buildStatus = await worker.fetch(
      new Request('https://example.com/api/rulesets/public-rules/build', { headers: { Cookie: cookie } }),
      baseEnv,
    );
    expect(buildStatus.status).toBe(200);
    await expect(data(buildStatus)).resolves.toMatchObject({
      revision: 'revision-1',
      rulesetId: 'public-rules',
      status: 'none',
      compilerAvailable: false,
      formats: { source: true, binary: false },
      build: null,
    });
  });
});
