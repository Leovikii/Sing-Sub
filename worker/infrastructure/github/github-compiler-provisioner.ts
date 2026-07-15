import type {
  CompilerProvisioner,
  CompilerProvisionResult,
} from '../../application/ports/compiler-provisioner';
import { sha256Hex } from '../../domain/revisions/canonical-json';
import workflowTemplate from '../../../templates/github/compile-srs.yml';

const REPOSITORY = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const WORKFLOW_PATH = '.github/workflows/compile-srs.yml';
const MAX_GITHUB_RESPONSE_BYTES = 512 * 1024;

export type GitHubCompilerProvisioningErrorCode =
  | 'REPOSITORY_ACCESS_DENIED'
  | 'REPOSITORY_NOT_PRIVATE'
  | 'REPOSITORY_READ_ONLY'
  | 'REPOSITORY_UNAVAILABLE'
  | 'WORKFLOW_PERMISSION_DENIED'
  | 'GITHUB_API_FAILED'
  | 'GITHUB_RESPONSE_INVALID';

export class GitHubCompilerProvisioningError extends Error {
  constructor(
    readonly code: GitHubCompilerProvisioningErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubCompilerProvisioningError';
  }
}

interface RepositoryResponse {
  private: boolean;
  archived?: boolean;
  disabled?: boolean;
  default_branch: string;
  full_name: string;
  permissions?: { push?: boolean };
}

interface ContentResponse {
  type: string;
  sha: string;
  encoding: string;
  content: string;
}

export interface GitHubCompilerProvisionerConfig {
  repository: string;
  token: string;
  defaultBranch?: string;
  fetch?: typeof fetch;
}

function validRepository(value: string): boolean {
  if (!REPOSITORY.test(value)) return false;
  return value.split('/').every(segment => segment !== '.' && segment !== '..');
}

function normalizeWorkflow(value: string): string {
  return `${value.replace(/\r\n/g, '\n').replace(/\n*$/, '')}\n`;
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string): string | null {
  try {
    const binary = atob(value.replace(/\s/g, ''));
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      Uint8Array.from(binary, character => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

async function readJsonLimited(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('Content-Length') || '0');
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_GITHUB_RESPONSE_BYTES) {
    throw new GitHubCompilerProvisioningError('GITHUB_RESPONSE_INVALID', 'GitHub response exceeds the size limit');
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_GITHUB_RESPONSE_BYTES) {
      await reader.cancel();
      throw new GitHubCompilerProvisioningError('GITHUB_RESPONSE_INVALID', 'GitHub response exceeds the size limit');
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(body));
  } catch {
    throw new GitHubCompilerProvisioningError('GITHUB_RESPONSE_INVALID', 'GitHub response is not valid JSON');
  }
}

function parseRepository(value: unknown): RepositoryResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const permissions = record.permissions;
  if (typeof record.private !== 'boolean' || typeof record.default_branch !== 'string' ||
      !record.default_branch || typeof record.full_name !== 'string') return null;
  if (permissions !== undefined && (!permissions || typeof permissions !== 'object' || Array.isArray(permissions))) {
    return null;
  }
  return {
    private: record.private,
    archived: record.archived === true,
    disabled: record.disabled === true,
    default_branch: record.default_branch,
    full_name: record.full_name,
    permissions: permissions as RepositoryResponse['permissions'],
  };
}

function parseContent(value: unknown): ContentResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type !== 'file' || typeof record.sha !== 'string' || !record.sha ||
      record.encoding !== 'base64' || typeof record.content !== 'string') return null;
  return { type: 'file', sha: record.sha, encoding: 'base64', content: record.content };
}

export class GitHubCompilerProvisioner implements CompilerProvisioner {
  private readonly endpoint: string;
  private readonly request: typeof fetch;
  private readonly template = normalizeWorkflow(workflowTemplate);

  constructor(private readonly config: GitHubCompilerProvisionerConfig) {
    if (!validRepository(config.repository)) throw new Error('Invalid SRS compiler repository');
    if (!config.token) throw new Error('SRS compiler GitHub token is required');
    const [owner, repository] = config.repository.split('/');
    this.endpoint = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
    this.request = config.fetch || fetch;
  }

  async provision(): Promise<CompilerProvisionResult> {
    const repository = await this.readRepository();
    const defaultBranch = this.config.defaultBranch || repository.default_branch;
    const workflowHash = await sha256Hex(this.template);
    const current = await this.readWorkflow(defaultBranch);
    if (current && normalizeWorkflow(current.content) === this.template) {
      return { repository: repository.full_name, defaultBranch, workflowHash, action: 'unchanged' };
    }

    const response = await this.githubFetch(`/contents/${WORKFLOW_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: current ? 'chore: upgrade Sing-Sub SRS compiler workflow' : 'chore: install Sing-Sub SRS compiler workflow',
        content: encodeBase64(this.template),
        branch: defaultBranch,
        ...(current ? { sha: current.sha } : {}),
      }),
    });
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new GitHubCompilerProvisioningError(
        'WORKFLOW_PERMISSION_DENIED',
        'PAT requires repository Contents and Workflows write permission',
        response.status,
      );
    }
    if (response.status !== 200 && response.status !== 201) {
      await response.body?.cancel();
      throw new GitHubCompilerProvisioningError('GITHUB_API_FAILED', 'GitHub workflow update failed', response.status);
    }
    await response.body?.cancel();
    return {
      repository: repository.full_name,
      defaultBranch,
      workflowHash,
      action: current ? 'upgraded' : 'installed',
    };
  }

  private async readRepository(): Promise<RepositoryResponse> {
    const response = await this.githubFetch('');
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      await response.body?.cancel();
      throw new GitHubCompilerProvisioningError(
        'REPOSITORY_ACCESS_DENIED',
        'Private repository is not accessible with the configured PAT',
        response.status,
      );
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new GitHubCompilerProvisioningError('GITHUB_API_FAILED', 'GitHub repository lookup failed', response.status);
    }
    const repository = parseRepository(await readJsonLimited(response));
    if (!repository || repository.full_name.toLowerCase() !== this.config.repository.toLowerCase()) {
      throw new GitHubCompilerProvisioningError('GITHUB_RESPONSE_INVALID', 'GitHub repository response is invalid');
    }
    if (!repository.private) {
      throw new GitHubCompilerProvisioningError('REPOSITORY_NOT_PRIVATE', 'SRS compiler repository must be private');
    }
    if (repository.archived || repository.disabled) {
      throw new GitHubCompilerProvisioningError('REPOSITORY_UNAVAILABLE', 'SRS compiler repository is not writable');
    }
    if (repository.permissions?.push !== true) {
      throw new GitHubCompilerProvisioningError('REPOSITORY_READ_ONLY', 'PAT requires repository Contents write permission');
    }
    return repository;
  }

  private async readWorkflow(defaultBranch: string): Promise<{ sha: string; content: string } | null> {
    const response = await this.githubFetch(`/contents/${WORKFLOW_PATH}?ref=${encodeURIComponent(defaultBranch)}`);
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (response.status === 401 || response.status === 403) {
      await response.body?.cancel();
      throw new GitHubCompilerProvisioningError(
        'REPOSITORY_ACCESS_DENIED',
        'PAT requires repository Contents read permission',
        response.status,
      );
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new GitHubCompilerProvisioningError('GITHUB_API_FAILED', 'GitHub workflow lookup failed', response.status);
    }
    const content = parseContent(await readJsonLimited(response));
    const decoded = content ? decodeBase64(content.content) : null;
    if (!content || decoded === null) {
      throw new GitHubCompilerProvisioningError('GITHUB_RESPONSE_INVALID', 'GitHub workflow response is invalid');
    }
    return { sha: content.sha, content: decoded };
  }

  private githubFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const request = this.request;
    return request(`${this.endpoint}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'sing-sub-worker',
        'X-GitHub-Api-Version': '2022-11-28',
        ...init.headers,
      },
    });
  }
}
