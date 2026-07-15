import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSnapshot } from '../../shared';
import worker from '../../worker/index';
import { R2PrivateMetadataStore } from '../../worker/infrastructure/r2/r2-private-metadata-store';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import type { Env } from '../../worker/types';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';

function snapshot(): WorkspaceSnapshot {
  return {
    schemaVersion: 2,
    workspaceId: 'primary',
    revisionId: 'revision-1',
    previousRevisionId: null,
    createdAt: '2026-07-15T00:00:00.000Z',
    settings: {
      userLogin: 'Administrator', userAvatar: '', authVersion: 1, tokenVersion: 1,
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

async function login(env: Env): Promise<string> {
  const response = await worker.fetch(new Request('https://sing-sub.example.com/api/login', {
    method: 'POST',
    body: JSON.stringify({ adminPassword: 'correct-password' }),
  }), env);
  return response.headers.get('Set-Cookie')!.split(';')[0];
}

function githubJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('SRS compiler management routes', () => {
  it('reports disabled when no GitHub repository is connected and rejects enablement', async () => {
    const bucket = new InMemoryR2Bucket();
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: snapshot() });
    const env = environment(bucket);
    const cookie = await login(env);

    const status = await worker.fetch(new Request('https://sing-sub.example.com/api/srs-compiler', {
      headers: { Cookie: cookie },
    }), env);
    await expect(status.json()).resolves.toEqual({
      data: { connected: false, enabled: false, status: 'disabled', workflowVersion: 1 },
    });

    const enabled = await worker.fetch(new Request('https://sing-sub.example.com/api/srs-compiler', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    }), env);
    expect(enabled.status).toBe(409);
    await expect(enabled.json()).resolves.toMatchObject({
      error: { code: 'BUILD_DISPATCH_FAILED', details: { reason: 'GITHUB_NOT_CONNECTED' } },
    });
  });

  it('automatically installs, records, reports, and disables the compiler without exposing PAT', async () => {
    const bucket = new InMemoryR2Bucket();
    const configured = snapshot();
    configured.assets.rulesets.domains = {
      path: 'sing-sub/rulesets/domains.json',
      content: { version: 2, rules: [{ domain_suffix: ['example.com'] }] },
    };
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: configured });
    await new R2PrivateMetadataStore(bucket).create({
      schemaVersion: 1,
      workspaceId: 'primary',
      github: {
        owner: 'owner', repo: 'private-data', pat: 'fine-grained-pat', defaultBranch: 'main',
      },
      updatedAt: '2026-07-15T00:00:00.000Z',
    });
    const env = environment(bucket);
    const cookie = await login(env);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return fetchMock.mock.calls.length === 1
        ? githubJson({
          private: true,
          archived: false,
          disabled: false,
          default_branch: 'main',
          full_name: 'owner/private-data',
          permissions: { push: true },
        })
        : new Response(null, { status: 404 });
      if (init.method === 'POST') return new Response(null, { status: 204 });
      return githubJson({}, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    const enabled = await worker.fetch(new Request('https://sing-sub.example.com/api/srs-compiler', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    }), env);
    expect(enabled.status).toBe(200);
    const enabledBody = await enabled.json() as { data: Record<string, unknown> };
    expect(enabledBody.data).toMatchObject({
      connected: true,
      repository: 'owner/private-data',
      enabled: true,
      status: 'ready',
      workflowVersion: 1,
      reconcile: { createdJobs: 1, dispatchedJobs: 1 },
    });
    expect(enabledBody.data).not.toHaveProperty('pat');
    expect(enabledBody.data.workflowHash).toMatch(/^[a-f0-9]{64}$/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await expect(new R2PrivateMetadataStore(bucket).read('primary')).resolves.toMatchObject({
      credentials: { srsCompiler: { enabled: true, status: 'ready', workflowVersion: 1 } },
    });

    fetchMock.mockClear();
    const disabled = await worker.fetch(new Request('https://sing-sub.example.com/api/srs-compiler', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    }), env);
    await expect(disabled.json()).resolves.toMatchObject({
      data: { connected: true, enabled: false, status: 'disabled' },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('persists a sanitized error state when provisioning rejects a public repository', async () => {
    const bucket = new InMemoryR2Bucket();
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: snapshot() });
    await new R2PrivateMetadataStore(bucket).create({
      schemaVersion: 1,
      workspaceId: 'primary',
      github: { owner: 'owner', repo: 'public-data', pat: 'pat', defaultBranch: 'main' },
      updatedAt: '2026-07-15T00:00:00.000Z',
    });
    const env = environment(bucket);
    const cookie = await login(env);
    vi.stubGlobal('fetch', vi.fn(async () => githubJson({
      private: false,
      default_branch: 'main',
      full_name: 'owner/public-data',
      permissions: { push: true },
    })));

    const response = await worker.fetch(new Request('https://sing-sub.example.com/api/srs-compiler', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    }), env);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { details: { reason: 'REPOSITORY_NOT_PRIVATE' } },
    });
    await expect(new R2PrivateMetadataStore(bucket).read('primary')).resolves.toMatchObject({
      credentials: {
        github: { pat: 'pat' },
        srsCompiler: { enabled: true, status: 'error', errorCode: 'REPOSITORY_NOT_PRIVATE' },
      },
    });
  });

  it('records an asynchronous compiler error when GitHub rejects workflow dispatch', async () => {
    const bucket = new InMemoryR2Bucket();
    const configured = snapshot();
    configured.assets.rulesets.domains = {
      path: 'sing-sub/rulesets/domains.json',
      content: { version: 2, rules: [{ domain_suffix: ['example.com'] }] },
    };
    await new R2WorkspaceStore(bucket).create({ workspaceId: 'primary', snapshot: configured });
    await new R2PrivateMetadataStore(bucket).create({
      schemaVersion: 1,
      workspaceId: 'primary',
      github: { owner: 'owner', repo: 'private-data', pat: 'pat', defaultBranch: 'main' },
      updatedAt: '2026-07-15T00:00:00.000Z',
    });
    const env = environment(bucket);
    const cookie = await login(env);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return fetchMock.mock.calls.length === 1
        ? githubJson({
          private: true,
          default_branch: 'main',
          full_name: 'owner/private-data',
          permissions: { push: true },
        })
        : new Response(null, { status: 404 });
      if (init.method === 'POST') return githubJson({}, 403);
      return githubJson({}, 201);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await worker.fetch(new Request('https://sing-sub.example.com/api/srs-compiler', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    }), env);
    expect(response.status).toBe(200);
    await expect(new R2PrivateMetadataStore(bucket).read('primary')).resolves.toMatchObject({
      credentials: {
        srsCompiler: { enabled: true, status: 'error', errorCode: 'ACTION_DISPATCH_FAILED' },
      },
    });
  });
});
