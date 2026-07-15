import type {
  SyncDownload,
  SyncFile,
  SyncGateway,
  SyncGatewayFactory,
  SyncPushCommand,
  SyncRepositoryConnection,
} from '../../application/ports/sync-gateway';
import { sha256Hex } from '../../domain/revisions/canonical-json';
import { parseSyncPath } from '../../domain/sync/sync-path';
import { SYNC_MANIFEST_PATH } from '../../application/sync/export-workspace';

const GITHUB_API = 'https://api.github.com';
const EMPTY_REMOTE_REVISION = 'empty';
const MAX_SYNC_FILES = 200;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 6;

export type GitHubSyncErrorCode =
  | 'REPOSITORY_ACCESS_DENIED'
  | 'REPOSITORY_NOT_PRIVATE'
  | 'REPOSITORY_READ_ONLY'
  | 'REPOSITORY_UNAVAILABLE'
  | 'REMOTE_CHANGED'
  | 'SOURCE_TOO_LARGE'
  | 'TOO_MANY_FILES'
  | 'GITHUB_API_FAILED'
  | 'GITHUB_RESPONSE_INVALID';

export class GitHubSyncError extends Error {
  constructor(
    readonly code: GitHubSyncErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'GitHubSyncError';
  }
}

interface RepositoryResponse {
  private: boolean;
  archived: boolean;
  disabled: boolean;
  defaultBranch: string;
  fullName: string;
  size: number;
  push: boolean;
}

interface TreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

interface RemoteTree {
  commitSha: string;
  treeSha: string | null;
  entries: TreeEntry[];
}

function validSegment(value: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(value) && value !== '.' && value !== '..';
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseRepository(value: unknown): RepositoryResponse | null {
  const record = parseRecord(value);
  const permissions = parseRecord(record?.permissions);
  if (!record || typeof record.private !== 'boolean' || typeof record.default_branch !== 'string' ||
      typeof record.full_name !== 'string' || typeof record.size !== 'number') return null;
  return {
    private: record.private,
    archived: record.archived === true,
    disabled: record.disabled === true,
    defaultBranch: record.default_branch,
    fullName: record.full_name,
    size: record.size,
    push: permissions?.push === true,
  };
}

async function readJsonLimited(response: Response): Promise<unknown> {
  const declaredHeader = response.headers.get('Content-Length');
  const declared = declaredHeader === null ? null : Number(declaredHeader);
  if (declared !== null && (!Number.isFinite(declared) || declared < 0 || declared > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel();
    throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub response exceeds the size limit');
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub response exceeds the size limit');
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
    throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub response is not valid JSON');
  }
}

function decodeBlob(value: unknown, expectedSize?: number): string {
  const record = parseRecord(value);
  if (!record || record.encoding !== 'base64' || typeof record.content !== 'string' ||
      typeof record.size !== 'number') {
    throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub blob response is invalid');
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(record.content.replace(/\s/g, ''));
    bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub blob is not valid base64');
  }
  if (bytes.byteLength !== record.size || (expectedSize !== undefined && bytes.byteLength !== expectedSize) ||
      bytes.byteLength > MAX_FILE_BYTES) {
    throw new GitHubSyncError('SOURCE_TOO_LARGE', 'GitHub blob size is invalid');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub blob is not valid UTF-8');
  }
}

async function mapConcurrent<T, R>(
  values: T[],
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(values.length);
  let cursor = 0;
  let failure: unknown;
  const run = async () => {
    while (cursor < values.length && failure === undefined) {
      const index = cursor;
      cursor += 1;
      try {
        result[index] = await mapper(values[index]);
      } catch (error) {
        failure = error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, values.length) }, () => run()));
  if (failure !== undefined) throw failure;
  return result;
}

export interface GitHubSyncGatewayConfig extends SyncRepositoryConnection {
  fetch?: typeof fetch;
}

export class GitHubSyncGateway implements SyncGateway {
  private readonly endpoint: string;
  private readonly request: typeof fetch;

  constructor(private readonly config: GitHubSyncGatewayConfig) {
    if (!validSegment(config.owner) || !validSegment(config.repo) || !config.pat || !config.defaultBranch) {
      throw new Error('Invalid GitHub sync connection');
    }
    this.endpoint = `${GITHUB_API}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
    this.request = config.fetch || fetch;
  }

  async inspectRepository(): Promise<{ repository: string; defaultBranch: string }> {
    const repository = await this.readRepository();
    return { repository: repository.fullName, defaultBranch: repository.defaultBranch };
  }

  async download(): Promise<SyncDownload> {
    const repository = await this.readRepository();
    const branch = this.config.defaultBranch || repository.defaultBranch;
    const tree = await this.readTree(branch, repository.size === 0);
    const entries = tree.entries
      .filter(entry => entry.type === 'blob' && (parseSyncPath(entry.path) || entry.path === SYNC_MANIFEST_PATH))
      .sort((left, right) => left.path.localeCompare(right.path));
    if (entries.length > MAX_SYNC_FILES + 1) {
      throw new GitHubSyncError('TOO_MANY_FILES', 'GitHub managed file count exceeds the limit');
    }
    if (entries.some(entry => !entry.sha || (entry.size !== undefined && entry.size > MAX_FILE_BYTES))) {
      throw new GitHubSyncError('SOURCE_TOO_LARGE', 'GitHub managed file metadata exceeds the size limit');
    }
    let totalBytes = 0;
    const downloaded = await mapConcurrent(entries, async entry => {
      const response = await this.githubFetch(`/git/blobs/${encodeURIComponent(entry.sha)}`);
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new GitHubSyncError('GITHUB_API_FAILED', 'GitHub blob lookup failed', response.status);
      }
      const content = decodeBlob(await readJsonLimited(response), entry.size);
      totalBytes += new TextEncoder().encode(content).byteLength;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new GitHubSyncError('SOURCE_TOO_LARGE', 'GitHub managed source exceeds the size limit');
      }
      return { path: entry.path, content };
    });
    const files: SyncFile[] = [];
    let manifestContent: string | undefined;
    for (const file of downloaded) {
      if (file.path === SYNC_MANIFEST_PATH) manifestContent = file.content;
      else files.push({ ...file, contentHash: await sha256Hex(file.content) });
    }
    return {
      remoteRevision: tree.commitSha,
      files,
      ...(manifestContent !== undefined ? { manifestContent } : {}),
    };
  }

  async push(command: SyncPushCommand): Promise<{ remoteRevision: string }> {
    const repository = await this.readRepository();
    const branch = this.config.defaultBranch || repository.defaultBranch;
    const current = await this.readTree(branch, repository.size === 0);
    if (command.expectedRemoteRevision !== current.commitSha) {
      throw new GitHubSyncError('REMOTE_CHANGED', 'GitHub branch changed before sync push', 409);
    }
    const desired = new Map<string, SyncFile>();
    let totalBytes = 0;
    for (const file of command.files) {
      if ((!parseSyncPath(file.path) && file.path !== SYNC_MANIFEST_PATH) || desired.has(file.path)) {
        throw new Error('Sync push contains an invalid or duplicate path');
      }
      const size = new TextEncoder().encode(file.content).byteLength;
      totalBytes += size;
      if (size > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
        throw new GitHubSyncError('SOURCE_TOO_LARGE', 'Sync push exceeds the size limit');
      }
      desired.set(file.path, file);
    }
    const currentManaged = current.entries.filter(entry =>
      entry.type === 'blob' && (parseSyncPath(entry.path) || entry.path === SYNC_MANIFEST_PATH));
    const treeEntries: Array<Record<string, unknown>> = [
      ...Array.from(desired.values()).map(file => ({
        path: file.path,
        mode: '100644',
        type: 'blob',
        content: file.content,
      })),
      ...currentManaged.filter(entry => !desired.has(entry.path)).map(entry => ({
        path: entry.path,
        mode: '100644',
        type: 'blob',
        sha: null,
      })),
    ].sort((left, right) => String(left.path).localeCompare(String(right.path)));
    const treeResponse = await this.githubFetch('/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        ...(current.treeSha ? { base_tree: current.treeSha } : {}),
        tree: treeEntries,
      }),
    });
    if (treeResponse.status !== 201) {
      await treeResponse.body?.cancel();
      throw new GitHubSyncError('GITHUB_API_FAILED', 'GitHub tree creation failed', treeResponse.status);
    }
    const treeRecord = parseRecord(await readJsonLimited(treeResponse));
    if (typeof treeRecord?.sha !== 'string' || !treeRecord.sha) {
      throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub tree response is invalid');
    }
    const commitResponse = await this.githubFetch('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: command.message,
        tree: treeRecord.sha,
        parents: current.commitSha === EMPTY_REMOTE_REVISION ? [] : [current.commitSha],
      }),
    });
    if (commitResponse.status !== 201) {
      await commitResponse.body?.cancel();
      throw new GitHubSyncError('GITHUB_API_FAILED', 'GitHub commit creation failed', commitResponse.status);
    }
    const commitRecord = parseRecord(await readJsonLimited(commitResponse));
    if (typeof commitRecord?.sha !== 'string' || !commitRecord.sha) {
      throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub commit response is invalid');
    }
    const refResponse = current.commitSha === EMPTY_REMOTE_REVISION
      ? await this.githubFetch('/git/refs', {
          method: 'POST',
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitRecord.sha }),
        })
      : await this.githubFetch(`/git/refs/heads/${encodeURIComponent(branch)}`, {
          method: 'PATCH',
          body: JSON.stringify({ sha: commitRecord.sha, force: false }),
        });
    if (refResponse.status === 409 || refResponse.status === 422) {
      await refResponse.body?.cancel();
      throw new GitHubSyncError('REMOTE_CHANGED', 'GitHub branch changed while publishing sync commit', refResponse.status);
    }
    if (refResponse.status !== 200 && refResponse.status !== 201) {
      await refResponse.body?.cancel();
      const code = refResponse.status === 401 || refResponse.status === 403
        ? 'REPOSITORY_READ_ONLY'
        : 'GITHUB_API_FAILED';
      throw new GitHubSyncError(code, 'GitHub branch update failed', refResponse.status);
    }
    await refResponse.body?.cancel();
    return { remoteRevision: commitRecord.sha };
  }

  private async readRepository(): Promise<RepositoryResponse> {
    const response = await this.githubFetch('');
    if ([401, 403, 404].includes(response.status)) {
      await response.body?.cancel();
      throw new GitHubSyncError(
        'REPOSITORY_ACCESS_DENIED',
        'Private repository is not accessible with the configured PAT',
        response.status,
      );
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new GitHubSyncError('GITHUB_API_FAILED', 'GitHub repository lookup failed', response.status);
    }
    const repository = parseRepository(await readJsonLimited(response));
    if (!repository || repository.fullName.toLowerCase() !==
        `${this.config.owner}/${this.config.repo}`.toLowerCase()) {
      throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub repository response is invalid');
    }
    if (!repository.private) {
      throw new GitHubSyncError('REPOSITORY_NOT_PRIVATE', 'GitHub sync repository must be private');
    }
    if (repository.archived || repository.disabled) {
      throw new GitHubSyncError('REPOSITORY_UNAVAILABLE', 'GitHub sync repository is unavailable');
    }
    if (!repository.push) {
      throw new GitHubSyncError('REPOSITORY_READ_ONLY', 'PAT requires repository Contents read and write permission');
    }
    return repository;
  }

  private async readTree(branch: string, repositoryEmpty: boolean): Promise<RemoteTree> {
    const refResponse = await this.githubFetch(`/git/ref/heads/${encodeURIComponent(branch)}`);
    if ((refResponse.status === 404 || refResponse.status === 409) && repositoryEmpty) {
      await refResponse.body?.cancel();
      return { commitSha: EMPTY_REMOTE_REVISION, treeSha: null, entries: [] };
    }
    if (refResponse.status !== 200) {
      await refResponse.body?.cancel();
      throw new GitHubSyncError('GITHUB_API_FAILED', 'GitHub branch lookup failed', refResponse.status);
    }
    const refRecord = parseRecord(await readJsonLimited(refResponse));
    const refObject = parseRecord(refRecord?.object);
    if (typeof refObject?.sha !== 'string' || !refObject.sha) {
      throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub branch response is invalid');
    }
    const commitResponse = await this.githubFetch(`/git/commits/${encodeURIComponent(refObject.sha)}`);
    if (commitResponse.status !== 200) {
      await commitResponse.body?.cancel();
      throw new GitHubSyncError('GITHUB_API_FAILED', 'GitHub commit lookup failed', commitResponse.status);
    }
    const commitRecord = parseRecord(await readJsonLimited(commitResponse));
    const treeRecord = parseRecord(commitRecord?.tree);
    if (typeof treeRecord?.sha !== 'string' || !treeRecord.sha) {
      throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub commit tree response is invalid');
    }
    const treeResponse = await this.githubFetch(
      `/git/trees/${encodeURIComponent(treeRecord.sha)}?recursive=1`,
    );
    if (treeResponse.status !== 200) {
      await treeResponse.body?.cancel();
      throw new GitHubSyncError('GITHUB_API_FAILED', 'GitHub tree lookup failed', treeResponse.status);
    }
    const responseRecord = parseRecord(await readJsonLimited(treeResponse));
    if (responseRecord?.truncated === true || !Array.isArray(responseRecord?.tree)) {
      throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub repository tree is invalid or truncated');
    }
    const entries: TreeEntry[] = [];
    for (const value of responseRecord.tree) {
      const entry = parseRecord(value);
      if (!entry || typeof entry.path !== 'string' || typeof entry.sha !== 'string' ||
          !['blob', 'tree', 'commit'].includes(String(entry.type)) ||
          (entry.size !== undefined && typeof entry.size !== 'number')) {
        throw new GitHubSyncError('GITHUB_RESPONSE_INVALID', 'GitHub tree entry is invalid');
      }
      entries.push({
        path: entry.path,
        sha: entry.sha,
        type: entry.type as TreeEntry['type'],
        ...(typeof entry.size === 'number' ? { size: entry.size } : {}),
      });
    }
    return { commitSha: refObject.sha, treeSha: treeRecord.sha, entries };
  }

  private async githubFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const method = init.method || 'GET';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const request = this.request;
        const response = await request(`${this.endpoint}${path}`, {
          ...init,
          method,
          signal: controller.signal,
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${this.config.pat}`,
            'Content-Type': 'application/json',
            'User-Agent': 'sing-sub-worker',
            'X-GitHub-Api-Version': '2022-11-28',
            ...init.headers,
          },
        });
        const retryable = method === 'GET' && (response.status === 429 || [502, 503, 504].includes(response.status));
        if (!retryable || attempt === 2) return response;
        await response.body?.cancel();
      } catch (error) {
        if (attempt === 2) {
          const message = error instanceof Error && error.name === 'AbortError'
            ? 'GitHub request timed out'
            : 'GitHub request failed';
          throw new GitHubSyncError('GITHUB_API_FAILED', message, 504);
        }
      } finally {
        clearTimeout(timeout);
      }
      await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)));
    }
    throw new GitHubSyncError('GITHUB_API_FAILED', 'GitHub request failed', 504);
  }
}

export class GitHubSyncGatewayFactory implements SyncGatewayFactory {
  constructor(private readonly request?: typeof fetch) {}

  async connect(
    input: Omit<SyncRepositoryConnection, 'defaultBranch'>,
  ): Promise<SyncRepositoryConnection> {
    const provisional = new GitHubSyncGateway({ ...input, defaultBranch: 'main', fetch: this.request });
    const repository = await provisional.inspectRepository();
    return { ...input, defaultBranch: repository.defaultBranch };
  }

  create(connection: SyncRepositoryConnection): SyncGateway {
    return new GitHubSyncGateway({ ...connection, fetch: this.request });
  }
}
