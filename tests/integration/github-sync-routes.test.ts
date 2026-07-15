import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceSnapshot } from '../../shared';
import worker from '../../worker/index';
import type { Env } from '../../worker/types';
import { R2WorkspaceStore } from '../../worker/infrastructure/r2/r2-workspace-store';
import { R2PrivateMetadataStore } from '../../worker/infrastructure/r2/r2-private-metadata-store';
import { InMemoryR2Bucket } from '../fakes/in-memory-r2-bucket';

function snapshot(): WorkspaceSnapshot {
  return {
    schemaVersion: 2,
    workspaceId: 'primary',
    revisionId: 'revision-1',
    previousRevisionId: null,
    createdAt: '2026-07-15T05:00:00.000Z',
    settings: { userLogin: 'Administrator', userAvatar: '', authVersion: 1, tokenVersion: 1 },
    profiles: [{
      name: 'default', note: 'local', templateUrl: '', nodesPath: '',
      rules: [], inboundRules: [], order: 0,
    }],
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

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function data<T>(response: Response): Promise<T> {
  return (await response.json() as { data: T }).data;
}

function profile(note: string): string {
  return JSON.stringify({
    name: 'default', note, templateUrl: '', nodesPath: '', rules: [], inboundRules: [], order: 0,
  }, null, 2) + '\n';
}

class StatefulGitHub {
  private commitNumber = 1;
  private treeNumber = 1;
  private blobNumber = 1;
  private currentCommit = 'commit-1';
  private currentTree = 'tree-1';
  private managed = new Map<string, string>();
  private pendingManaged: Map<string, string> | null = null;
  private pendingTree: string | null = null;
  readonly requests: Array<{ path: string; method: string; body?: string }> = [];
  commitCreates = 0;

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/repos/owner/private-data', '');
    const method = init?.method || 'GET';
    this.requests.push({ path, method, ...(init?.body ? { body: String(init.body) } : {}) });
    if (path === '' && method === 'GET') {
      return json({
        private: true,
        archived: false,
        disabled: false,
        default_branch: 'main',
        full_name: 'owner/private-data',
        size: 1,
        permissions: { push: true },
      });
    }
    if (path === '/git/ref/heads/main' && method === 'GET') return json({ object: { sha: this.currentCommit } });
    if (path === `/git/commits/${this.currentCommit}` && method === 'GET') {
      return json({ tree: { sha: this.currentTree } });
    }
    if (path === `/git/trees/${this.currentTree}` && method === 'GET' && url.searchParams.get('recursive') === '1') {
      const tree = [
        { path: 'README.md', type: 'blob', sha: 'readme', size: 10 },
        ...Array.from(this.managed.entries()).map(([managedPath, content]) => {
          const sha = `blob-${this.blobNumber++}`;
          this.blobs.set(sha, content);
          return { path: managedPath, type: 'blob', sha, size: Buffer.byteLength(content) };
        }),
      ];
      return json({ truncated: false, tree });
    }
    if (path.startsWith('/git/blobs/') && method === 'GET') {
      const content = this.blobs.get(path.slice('/git/blobs/'.length));
      return content === undefined
        ? json({}, 404)
        : json({ encoding: 'base64', content: Buffer.from(content).toString('base64'), size: Buffer.byteLength(content) });
    }
    if (path === '/git/trees' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as { tree: Array<{ path: string; content?: string; sha?: null }> };
      const next = new Map(this.managed);
      for (const entry of body.tree) {
        if (entry.sha === null) next.delete(entry.path);
        else if (typeof entry.content === 'string') next.set(entry.path, entry.content);
      }
      this.treeNumber += 1;
      this.pendingTree = `tree-${this.treeNumber}`;
      this.pendingManaged = next;
      return json({ sha: this.pendingTree }, 201);
    }
    if (path === '/git/commits' && method === 'POST') {
      this.commitCreates += 1;
      this.commitNumber += 1;
      return json({ sha: `commit-${this.commitNumber}` }, 201);
    }
    if (path === '/git/refs/heads/main' && method === 'PATCH') {
      const body = JSON.parse(String(init?.body)) as { sha: string; force: boolean };
      if (body.force || !this.pendingManaged || !this.pendingTree) return json({}, 422);
      this.currentCommit = body.sha;
      this.currentTree = this.pendingTree;
      this.managed = this.pendingManaged;
      this.pendingManaged = null;
      this.pendingTree = null;
      return json({ object: { sha: this.currentCommit } });
    }
    return json({}, 404);
  };

  private readonly blobs = new Map<string, string>();

  editProfile(note: string): void {
    this.managed.set('sing-sub/configs/default.json', profile(note));
    this.commitNumber += 1;
    this.treeNumber += 1;
    this.currentCommit = `commit-${this.commitNumber}`;
    this.currentTree = `tree-${this.treeNumber}`;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('GitHub sync routes', () => {
  it('connects, previews, blocks unsafe first sync, pushes once, and pulls actual remote edits', async () => {
    const bucket = new InMemoryR2Bucket();
    const store = new R2WorkspaceStore(bucket);
    await store.create({ workspaceId: 'primary', snapshot: snapshot() });
    const env = environment(bucket);
    const github = new StatefulGitHub();
    vi.stubGlobal('fetch', github.fetch);

    const unauthenticated = await worker.fetch(new Request('https://example.com/api/github-sync'), env);
    expect(unauthenticated.status).toBe(401);

    const login = await worker.fetch(new Request('https://example.com/api/login', {
      method: 'POST', body: JSON.stringify({ adminPassword: 'correct-password' }),
    }), env);
    const cookie = login.headers.get('Set-Cookie')!.split(';')[0];

    const connected = await worker.fetch(new Request('https://example.com/api/github-sync/connection', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'owner', repo: 'private-data', pat: 'fine-grained-token' }),
    }), env);
    expect(connected.status).toBe(200);
    await expect(data(connected)).resolves.toMatchObject({
      connected: true, repository: 'owner/private-data', defaultBranch: 'main',
    });

    const initialStatus = await worker.fetch(new Request('https://example.com/api/github-sync', {
      headers: { Cookie: cookie },
    }), env);
    await expect(data(initialStatus)).resolves.toMatchObject({
      status: 'never', sameContent: false, canPush: false, canPull: false, requiresResolution: true,
    });

    const blocked = await worker.fetch(new Request('https://example.com/api/github-sync/push', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 'revision-1', resolution: 'safe' }),
    }), env);
    expect(blocked.status).toBe(409);
    await expect(blocked.json()).resolves.toMatchObject({ error: { code: 'SYNC_CONFLICT' } });

    const pushed = await worker.fetch(new Request('https://example.com/api/github-sync/push', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 'revision-1', resolution: 'overwrite' }),
    }), env);
    expect(pushed.status).toBe(200);
    const pushedData = await data<{ revision: string; action: string }>(pushed);
    expect(pushedData.action).toBe('pushed');
    expect(github.commitCreates).toBe(1);
    expect(github.requests.find(request => request.method === 'PATCH')?.body).toContain('"force":false');

    github.editProfile('remote');
    const remoteAhead = await worker.fetch(new Request('https://example.com/api/github-sync', {
      headers: { Cookie: cookie },
    }), env);
    await expect(data(remoteAhead)).resolves.toMatchObject({ status: 'remote-ahead', canPull: true });

    const pulled = await worker.fetch(new Request('https://example.com/api/github-sync/pull', {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: pushedData.revision, resolution: 'safe' }),
    }), env);
    expect(pulled.status).toBe(200);
    await expect(data(pulled)).resolves.toMatchObject({ action: 'pulled' });
    await expect(store.read('primary')).resolves.toMatchObject({
      snapshot: { profiles: [{ note: 'remote' }], sync: { status: 'synced' } },
    });

    const requestCount = github.requests.length;
    const disconnected = await worker.fetch(new Request('https://example.com/api/github-sync/connection', {
      method: 'DELETE', headers: { Cookie: cookie },
    }), env);
    await expect(data(disconnected)).resolves.toMatchObject({ connected: false });
    const disconnectedStatus = await worker.fetch(new Request('https://example.com/api/github-sync', {
      headers: { Cookie: cookie },
    }), env);
    await expect(data(disconnectedStatus)).resolves.toMatchObject({
      connected: false, status: 'never', canPush: false, canPull: false,
    });
    expect(github.requests).toHaveLength(requestCount);
    const privateMetadata = await new R2PrivateMetadataStore(bucket).read('primary');
    expect(privateMetadata?.credentials).not.toHaveProperty('github');
  });
});
