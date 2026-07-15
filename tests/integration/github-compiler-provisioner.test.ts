import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GitHubCompilerProvisioner,
  GitHubCompilerProvisioningError,
} from '../../worker/infrastructure/github/github-compiler-provisioner';
import { sha256Hex } from '../../worker/domain/revisions/canonical-json';

const workflow = `${readFileSync('templates/github/compile-srs.yml', 'utf8')
  .replace(/\r\n/g, '\n').replace(/\n*$/, '')}\n`;

function jsonResponse(value: unknown, status = 200): Response {
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
    permissions: { push: true },
    ...overrides,
  };
}

function fakeGitHub(responses: Response[]) {
  const requests: { input: string; init?: RequestInit }[] = [];
  const request: typeof fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected GitHub request');
    return response;
  };
  return { request, requests };
}

describe('GitHub SRS compiler provisioning', () => {
  it('invokes the platform fetch function without binding the provisioner as this', async () => {
    const responses = [
      jsonResponse(repository()),
      jsonResponse({
        type: 'file',
        sha: 'current-sha',
        encoding: 'base64',
        content: Buffer.from(workflow).toString('base64'),
      }),
    ];
    const request = function(this: unknown): Promise<Response> {
      expect(this).toBeUndefined();
      const response = responses.shift();
      if (!response) throw new Error('Unexpected GitHub request');
      return Promise.resolve(response);
    } as typeof fetch;

    await expect(new GitHubCompilerProvisioner({
      repository: 'owner/private-data', token: 'pat', fetch: request,
    }).provision()).resolves.toMatchObject({ action: 'unchanged' });
  });

  it('installs the canonical workflow in one commit when it is missing', async () => {
    const github = fakeGitHub([
      jsonResponse(repository()),
      new Response(null, { status: 404 }),
      jsonResponse({ content: { sha: 'new-sha' } }, 201),
    ]);
    const provisioner = new GitHubCompilerProvisioner({
      repository: 'owner/private-data',
      token: 'fine-grained-pat',
      fetch: github.request,
    });

    await expect(provisioner.provision()).resolves.toEqual({
      repository: 'owner/private-data',
      defaultBranch: 'main',
      workflowHash: await sha256Hex(workflow),
      action: 'installed',
    });
    expect(github.requests).toHaveLength(3);
    expect(github.requests[1].input).toContain('/contents/.github/workflows/compile-srs.yml?ref=main');
    const update = JSON.parse(String(github.requests[2].init?.body));
    expect(update).toMatchObject({
      message: 'chore: install Sing-Sub SRS compiler workflow',
      branch: 'main',
      content: Buffer.from(workflow).toString('base64'),
    });
    expect(update).not.toHaveProperty('sha');
    expect(String(github.requests[2].init?.body)).not.toContain('fine-grained-pat');
  });

  it('is a no-op when the canonical workflow is already installed', async () => {
    const github = fakeGitHub([
      jsonResponse(repository()),
      jsonResponse({
        type: 'file',
        sha: 'current-sha',
        encoding: 'base64',
        content: Buffer.from(workflow).toString('base64'),
      }),
    ]);
    const provisioner = new GitHubCompilerProvisioner({
      repository: 'owner/private-data', token: 'pat', fetch: github.request,
    });

    await expect(provisioner.provision()).resolves.toMatchObject({ action: 'unchanged' });
    expect(github.requests).toHaveLength(2);
  });

  it('upgrades changed workflow content using its current sha', async () => {
    const github = fakeGitHub([
      jsonResponse(repository()),
      jsonResponse({
        type: 'file', sha: 'old-sha', encoding: 'base64', content: Buffer.from('old\n').toString('base64'),
      }),
      jsonResponse({}, 200),
    ]);
    const provisioner = new GitHubCompilerProvisioner({
      repository: 'owner/private-data', token: 'pat', fetch: github.request,
    });

    await expect(provisioner.provision()).resolves.toMatchObject({ action: 'upgraded' });
    expect(JSON.parse(String(github.requests[2].init?.body))).toMatchObject({ sha: 'old-sha' });
  });

  it('rejects public/read-only repositories and reports workflow permission failures', async () => {
    const publicGitHub = fakeGitHub([jsonResponse(repository({ private: false }))]);
    await expect(new GitHubCompilerProvisioner({
      repository: 'owner/private-data', token: 'pat', fetch: publicGitHub.request,
    }).provision()).rejects.toMatchObject<Partial<GitHubCompilerProvisioningError>>({
      code: 'REPOSITORY_NOT_PRIVATE',
    });

    const readOnlyGitHub = fakeGitHub([jsonResponse(repository({ permissions: { push: false } }))]);
    await expect(new GitHubCompilerProvisioner({
      repository: 'owner/private-data', token: 'pat', fetch: readOnlyGitHub.request,
    }).provision()).rejects.toMatchObject<Partial<GitHubCompilerProvisioningError>>({
      code: 'REPOSITORY_READ_ONLY',
    });

    const deniedGitHub = fakeGitHub([
      jsonResponse(repository()),
      new Response(null, { status: 404 }),
      jsonResponse({}, 403),
    ]);
    await expect(new GitHubCompilerProvisioner({
      repository: 'owner/private-data', token: 'pat', fetch: deniedGitHub.request,
    }).provision()).rejects.toMatchObject<Partial<GitHubCompilerProvisioningError>>({
      code: 'WORKFLOW_PERMISSION_DENIED',
      status: 403,
    });
  });
});
