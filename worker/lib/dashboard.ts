import type { Env, Profile } from '../types';
import type { RepoSession } from './github';
import { fetchDirectoryContents, fetchFileContent } from './github';
import { pLimit } from './helpers';
import { RULESET_METADATA_KEY } from './rulesets';

export interface AssetSnapshot {
  nodes: Array<{ path: string; note: string }>;
  templates: Array<{ path: string; note: string }>;
  patches: Array<{ path: string; note: string }>;
  rulesets: Array<{ path: string; note: string }>;
}

function scope(session: RepoSession): string {
  return `${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}/${encodeURIComponent(session.defaultBranch || 'main')}`;
}

function profileSnapshotKey(session: RepoSession): string {
  return `dashboard:${scope(session)}:profiles`;
}

function assetSnapshotKey(session: RepoSession): string {
  return `dashboard:${scope(session)}:assets`;
}

function parseSnapshot<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function getProfileSnapshot(env: Env, session: RepoSession): Promise<Profile[] | null> {
  const profiles = parseSnapshot<unknown>(await env.SESSIONS.get(profileSnapshotKey(session)));
  return Array.isArray(profiles) ? profiles as Profile[] : null;
}

export function putProfileSnapshot(env: Env, session: RepoSession, profiles: Profile[]): Promise<void> {
  return env.SESSIONS.put(profileSnapshotKey(session), JSON.stringify(profiles));
}

export function invalidateProfileSnapshot(env: Env, session: RepoSession): Promise<void> {
  return env.SESSIONS.delete(profileSnapshotKey(session));
}

export async function getAssetSnapshot(env: Env, session: RepoSession, force = false): Promise<AssetSnapshot> {
  if (!force) {
    const cached = parseSnapshot<AssetSnapshot>(await env.SESSIONS.get(assetSnapshotKey(session)));
    if (cached && Array.isArray(cached.nodes) && Array.isArray(cached.templates) &&
        Array.isArray(cached.patches) && Array.isArray(cached.rulesets)) {
      return cached;
    }
  }

  const [nodes, templates, patches, rulesets] = await Promise.all([
    fetchDirectoryContents('sing-sub/nodes', session),
    fetchDirectoryContents('sing-sub/templates', session),
    fetchDirectoryContents('sing-sub/patches', session),
    fetchDirectoryContents('sing-sub/rulesets', session),
  ]);
  const jsonFiles = (paths: string[] | null) => (paths || []).filter(path => path.toLowerCase().endsWith('.json'));
  const limit = pLimit(5);
  const readSummary = (path: string) => limit(async () => {
    try {
      const file = await fetchFileContent(path, session);
      if (file?.content) {
        const data = JSON.parse(file.content);
        return {
          path,
          note: typeof data[RULESET_METADATA_KEY]?.note === 'string'
            ? data[RULESET_METADATA_KEY].note
            : typeof data.note === 'string'
              ? data.note
              : '',
        };
      }
    } catch { /* Malformed assets remain available without metadata. */ }
    return { path, note: '' };
  });

  const snapshot: AssetSnapshot = {
    nodes: await Promise.all(jsonFiles(nodes).map(readSummary)),
    templates: await Promise.all(jsonFiles(templates).map(readSummary)),
    patches: await Promise.all(jsonFiles(patches).map(readSummary)),
    rulesets: await Promise.all(jsonFiles(rulesets).map(readSummary)),
  };
  await env.SESSIONS.put(assetSnapshotKey(session), JSON.stringify(snapshot));
  return snapshot;
}

export function invalidateAssetSnapshot(env: Env, session: RepoSession): Promise<void> {
  return env.SESSIONS.delete(assetSnapshotKey(session));
}
