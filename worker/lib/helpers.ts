import type { Env, UserSettings, Profile } from '../types';
import type { RepoSession } from './github';
import { fetchFileContent, fetchDirectoryContents, GithubApiError } from './github';
import { buildAllProfiles, buildProfile } from './builder';
import { configCacheKey, listAllKvKeys } from './kv';

export function pLimit(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount < concurrency) {
      return run(fn);
    }
    return new Promise<void>((resolve) => {
      queue.push(resolve);
    }).then(() => run(fn));
  };
}


export async function fetchAllProfiles(session: RepoSession): Promise<Profile[]> {
  const files = await fetchDirectoryContents('sing-sub/configs', session);
  const jsonFiles = files.filter(f => f.toLowerCase().endsWith('.json'));
  const limit = pLimit(3);
  const profileResults = await Promise.all(jsonFiles.map(path => limit(async () => {
    try {
      const file = await fetchFileContent(path, session);
      if (file?.content) return JSON.parse(file.content) as Profile;
    } catch (error) {
      if (error instanceof GithubApiError) throw error;
    }
    return null;
  })));

  const profiles = profileResults.filter((p): p is Profile => p !== null);
  profiles.sort((a, b) => a.order - b.order);
  return profiles;
}

export async function fetchProfile(session: RepoSession, profileName: string): Promise<Profile | null> {
  const file = await fetchFileContent(`sing-sub/configs/${profileName}.json`, session);
  return file?.content ? JSON.parse(file.content) : null;
}

export function generateHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function toRepoSession(settings: UserSettings): RepoSession {
  return {
    owner: settings.owner,
    repo: settings.repo,
    pat: settings.pat,
    userLogin: settings.userLogin,
    defaultBranch: settings.defaultBranch || 'main',
  };
}

export async function rebuildWithWarning(
  session: RepoSession,
  subToken: string,
  env: Env,
): Promise<{ warning?: string }> {
  try {
    const profiles = await fetchAllProfiles(session);
    if (profiles.length > 0) {
      await buildAllProfiles(profiles, session, subToken, env);
    }
  } catch (e) {
    return { warning: e instanceof Error ? e.message : 'Build failed' };
  }
  return {};
}

export async function rebuildSingleWithWarning(
  session: RepoSession,
  subToken: string,
  env: Env,
  profileName: string
): Promise<{ warning?: string }> {
  try {
    const profile = await fetchProfile(session, profileName);
    if (profile) {
      const config = await buildProfile(profile, session);
      await env.SESSIONS.put(configCacheKey(subToken, session, profile.name), config);
    }
  } catch (e) {
    return { warning: e instanceof Error ? e.message : 'Build failed' };
  }
  return {};
}

export async function cleanupConfigCache(token: string, env: Env): Promise<void> {
  const keys = await listAllKvKeys(env, `config:${token}:`);
  await Promise.all(keys.map(key => env.SESSIONS.delete(key)));
}

export async function cleanupSubToken(token: string, env: Env): Promise<void> {
  await env.SESSIONS.delete(`sub:${token}`);
  await cleanupConfigCache(token, env);
}

export function subscriptionResponse(config: string): Response {
  return new Response(config, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Profile-Update-Interval': '3600',
    },
  });
}
