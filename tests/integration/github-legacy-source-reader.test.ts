import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GithubLegacySourceReader,
  LegacySourceReadError,
} from '../../worker/infrastructure/github/github-legacy-source-reader';
import type { RepoSession } from '../../worker/lib/github';

const session: RepoSession = {
  owner: 'owner',
  repo: 'repo',
  pat: 'github-token',
  defaultBranch: 'feature/data',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function encoded(content: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(content)));
}

afterEach(() => vi.unstubAllGlobals());

describe('GithubLegacySourceReader', () => {
  it('reads only managed JSON blobs from one pinned commit', async () => {
    const blobs = new Map([
      ['profile-sha', '{"name":"default"}'],
      ['node-sha', '{"type":"vless"}'],
    ]);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('/git/ref/heads/')) return json({ object: { sha: 'commit-1' } });
      if (url.includes('/git/trees/commit-1')) return json({
        truncated: false,
        tree: [
          { path: 'sing-sub/configs/default.json', type: 'blob', sha: 'profile-sha', size: 18 },
          { path: 'sing-sub/nodes/node-1.json', type: 'blob', sha: 'node-sha', size: 16 },
          { path: 'sing-sub/rulesets/compiled/list.srs', type: 'blob', sha: 'srs-sha', size: 5 },
          { path: '.github/workflows/compile.yml', type: 'blob', sha: 'workflow-sha', size: 5 },
        ],
      });
      const sha = url.split('/git/blobs/')[1];
      const content = blobs.get(sha);
      return content === undefined ? json({}, 404) : json({ encoding: 'base64', content: encoded(content), size: content.length });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await new GithubLegacySourceReader(session).read();

    expect(result).toMatchObject({
      owner: 'owner',
      repo: 'repo',
      branch: 'feature/data',
      commitSha: 'commit-1',
    });
    expect(result.files.map(file => file.path)).toEqual([
      'sing-sub/configs/default.json',
      'sing-sub/nodes/node-1.json',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0][0]).toContain('/git/ref/heads/feature%2Fdata');
  });

  it('rejects a truncated recursive tree instead of importing a partial snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ object: { sha: 'commit-1' } }))
      .mockResolvedValueOnce(json({ truncated: true, tree: [] })));

    await expect(new GithubLegacySourceReader(session).read())
      .rejects.toMatchObject<Partial<LegacySourceReadError>>({
        name: 'LegacySourceReadError',
        reason: 'Repository tree is truncated',
      });
  });

  it('rejects blob size mismatches', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(json({ object: { sha: 'commit-1' } }))
      .mockResolvedValueOnce(json({
        truncated: false,
        tree: [{ path: 'sing-sub/nodes/node.json', type: 'blob', sha: 'blob-1', size: 99 }],
      }))
      .mockResolvedValueOnce(json({ encoding: 'base64', content: encoded('{}'), size: 2 })));

    await expect(new GithubLegacySourceReader(session).read())
      .rejects.toMatchObject({ reason: 'GitHub blob size does not match tree metadata' });
  });
});
