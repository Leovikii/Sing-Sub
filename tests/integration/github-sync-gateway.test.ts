import { describe, expect, it } from 'vitest';
import {
  GitHubSyncError,
  GitHubSyncGateway,
  GitHubSyncGatewayFactory,
} from '../../worker/infrastructure/github/github-sync-gateway';
import { sha256Hex } from '../../worker/domain/revisions/canonical-json';

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function repository(overrides: Record<string, unknown> = {}) {
  return {
    private: true,
    archived: false,
    disabled: false,
    default_branch: 'main',
    full_name: 'owner/private-data',
    size: 12,
    permissions: { push: true },
    ...overrides,
  };
}

function ref(sha = 'commit-1') {
  return { object: { sha } };
}

function commit(treeSha = 'tree-1') {
  return { tree: { sha: treeSha } };
}

function blob(content: string) {
  return {
    encoding: 'base64',
    content: Buffer.from(content).toString('base64'),
    size: Buffer.byteLength(content),
  };
}

function fakeGitHub(responses: Response[]) {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const request: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error(`Unexpected GitHub request: ${String(input)}`);
    return response;
  };
  return { request, requests };
}

describe('GitHub editable sync gateway', () => {
  it('downloads only the actual managed tree and keeps manifest informational', async () => {
    const profile = '{"name":"default","templateUrl":"","nodesPath":"","rules":[],"inboundRules":[],"order":0}';
    const manifest = '{"format":"stale"}';
    const github = fakeGitHub([
      json(repository()),
      json(ref()),
      json(commit()),
      json({
        truncated: false,
        tree: [
          { path: '.github/workflows/compile-srs.yml', type: 'blob', sha: 'workflow', size: 10 },
          { path: 'sing-sub/configs/default.json', type: 'blob', sha: 'profile', size: Buffer.byteLength(profile) },
          { path: 'sing-sub/manifest.json', type: 'blob', sha: 'manifest', size: Buffer.byteLength(manifest) },
        ],
      }),
      json(blob(profile)),
      json(blob(manifest)),
    ]);
    const gateway = new GitHubSyncGateway({
      owner: 'owner', repo: 'private-data', pat: 'private-token', defaultBranch: 'main', fetch: github.request,
    });

    await expect(gateway.download()).resolves.toEqual({
      remoteRevision: 'commit-1',
      files: [{
        path: 'sing-sub/configs/default.json',
        content: profile,
        contentHash: await sha256Hex(profile),
      }],
      manifestContent: manifest,
    });
    expect(github.requests).toHaveLength(6);
    expect(github.requests.every(request => !String(request.init?.body || '').includes('private-token'))).toBe(true);
  });

  it('publishes all managed changes in one non-force commit and preserves the base tree', async () => {
    const github = fakeGitHub([
      json(repository()),
      json(ref()),
      json(commit()),
      json({
        truncated: false,
        tree: [
          { path: 'README.md', type: 'blob', sha: 'readme', size: 20 },
          { path: '.github/workflows/compile-srs.yml', type: 'blob', sha: 'workflow', size: 20 },
          { path: 'sing-sub/nodes/obsolete.json', type: 'blob', sha: 'old-node', size: 2 },
        ],
      }),
      json({ sha: 'tree-2' }, 201),
      json({ sha: 'commit-2' }, 201),
      json({ object: { sha: 'commit-2' } }, 200),
    ]);
    const gateway = new GitHubSyncGateway({
      owner: 'owner', repo: 'private-data', pat: 'token', defaultBranch: 'main', fetch: github.request,
    });
    const profileContent = '{}\n';
    const manifestContent = '{"format":"sing-sub-editable-sync"}\n';

    await expect(gateway.push({
      expectedRemoteRevision: 'commit-1',
      message: 'sync workspace',
      files: [
        { path: 'sing-sub/configs/default.json', content: profileContent, contentHash: await sha256Hex(profileContent) },
        { path: 'sing-sub/manifest.json', content: manifestContent, contentHash: await sha256Hex(manifestContent) },
      ],
    })).resolves.toEqual({ remoteRevision: 'commit-2' });

    const treeRequest = github.requests.find(request => request.url.endsWith('/git/trees') && request.init?.method === 'POST');
    const treeBody = JSON.parse(String(treeRequest?.init?.body));
    expect(treeBody.base_tree).toBe('tree-1');
    expect(treeBody.tree).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'sing-sub/configs/default.json', content: profileContent }),
      expect.objectContaining({ path: 'sing-sub/manifest.json', content: manifestContent }),
      expect.objectContaining({ path: 'sing-sub/nodes/obsolete.json', sha: null }),
    ]));
    expect(JSON.stringify(treeBody)).not.toContain('README.md');
    expect(JSON.stringify(treeBody)).not.toContain('compile-srs.yml');

    const commitRequests = github.requests.filter(request =>
      request.url.endsWith('/git/commits') && request.init?.method === 'POST');
    expect(commitRequests).toHaveLength(1);
    expect(JSON.parse(String(commitRequests[0].init?.body))).toMatchObject({
      tree: 'tree-2', parents: ['commit-1'], message: 'sync workspace',
    });
    const refRequest = github.requests.at(-1)!;
    expect(refRequest.init?.method).toBe('PATCH');
    expect(JSON.parse(String(refRequest.init?.body))).toEqual({ sha: 'commit-2', force: false });
  });

  it('rejects public/read-only repositories and stale remote heads before creating a commit', async () => {
    const publicGithub = fakeGitHub([json(repository({ private: false }))]);
    await expect(new GitHubSyncGatewayFactory(publicGithub.request).connect({
      owner: 'owner', repo: 'private-data', pat: 'token',
    })).rejects.toMatchObject<Partial<GitHubSyncError>>({ code: 'REPOSITORY_NOT_PRIVATE' });

    const readOnlyGithub = fakeGitHub([json(repository({ permissions: { push: false } }))]);
    await expect(new GitHubSyncGatewayFactory(readOnlyGithub.request).connect({
      owner: 'owner', repo: 'private-data', pat: 'token',
    })).rejects.toMatchObject<Partial<GitHubSyncError>>({ code: 'REPOSITORY_READ_ONLY' });

    const changed = fakeGitHub([
      json(repository()),
      json(ref('commit-new')),
      json(commit()),
      json({ truncated: false, tree: [] }),
    ]);
    await expect(new GitHubSyncGateway({
      owner: 'owner', repo: 'private-data', pat: 'token', defaultBranch: 'main', fetch: changed.request,
    }).push({
      expectedRemoteRevision: 'commit-old', message: 'must not commit', files: [],
    })).rejects.toMatchObject<Partial<GitHubSyncError>>({ code: 'REMOTE_CHANGED' });
    expect(changed.requests.some(request => request.init?.method === 'POST')).toBe(false);
  });

  it('initializes an empty private repository without requiring a manual README commit', async () => {
    const github = fakeGitHub([
      json(repository({ size: 0 })),
      json({}, 404),
      json({ sha: 'tree-first' }, 201),
      json({ sha: 'commit-first' }, 201),
      json({ ref: 'refs/heads/main', object: { sha: 'commit-first' } }, 201),
    ]);
    const gateway = new GitHubSyncGateway({
      owner: 'owner', repo: 'private-data', pat: 'token', defaultBranch: 'main', fetch: github.request,
    });

    await expect(gateway.push({
      expectedRemoteRevision: 'empty',
      message: 'initialize sync',
      files: [{ path: 'sing-sub/manifest.json', content: '{}\n', contentHash: await sha256Hex('{}\n') }],
    })).resolves.toEqual({ remoteRevision: 'commit-first' });
    const commitRequest = github.requests.find(request =>
      request.url.endsWith('/git/commits') && request.init?.method === 'POST');
    expect(JSON.parse(String(commitRequest?.init?.body))).toMatchObject({ parents: [] });
    const refRequest = github.requests.at(-1)!;
    expect(refRequest.url).toMatch(/\/git\/refs$/);
    expect(refRequest.init?.method).toBe('POST');
  });
});
