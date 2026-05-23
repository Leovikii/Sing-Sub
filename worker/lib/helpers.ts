import type { Env, UserSettings, StateData } from '../types';
import type { RepoSession } from './github';
import { fetchFileContent, putFileContent } from './github';
import { buildAllProfiles } from './builder';

const RULES_PATH = 'sing-sub/rules.json';

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
    const file = await fetchFileContent(RULES_PATH, session);
    if (file) {
      const state = JSON.parse(file.content) as StateData;
      await buildAllProfiles(state.profiles, session, subToken, env);
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
