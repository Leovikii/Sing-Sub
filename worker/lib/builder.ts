import type { Env, Profile } from '../types';
import { fetchFileContent, type RepoSession } from './github';

interface Outbound {
  tag?: string;
  type?: string;
  outbounds?: string[];
  [key: string]: unknown;
}

interface Inbound {
  tag?: string;
  type?: string;
  [key: string]: unknown;
}

function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item));
}

function deepMerge<T extends Record<string, any>>(target: T, source: Record<string, any>): T {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          (output as any)[key] = deepMerge((target as any)[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function parseKeywords(str: string): string[] {
  return str ? str.split(',').map(k => k.trim()).filter(Boolean) : [];
}

function applyFilters<T extends { tag?: string }>(nodes: T[], filters: { action: 'include' | 'exclude'; keyword: string }[]): T[] {
  let result = [...nodes];
  for (const filter of filters) {
    if (!filter || !filter.action) continue;
    const kws = parseKeywords(filter.keyword);
    if (kws.length === 0) continue;
    if (filter.action === 'include') {
      result = result.filter(n => n.tag && kws.some(kw => n.tag!.includes(kw)));
    } else if (filter.action === 'exclude') {
      result = result.filter(n => n.tag && !kws.some(kw => n.tag!.includes(kw)));
    }
  }
  return result;
}

function normalizeArray<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj[key])) return obj[key] as T[];
    if (obj.type && obj.tag) return [data as T];
  }
  return [];
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'sing-sub-worker',
      'Accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.json();
}

async function fetchRepoJson(path: string, session: RepoSession): Promise<unknown> {
  if (!path) return null;
  const file = await fetchFileContent(path, session);
  if (!file) return null;
  return JSON.parse(file.content);
}

export async function buildProfile(profile: Profile, session: RepoSession): Promise<string> {
  const templateUrl = profile.templateUrl;
  const isExternalTemplate = templateUrl.startsWith('http://') || templateUrl.startsWith('https://');

  const [template, nodesData] = await Promise.all([
    (isExternalTemplate 
      ? fetchJson(templateUrl) 
      : fetchRepoJson(templateUrl, session)) as Promise<Record<string, unknown>>,
    fetchRepoJson(profile.nodesPath, session),
  ]);

  if (nodesData) {
    const inboundsArray = normalizeArray<Inbound>(nodesData, 'inbounds');
    let templateInbounds = Array.isArray(template.inbounds) ? template.inbounds : [];
    if (profile.inboundRules && profile.inboundRules.length > 0) {
      profile.inboundRules.forEach(rule => {
        if (!rule.tag || !rule.filters) return;
        const matched = applyFilters(inboundsArray, rule.filters);
        if (matched.length > 0) {
          const idx = templateInbounds.findIndex((i: any) => i.tag === rule.tag);
          if (idx !== -1) {
            templateInbounds.splice(idx + 1, 0, ...matched);
          } else {
            templateInbounds.push(...matched);
          }
        }
      });
      // Remove duplicates by JSON stringification or just Set if exact object refs
      template.inbounds = Array.from(new Set(templateInbounds));
    }
  }

  if (nodesData) {
    const outboundsArray = normalizeArray<Outbound>(nodesData, 'outbounds');

    if (outboundsArray.length > 0) {
      if (!Array.isArray(template.outbounds)) {
        template.outbounds = [];
      }
      const templateOutbounds = template.outbounds as Outbound[];
      const matchedOutbounds = new Set<Outbound>();

      templateOutbounds.forEach(outbound => {
        const rule = profile.rules.find(r => r.group === outbound.tag);
        if (rule && Array.isArray(outbound.outbounds) && rule.filters) {
          const matched = applyFilters(outboundsArray, rule.filters);
          outbound.outbounds.push(...matched.map(n => n.tag!));
          matched.forEach(n => matchedOutbounds.add(n));
        }
      });

      if (matchedOutbounds.size > 0) {
        templateOutbounds.push(...Array.from(matchedOutbounds));
      }
    }
  }

  if (profile.overrides) {
    template = deepMerge(template, profile.overrides);
  }

  return JSON.stringify(template, null, 2);
}

export async function buildAllProfiles(
  profiles: Profile[],
  session: RepoSession,
  subToken: string,
  env: Env
): Promise<void> {
  await Promise.all(
    profiles.map(async (profile) => {
      const config = await buildProfile(profile, session);
      await env.SESSIONS.put(`config:${subToken}:${profile.name}`, config);
    })
  );
}
