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
): Promise<string[]> {
  const res = await repoFetch(`contents/${dirPath}`, session);
  if (!res.ok) return []; // Return empty array if directory doesn't exist (e.g. 404)
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

  const body: Record<string, unknown> = {
    message,
    content: encodeToBase64(content),
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
  const body = { message, sha };
  const res = await repoFetch(`contents/${filePath}`, session, {
    method: 'DELETE',
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub DELETE failed (${res.status}): ${err}`);
  }
}
