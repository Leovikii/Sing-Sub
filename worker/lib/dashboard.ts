import type { Env, Profile } from '../types';
import type { RepoSession } from './github';
import { fetchDirectoryListing, fetchFileContent, GithubApiError } from './github';
import { pLimit } from './helpers';
import { RULESET_METADATA_KEY } from './rulesets';

export interface AssetSnapshot {
  nodes: Array<{ path: string; note: string }>;
  templates: Array<{ path: string; note: string }>;
  patches: Array<{ path: string; note: string }>;
  rulesets: Array<{ path: string; note: string }>;
}

type AssetKind = keyof AssetSnapshot;

interface CachedAssetFile {
  path: string;
  sha: string;
  note: string;
}

interface CachedAssetDirectory {
  checkedAt: number;
  etag: string | null;
  files: CachedAssetFile[];
}

interface AssetCacheEnvelope {
  version: 3;
  revision: string;
  directories: Record<AssetKind, CachedAssetDirectory>;
}

const ASSET_CACHE_VERSION = 3;
const ASSET_CACHE_TTL_MS = 60_000;
const ASSET_DIRECTORIES: Record<AssetKind, string> = {
  nodes: 'sing-sub/nodes',
  templates: 'sing-sub/templates',
  patches: 'sing-sub/patches',
  rulesets: 'sing-sub/rulesets',
};

function scope(session: RepoSession): string {
  return `${encodeURIComponent(session.owner)}/${encodeURIComponent(session.repo)}/${encodeURIComponent(session.defaultBranch || 'main')}`;
}

function profileSnapshotKey(session: RepoSession): string {
  return `dashboard:${scope(session)}:profiles`;
}

function assetSnapshotKey(session: RepoSession): string {
  return `dashboard:${scope(session)}:assets`;
}

function assetRevisionKey(session: RepoSession): string {
  return `dashboard:${scope(session)}:assets-revision`;
}

function parseSnapshot<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseAssetCache(raw: string | null): AssetCacheEnvelope | null {
  const value = parseSnapshot<Partial<AssetCacheEnvelope>>(raw);
  if (!value || value.version !== ASSET_CACHE_VERSION || typeof value.revision !== 'string' || !value.directories) return null;
  const valid = (Object.keys(ASSET_DIRECTORIES) as AssetKind[]).every(kind => {
    const directory = value.directories?.[kind];
    return !!directory && typeof directory.checkedAt === 'number' && Array.isArray(directory.files);
  });
  return valid ? value as AssetCacheEnvelope : null;
}

function isFresh(directory: CachedAssetDirectory | undefined, now: number): boolean {
  return !!directory && now - directory.checkedAt < ASSET_CACHE_TTL_MS;
}

function toAssetSnapshot(cache: AssetCacheEnvelope): AssetSnapshot {
  const entries = (kind: AssetKind) => cache.directories[kind].files.map(({ path, note }) => ({ path, note }));
  return {
    nodes: entries('nodes'),
    templates: entries('templates'),
    patches: entries('patches'),
    rulesets: entries('rulesets'),
  };
}

function readNote(content: string): string {
  try {
    const data = JSON.parse(content);
    return typeof data[RULESET_METADATA_KEY]?.note === 'string'
      ? data[RULESET_METADATA_KEY].note
      : typeof data.note === 'string' ? data.note : '';
  } catch {
    return '';
  }
}

async function refreshAssetDirectory(
  kind: AssetKind,
  session: RepoSession,
  cached: CachedAssetDirectory | undefined,
  force: boolean,
  now: number,
  limit: ReturnType<typeof pLimit>,
): Promise<CachedAssetDirectory> {
  if (!force && isFresh(cached, now)) return cached!;

  try {
    const listing = await fetchDirectoryListing(ASSET_DIRECTORIES[kind], session, cached?.etag);
    if (listing.notModified && cached) {
      return { ...cached, checkedAt: now, etag: listing.etag };
    }

    if (listing.notModified) {
      throw new Error(`Unexpected 304 response for ${ASSET_DIRECTORIES[kind]}`);
    }

    const previous = new Map((cached?.files || []).map(file => [file.path, file]));
    const jsonFiles = listing.files.filter(file => file.path.toLowerCase().endsWith('.json'));
    const files = await Promise.all(jsonFiles.map(file => limit(async (): Promise<CachedAssetFile> => {
      const existing = previous.get(file.path);
      if (existing?.sha === file.sha) return existing;
      const loaded = await fetchFileContent(file.path, session);
      return { path: file.path, sha: file.sha, note: loaded ? readNote(loaded.content) : '' };
    })));

    return { checkedAt: now, etag: listing.etag, files };
  } catch (error) {
    const transient = error instanceof GithubApiError && (error.status === 429 || error.status >= 500);
    if (cached && transient) return cached;
    throw error;
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
  const kinds = Object.keys(ASSET_DIRECTORIES) as AssetKind[];
  let refreshRequired = force;

  for (let attempt = 0; attempt < 2; attempt++) {
    const [rawCache, revision] = await Promise.all([
      env.SESSIONS.get(assetSnapshotKey(session)),
      env.SESSIONS.get(assetRevisionKey(session)).then(value => value || '0'),
    ]);
    const parsedCache = parseAssetCache(rawCache);
    const cached = parsedCache?.revision === revision ? parsedCache : null;
    const now = Date.now();
    if (!refreshRequired && cached && kinds.every(kind => isFresh(cached.directories[kind], now))) {
      return toAssetSnapshot(cached);
    }

    const limit = pLimit(5);
    const refreshed = await Promise.all(kinds.map(async kind => [
      kind,
      await refreshAssetDirectory(kind, session, cached?.directories[kind], refreshRequired, now, limit),
    ] as const));
    const latestRevision = await env.SESSIONS.get(assetRevisionKey(session)).then(value => value || '0');
    if (latestRevision !== revision) {
      refreshRequired = true;
      continue;
    }

    const directories = Object.fromEntries(refreshed) as Record<AssetKind, CachedAssetDirectory>;
    const next: AssetCacheEnvelope = { version: ASSET_CACHE_VERSION, revision, directories };
    await env.SESSIONS.put(assetSnapshotKey(session), JSON.stringify(next));
    return toAssetSnapshot(next);
  }

  throw new Error('Assets changed during refresh; retry the request');
}

export async function invalidateAssetSnapshot(env: Env, session: RepoSession): Promise<void> {
  await env.SESSIONS.put(assetRevisionKey(session), crypto.randomUUID());
  await env.SESSIONS.delete(assetSnapshotKey(session));
}
