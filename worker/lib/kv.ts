import type { Env } from '../types';

interface ConfigCacheScope {
  owner: string;
  repo: string;
  defaultBranch?: string;
}

export function configCachePrefix(token: string, scope: ConfigCacheScope): string {
  const repository = [scope.owner, scope.repo, scope.defaultBranch || 'main']
    .map(encodeURIComponent)
    .join('/');
  return `config:${token}:${repository}:`;
}

export function configCacheKey(token: string, scope: ConfigCacheScope, profileName: string): string {
  return `${configCachePrefix(token, scope)}${profileName}`;
}

export async function listAllKvKeys(env: Env, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.SESSIONS.list({ prefix, cursor });
    keys.push(...page.keys.map(key => key.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return keys;
}
