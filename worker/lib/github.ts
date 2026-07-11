const GITHUB_API = 'https://api.github.com';

export class GithubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GithubApiError';
    this.status = status;
  }
}

interface GithubRequestOptions {
  method?: string;
  body?: unknown;
}

export interface RepoSession {
  owner: string;
  repo: string;
  pat: string;
  userLogin?: string;
  defaultBranch?: string;
}

export async function fetchRepository(owner: string, repo: string, pat: string): Promise<{ default_branch: string }> {
  const res = await githubFetch(`/repos/${owner}/${repo}`, pat);
  if (!res.ok) {
    throw new GithubApiError(`GitHub repository lookup failed (${res.status}): ${await res.text()}`, res.status);
  }
  return res.json() as Promise<{ default_branch: string }>;
}

function commitIdentity(): { name: string; email: string } {
  return { name: 'Sing-Sub Bot', email: 'sing-sub@users.noreply.github.com' };
}

function formatCommitMessage(message: string): string {
  return message.trim().replace(/\s+/g, ' ');
}

export async function githubFetch(
  path: string,
  pat: string,
  options: GithubRequestOptions = {}
): Promise<Response> {
  const { method = 'GET', body } = options;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${pat}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'sing-sub-worker',
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body) init.body = JSON.stringify(body);
      const response = await fetch(`${GITHUB_API}${path}`, init);
      const retryable = method === 'GET' && (response.status === 429 || [502, 503, 504].includes(response.status));
      if (!retryable || attempt === 2) return response;
      await response.body?.cancel();
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 5_000) : 300 * (2 ** attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      if (attempt === 2) {
        const detail = error instanceof Error && error.name === 'AbortError' ? 'request timed out' : 'request failed';
        throw new GithubApiError(`GitHub ${detail}`, 504);
      }
      await new Promise(resolve => setTimeout(resolve, 300 * (2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new GithubApiError('GitHub request failed', 504);
}

export function repoFetch(
  endpoint: string,
  session: RepoSession,
  options: GithubRequestOptions = {}
): Promise<Response> {
  const path = `/repos/${session.owner}/${session.repo}${endpoint ? '/' + endpoint : ''}`;
  return githubFetch(path, session.pat, options);
}

export function fetchUser(pat: string): Promise<Response> {
  return githubFetch('/user', pat);
}

function decodeGithubContent(content: string): string {
  const cleaned = content.replace(/\n/g, '');
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + chunkSize)));
  }
  return btoa(chunks.join(''));
}

export async function fetchFileContent(
  filePath: string,
  session: RepoSession
): Promise<{ content: string; sha: string } | null> {
  const res = await repoFetch(`contents/${filePath}?ref=${encodeURIComponent(session.defaultBranch || 'main')}`, session);
  if (res.status === 404) return null;
  if (!res.ok) throw new GithubApiError(`GitHub file lookup failed (${res.status}): ${await res.text()}`, res.status);
  const data = await res.json() as { content: string; sha: string };
  return { content: decodeGithubContent(data.content), sha: data.sha };
}

export async function fetchRawFile(
  filePath: string,
  session: RepoSession
): Promise<Response> {
  const headers = {
    'Authorization': `Bearer ${session.pat}`,
    'Accept': 'application/vnd.github.v3.raw',
    'User-Agent': 'sing-sub-worker',
  };
  return fetch(`${GITHUB_API}/repos/${session.owner}/${session.repo}/contents/${filePath}?ref=${encodeURIComponent(session.defaultBranch || 'main')}`, { headers });
}

export async function fetchDirectoryContents(
  dirPath: string,
  session: RepoSession
): Promise<string[] | null> {
  const res = await repoFetch(`contents/${dirPath}?ref=${encodeURIComponent(session.defaultBranch || 'main')}`, session);
  if (res.status === 404) return []; // Directory doesn't exist
  if (!res.ok) throw new GithubApiError(`GitHub directory lookup failed (${res.status}): ${await res.text()}`, res.status);
  const data = await res.json() as Array<{ name: string; path: string; type: string }>;
  if (!Array.isArray(data)) return [];
  // Return only file paths, ignore subdirectories
  return data.filter(item => item.type === 'file').map(item => item.path);
}

export async function putFileContent(
  filePath: string,
  session: RepoSession,
  content: string,
  sha: string | null,
  message: string
): Promise<{ sha: string }> {
  let fileSha = sha;
  if (!fileSha) {
    try {
      const existing = await fetchFileContent(filePath, session);
      if (existing) fileSha = existing.sha;
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }

  const identity = commitIdentity();
  const formattedMessage = formatCommitMessage(message);

  const body: Record<string, unknown> = {
    message: formattedMessage,
    content: encodeToBase64(content),
    committer: identity,
    author: identity,
    branch: session.defaultBranch || 'main',
  };
  if (fileSha) body.sha = fileSha;

  const res = await repoFetch(`contents/${filePath}`, session, {
    method: 'PUT',
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new GithubApiError(`GitHub PUT failed (${res.status}): ${err}`, res.status);
  }

  const result = await res.json() as { content: { sha: string } };
  return { sha: result.content.sha };
}

export async function deleteFileContent(
  filePath: string,
  session: RepoSession,
  sha: string,
  message: string
): Promise<void> {
  const identity = commitIdentity();
  const formattedMessage = formatCommitMessage(message);

  const body = {
    message: formattedMessage,
    sha,
    committer: identity,
    author: identity,
    branch: session.defaultBranch || 'main',
  };
  const res = await repoFetch(`contents/${filePath}`, session, {
    method: 'DELETE',
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new GithubApiError(`GitHub DELETE failed (${res.status}): ${err}`, res.status);
  }
}

export interface GitTreeItem {
  path: string;
  mode: '100644' | '100755' | '040000' | '160000' | '120000';
  type: 'blob' | 'tree' | 'commit';
  content?: string;
  sha?: string | null;
}

export async function commitMultiFiles(
  session: RepoSession,
  treeItems: GitTreeItem[],
  message: string,
  branch: string = session.defaultBranch || 'main'
): Promise<string> {
  const botIdentity = commitIdentity();
  const formattedMessage = formatCommitMessage(message);

  const refRes = await repoFetch(`git/refs/heads/${branch}`, session);
  if (refRes.status === 404) {
    const treeRes = await repoFetch('git/trees', session, { method: 'POST', body: { tree: treeItems } });
    if (!treeRes.ok) throw new GithubApiError(`Failed to create initial git tree: ${await treeRes.text()}`, treeRes.status);
    const tree = await treeRes.json() as { sha: string };
    const commitRes = await repoFetch('git/commits', session, {
      method: 'POST',
      body: { message: formattedMessage, tree: tree.sha, parents: [], author: botIdentity, committer: botIdentity },
    });
    if (!commitRes.ok) throw new GithubApiError(`Failed to create initial commit: ${await commitRes.text()}`, commitRes.status);
    const commit = await commitRes.json() as { sha: string };
    const createRefRes = await repoFetch('git/refs', session, {
      method: 'POST',
      body: { ref: `refs/heads/${branch}`, sha: commit.sha },
    });
    if (!createRefRes.ok) throw new GithubApiError(`Failed to create branch ref: ${await createRefRes.text()}`, createRefRes.status);
    return commit.sha;
  }
  if (!refRes.ok) throw new GithubApiError(`Failed to fetch branch ref: ${await refRes.text()}`, refRes.status);
  const refData = await refRes.json() as { object: { sha: string } };
  const latestCommitSha = refData.object.sha;

  // 2. Get the tree SHA of the latest commit
  const commitRes = await repoFetch(`git/commits/${latestCommitSha}`, session);
  if (!commitRes.ok) throw new GithubApiError(`Failed to fetch latest commit: ${await commitRes.text()}`, commitRes.status);
  const commitData = await commitRes.json() as { tree: { sha: string } };
  const baseTreeSha = commitData.tree.sha;

  // 3. Create a new Tree
  const treeRes = await repoFetch(`git/trees`, session, {
    method: 'POST',
    body: {
      base_tree: baseTreeSha,
      tree: treeItems,
    }
  });
  if (!treeRes.ok) throw new GithubApiError(`Failed to create git tree: ${await treeRes.text()}`, treeRes.status);
  const treeData = await treeRes.json() as { sha: string };
  const newTreeSha = treeData.sha;
  if (newTreeSha === baseTreeSha) return latestCommitSha;

  // 4. Create a new Commit
  const newCommitRes = await repoFetch(`git/commits`, session, {
    method: 'POST',
    body: {
      message: formattedMessage,
      tree: newTreeSha,
      parents: [latestCommitSha],
      author: botIdentity,
      committer: botIdentity
    }
  });
  if (!newCommitRes.ok) throw new GithubApiError(`Failed to create commit: ${await newCommitRes.text()}`, newCommitRes.status);
  const newCommitData = await newCommitRes.json() as { sha: string };
  const newCommitSha = newCommitData.sha;

  // 5. Update the branch reference
  const updateRefRes = await repoFetch(`git/refs/heads/${branch}`, session, {
    method: 'PATCH',
    body: {
      sha: newCommitSha,
      force: false
    }
  });
  if (!updateRefRes.ok) {
    // A 422 here typically means the branch moved concurrently (stale base tree).
    const status = updateRefRes.status === 422 ? 409 : updateRefRes.status;
    throw new GithubApiError(`Failed to update branch ref: ${await updateRefRes.text()}`, status);
  }

  return newCommitSha;
}
