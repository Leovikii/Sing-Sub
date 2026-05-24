import type { Env, UserSettings, Profile } from '../types';
import type { RepoSession } from './github';
import { fetchFileContent, fetchDirectoryContents } from './github';
import { buildAllProfiles, buildProfile } from './builder';


export async function fetchAllProfiles(session: RepoSession): Promise<Profile[]> {
  let profiles: Profile[] = [];
  try {
    const files = await fetchDirectoryContents('sing-sub/configs', session);
    const jsonFiles = (files || []).filter(f => f.toLowerCase().endsWith('.json'));
    
    await Promise.all(jsonFiles.map(async path => {
      try {
        const file = await fetchFileContent(path, session);
        if (file && file.content) {
          profiles.push(JSON.parse(file.content));
        }
      } catch {}
    }));
  } catch {}

  return profiles;
}

export async function fetchProfile(session: RepoSession, profileName: string): Promise<Profile | null> {
  try {
    const file = await fetchFileContent(`sing-sub/configs/${profileName}.json`, session);
    if (file && file.content) {
      return JSON.parse(file.content);
    }
  } catch {}

  return null;
}

export function generateHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function toRepoSession(settings: UserSettings): RepoSession {
  return { owner: settings.owner, repo: settings.repo, pat: settings.pat };
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
      await env.SESSIONS.put(`config:${subToken}:${profile.name}`, config);
    }
  } catch (e) {
    return { warning: e instanceof Error ? e.message : 'Build failed' };
  }
  return {};
}

export async function cleanupSubToken(token: string, env: Env): Promise<void> {
  await env.SESSIONS.delete(`sub:${token}`);
  const list = await env.SESSIONS.list({ prefix: `config:${token}:` });
  await Promise.all(list.keys.map((k: any) => env.SESSIONS.delete(k.name)));
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
