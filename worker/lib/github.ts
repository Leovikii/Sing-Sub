const GITHUB_API = 'https://api.github.com';

interface GithubRequestOptions {
  method?: string;
  body?: unknown;
}

export interface RepoSession {
  owner: string;
  repo: string;
  pat: string;
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

  const init: RequestInit = { method, headers };
  if (body) init.body = JSON.stringify(body);

  return fetch(`${GITHUB_API}${path}`, init);
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
  const binary = String.fromCharCode(...bytes);
  return btoa(binary);
}

export async function fetchFileContent(
  filePath: string,
  session: RepoSession
): Promise<{ content: string; sha: string } | null> {
  const res = await repoFetch(`contents/${filePath}`, session);
  if (!res.ok) return null;
  const data = await res.json() as { content: string; sha: string };
  return { content: decodeGithubContent(data.content), sha: data.sha };
}

export async function fetchDirectoryContents(
  dirPath: string,
  session: RepoSession
): Promise<string[] | null> {
  const res = await repoFetch(`contents/${dirPath}`, session);
  if (res.status === 404) return []; // Directory doesn't exist
  if (!res.ok) return null; // Other error, rate limit, etc.
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

  const botIdentity = { name: "Sing-Sub Bot", email: "bot@sing-sub.local" };
  const formattedMessage = message.startsWith('🤖') ? message : `🤖 Sing-Sub: ${message}`;

  const body: Record<string, unknown> = {
    message: formattedMessage,
    content: encodeToBase64(content),
    committer: botIdentity,
    author: botIdentity,
  };
  if (fileSha) body.sha = fileSha;

  const res = await repoFetch(`contents/${filePath}`, session, {
    method: 'PUT',
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub PUT failed (${res.status}): ${err}`);
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
  const botIdentity = { name: "Sing-Sub Bot", email: "bot@sing-sub.local" };
  const formattedMessage = message.startsWith('🤖') ? message : `🤖 Sing-Sub: ${message}`;

  const body = { 
    message: formattedMessage, 
    sha,
    committer: botIdentity,
    author: botIdentity
  };
  const res = await repoFetch(`contents/${filePath}`, session, {
    method: 'DELETE',
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub DELETE failed (${res.status}): ${err}`);
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
  branch: string = 'main'
): Promise<string> {
  const botIdentity = { name: "Sing-Sub Bot", email: "bot@sing-sub.local" };
  const formattedMessage = message.startsWith('🤖') ? message : `🤖 Sing-Sub: ${message}`;

  // 1. Get the latest commit SHA of the branch
  const refRes = await repoFetch(`git/refs/heads/${branch}`, session);
  if (!refRes.ok) throw new Error(`Failed to fetch branch ref: ${await refRes.text()}`);
  const refData = await refRes.json() as { object: { sha: string } };
  const latestCommitSha = refData.object.sha;

  // 2. Get the tree SHA of the latest commit
  const commitRes = await repoFetch(`git/commits/${latestCommitSha}`, session);
  if (!commitRes.ok) throw new Error(`Failed to fetch latest commit: ${await commitRes.text()}`);
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
  if (!treeRes.ok) throw new Error(`Failed to create git tree: ${await treeRes.text()}`);
  const treeData = await treeRes.json() as { sha: string };
  const newTreeSha = treeData.sha;

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
  if (!newCommitRes.ok) throw new Error(`Failed to create commit: ${await newCommitRes.text()}`);
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
  if (!updateRefRes.ok) throw new Error(`Failed to update branch ref: ${await updateRefRes.text()}`);

  return newCommitSha;
}
