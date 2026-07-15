import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createCompilerSource,
  createSrsJobId,
  SRS_COMPILER_VERSION,
} from '../../worker/domain/rulesets/compiler-source';
import { GitHubActionsCompilerDispatcher } from '../../worker/infrastructure/github/github-actions-compiler-dispatcher';

afterEach(() => vi.unstubAllGlobals());

describe('SRS compiler source and identity', () => {
  it('strips private editor metadata and generates a stable source hash', async () => {
    const content = {
      version: 2,
      rules: [{ domain_suffix: ['example.com'] }],
      _sing_sub: { note: 'not sent to the compiler', sources: [] },
    };

    const first = await createCompilerSource(content);
    const second = await createCompilerSource(structuredClone(content));

    expect(JSON.parse(first.body)).toEqual({ version: 2, rules: content.rules });
    expect(first.body).not.toContain('_sing_sub');
    expect(first).toEqual(second);
  });

  it('derives a deterministic opaque job ID from immutable build identity', async () => {
    const identity = {
      workspaceId: 'primary',
      rulesetId: 'private-domains',
      sourceRevision: 'revision-2',
      sourceHash: 'a'.repeat(64),
      compilerVersion: SRS_COMPILER_VERSION,
    };

    expect(await createSrsJobId(identity)).toBe(await createSrsJobId(identity));
    expect(await createSrsJobId(identity)).toMatch(/^srs-[a-f0-9]{64}$/);
    expect(await createSrsJobId({ ...identity, sourceRevision: 'revision-3' }))
      .not.toBe(await createSrsJobId(identity));
  });
});

describe('GitHub Actions compiler dispatcher', () => {
  it('dispatches an opaque job ID, Worker origin, and short-lived ticket', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const dispatcher = new GitHubActionsCompilerDispatcher({
      repository: 'owner/sing-sub',
      token: 'dispatch-token',
      ref: 'main',
    });

    await dispatcher.dispatch({
      jobId: 'srs-job-1',
      workerUrl: 'https://sing-sub.example.com',
      jobTicket: 'v1.short-lived.ticket',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/owner/sing-sub/actions/workflows/compile-srs.yml/dispatches');
    expect(init).toMatchObject({ method: 'POST' });
    expect(JSON.parse(String(init?.body))).toEqual({
      ref: 'main',
      inputs: {
        job_id: 'srs-job-1',
        worker_url: 'https://sing-sub.example.com',
        job_ticket: 'v1.short-lived.ticket',
      },
    });
    expect(String(init?.body)).not.toContain('dispatch-token');
  });

  it('rejects an invalid repository coordinate before making a request', () => {
    expect(() => new GitHubActionsCompilerDispatcher({
      repository: '../other',
      token: 'token',
    })).toThrow('Invalid SRS compiler repository');
  });

  it('rejects an insecure or path-bearing Worker URL', async () => {
    const dispatcher = new GitHubActionsCompilerDispatcher({ repository: 'owner/repo', token: 'token' });
    await expect(dispatcher.dispatch({
      jobId: 'srs-job-1', workerUrl: 'http://example.com/internal', jobTicket: 'ticket',
    })).rejects.toThrow('Invalid SRS compiler dispatch target');
  });
});
