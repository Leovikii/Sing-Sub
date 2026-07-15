import type {
  LegacyGithubSource,
  LegacySourceFile,
  LegacySourceReader,
} from '../../application/ports/legacy-source-reader';
import { parseLegacyManagedPath } from '../../domain/migration/legacy-managed-path';
import { repoFetch, type RepoSession } from '../../lib/github';

const MAX_FILES = 1000;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

interface GithubTreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  size?: number;
}

export class LegacySourceReadError extends Error {
  constructor(readonly reason: string) {
    super('Legacy GitHub source cannot be read');
    this.name = 'LegacySourceReadError';
  }
}

function decodeBase64(content: string): Uint8Array {
  try {
    const binary = atob(content.replace(/\s/g, ''));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    throw new LegacySourceReadError('GitHub blob is not valid base64');
  }
}

export class GithubLegacySourceReader implements LegacySourceReader {
  constructor(private readonly session: RepoSession) {}

  async read(): Promise<LegacyGithubSource> {
    const branch = this.session.defaultBranch || 'main';
    const refResponse = await repoFetch(`git/ref/heads/${encodeURIComponent(branch)}`, this.session);
    if (!refResponse.ok) throw new LegacySourceReadError(`Branch ref lookup failed with ${refResponse.status}`);
    const ref = await refResponse.json() as { object?: { sha?: unknown } };
    if (typeof ref.object?.sha !== 'string' || !ref.object.sha) {
      throw new LegacySourceReadError('Branch ref response has no commit SHA');
    }

    const treeResponse = await repoFetch(`git/trees/${encodeURIComponent(ref.object.sha)}?recursive=1`, this.session);
    if (!treeResponse.ok) throw new LegacySourceReadError(`Repository tree lookup failed with ${treeResponse.status}`);
    const tree = await treeResponse.json() as { truncated?: unknown; tree?: unknown };
    if (tree.truncated === true) throw new LegacySourceReadError('Repository tree is truncated');
    if (!Array.isArray(tree.tree)) throw new LegacySourceReadError('Repository tree response is invalid');

    const entries = (tree.tree as GithubTreeEntry[])
      .filter(entry => entry.type === 'blob' && parseLegacyManagedPath(entry.path) !== null)
      .sort((left, right) => left.path.localeCompare(right.path));
    if (entries.length > MAX_FILES) throw new LegacySourceReadError('Managed file count exceeds migration limit');
    if (entries.some(entry => !entry.sha || (entry.size !== undefined && entry.size > MAX_FILE_BYTES))) {
      throw new LegacySourceReadError('Managed file metadata exceeds migration limits');
    }

    const files = await Promise.all(entries.map(entry => this.readBlob(entry)));
    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) throw new LegacySourceReadError('Managed source exceeds migration size limit');
    return {
      owner: this.session.owner,
      repo: this.session.repo,
      branch,
      commitSha: ref.object.sha,
      files,
    };
  }

  private async readBlob(entry: GithubTreeEntry): Promise<LegacySourceFile> {
    const response = await repoFetch(`git/blobs/${encodeURIComponent(entry.sha)}`, this.session);
    if (!response.ok) throw new LegacySourceReadError(`Blob lookup failed with ${response.status}`);
    const blob = await response.json() as { content?: unknown; encoding?: unknown; size?: unknown };
    if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
      throw new LegacySourceReadError('GitHub blob response is not base64');
    }
    const bytes = decodeBase64(blob.content);
    if (bytes.byteLength > MAX_FILE_BYTES ||
        (typeof blob.size === 'number' && blob.size !== bytes.byteLength) ||
        (entry.size !== undefined && entry.size !== bytes.byteLength)) {
      throw new LegacySourceReadError('GitHub blob size does not match tree metadata');
    }
    try {
      return {
        path: entry.path,
        blobSha: entry.sha,
        content: decoder.decode(bytes),
        size: bytes.byteLength,
      };
    } catch {
      throw new LegacySourceReadError('GitHub blob is not valid UTF-8');
    }
  }
}
