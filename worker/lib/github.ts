const GITHUB_API = 'https://api.github.com';

export class GithubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GithubApiError';
  }
}

interface GithubRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RepoSession {
  owner: string;
  repo: string;
  pat: string;
  userLogin?: string;
  defaultBranch?: string;
}

export async function githubFetch(
  path: string,
  pat: string,
  options: GithubRequestOptions = {},
): Promise<Response> {
  const { method = 'GET', body, headers: extraHeaders } = options;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${pat}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'sing-sub-worker',
    ...extraHeaders,
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined) init.body = JSON.stringify(body);
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
  options: GithubRequestOptions = {},
): Promise<Response> {
  const path = `/repos/${session.owner}/${session.repo}${endpoint ? `/${endpoint}` : ''}`;
  return githubFetch(path, session.pat, options);
}

export async function fetchRepository(
  owner: string,
  repo: string,
  pat: string,
): Promise<{ default_branch: string }> {
  const response = await githubFetch(`/repos/${owner}/${repo}`, pat);
  if (!response.ok) {
    throw new GithubApiError(`GitHub repository lookup failed (${response.status})`, response.status);
  }
  return response.json() as Promise<{ default_branch: string }>;
}

export function fetchUser(pat: string): Promise<Response> {
  return githubFetch('/user', pat);
}
