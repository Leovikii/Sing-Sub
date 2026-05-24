import type { Env, UserSettings, StateData, Profile } from '../types';
import type { RepoSession } from './github';
import { fetchFileContent, putFileContent, fetchDirectoryContents } from './github';
import { buildAllProfiles } from './builder';

const RULES_PATH = 'sing-sub/rules.json';

export async function fetchAllProfiles(session: RepoSession): Promise<Profile[]> {
  let profiles: Profile[] = [];
  try {
    const files = await fetchDirectoryContents('sing-sub/configs', session);
    const jsonFiles = files.filter(f => f.toLowerCase().endsWith('.json'));
    
    await Promise.all(jsonFiles.map(async path => {
      try {
        const file = await fetchFileContent(path, session);
        if (file && file.content) {
          profiles.push(JSON.parse(file.content));
        }
      } catch {}
    }));
  } catch {}

  if (profiles.length === 0) {
    try {
      const file = await fetchFileContent(RULES_PATH, session);
      if (file && file.content) {
        const state = JSON.parse(file.content) as StateData;
        if (state.profiles) profiles = state.profiles;
      }
    } catch {}
  }
  return profiles;
}

export async function fetchProfile(session: RepoSession, profileName: string): Promise<Profile | null> {
  try {
    const file = await fetchFileContent(`sing-sub/configs/${profileName}.json`, session);
    if (file && file.content) {
      return JSON.parse(file.content);
    }
  } catch {}

  try {
    const file = await fetchFileContent(RULES_PATH, session);
    if (file && file.content) {
      const state = JSON.parse(file.content) as StateData;
      return state.profiles.find(p => p.name === profileName) || null;
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

export async function seedRepository(session: RepoSession): Promise<void> {
  try {
    const nodesPath = 'sing-sub/nodes/nodes.json';
    const nodesFile = await fetchFileContent(nodesPath, session);
    if (!nodesFile) {
      const defaultNodes = JSON.stringify({ inbounds: [], outbounds: [] }, null, 2);
      await putFileContent(nodesPath, session, defaultNodes, null, 'Auto-create default nodes.json');
    }
    
    const templatesPath = 'sing-sub/templates/template.json';
    const templatesFile = await fetchFileContent(templatesPath, session);
    if (!templatesFile) {
      const defaultTemplate = JSON.stringify({}, null, 2);
      await putFileContent(templatesPath, session, defaultTemplate, null, 'Auto-create default template.json');
    }

    const configsPath = 'sing-sub/configs/.gitkeep';
    const configsFile = await fetchFileContent(configsPath, session);
    if (!configsFile) {
      // Check if any json configs exist to avoid unnecessary commit if folder already has stuff
      const existingConfigs = await fetchDirectoryContents('sing-sub/configs', session);
      if (existingConfigs.length === 0) {
        await putFileContent(configsPath, session, 'keep', null, 'Auto-create configs directory');
      }
    }
  } catch {
    // Ignore seed errors to not block the main flow
  }
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
      const config = await import('./builder').then(m => m.buildProfile(profile, session));
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
  await Promise.all(list.keys.map(k => env.SESSIONS.delete(k.name)));
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
