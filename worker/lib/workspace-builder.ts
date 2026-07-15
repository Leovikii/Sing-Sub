import type { Profile, WorkspaceSnapshot } from '../../shared';
import { buildProfile, type BuildResourceLoader } from './builder';

const PUBLIC_RULESET_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\.(?:json|srs)$/;

function localAsset(snapshot: WorkspaceSnapshot, path: string): unknown {
  for (const assets of Object.values(snapshot.assets)) {
    const asset = Object.values(assets).find(candidate => candidate.path === path);
    if (asset) return structuredClone(asset.content);
  }
  return null;
}

export async function buildProfileFromWorkspace(
  profile: Profile,
  snapshot: WorkspaceSnapshot,
  origin?: string,
): Promise<string> {
  const resources: BuildResourceLoader = {
    loadTemplate: async source => {
      if (/^https?:\/\//i.test(source)) throw new Error('External templates are not supported');
      return localAsset(snapshot, source);
    },
    loadRepoJson: async path => localAsset(snapshot, path),
  };
  const config = await buildProfile(profile, resources);
  return origin ? normalizeLegacyRulesetUrls(config, origin) : config;
}

export function normalizeLegacyRulesetUrls(config: string, origin: string): string {
  const expectedOrigin = new URL(origin).origin;
  const document = JSON.parse(config) as unknown;

  function normalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    if (typeof value !== 'string') return value;
    let url: URL;
    try {
      url = new URL(value, expectedOrigin);
    } catch {
      return value;
    }
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.origin !== expectedOrigin || segments.length !== 3 || segments[0] !== 'rules' ||
        !segments[1] || !PUBLIC_RULESET_NAME.test(segments[2])) return value;
    url.pathname = `/rules/${segments[2]}`;
    return url.toString();
  }

  return JSON.stringify(normalize(document), null, 2);
}
