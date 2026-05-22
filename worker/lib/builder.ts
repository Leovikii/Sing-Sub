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

function parseKeywords(str: string): string[] {
  return str ? str.split(',').map(k => k.trim()).filter(Boolean) : [];
}

function matchesFilter(tag: string, include: string, exclude: string): boolean {
  const incKws = parseKeywords(include);
  const excKws = parseKeywords(exclude);
  const isIncluded = incKws.length === 0 || incKws.some(kw => tag.includes(kw));
  const isExcluded = excKws.length > 0 && excKws.some(kw => tag.includes(kw));
  return isIncluded && !isExcluded;
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
  const [template, nodesData] = await Promise.all([
    fetchJson(profile.templateUrl) as Promise<Record<string, unknown>>,
    fetchRepoJson(profile.nodesPath, session),
  ]);

  if (nodesData) {
    const inboundsArray = normalizeArray<Inbound>(nodesData, 'inbounds');
    let filtered: Inbound[];

    if (profile.inboundRules && profile.inboundRules.length > 0) {
      filtered = inboundsArray.filter(inbound => {
        if (!inbound.tag) return false;
        return profile.inboundRules.some(rule =>
          matchesFilter(inbound.tag!, rule.include, rule.exclude)
        );
      });
    } else {
      filtered = inboundsArray;
    }

    if (filtered.length > 0) {
      const existingInbounds = Array.isArray(template.inbounds) ? template.inbounds : [];
      template.inbounds = [...existingInbounds, ...filtered];
    }
  }

  if (nodesData) {
    const outboundsArray = normalizeArray<Outbound>(nodesData, 'outbounds');

    if (outboundsArray.length > 0) {
      if (!Array.isArray(template.outbounds)) {
        template.outbounds = [];
      }
      const templateOutbounds = template.outbounds as Outbound[];
      templateOutbounds.forEach(outbound => {
        const rule = profile.rules.find(r => r.group === outbound.tag);
        if (rule && Array.isArray(outbound.outbounds)) {
          const matched = outboundsArray
            .filter(n => n.tag && matchesFilter(n.tag, rule.include, rule.exclude))
            .map(n => n.tag!);
          outbound.outbounds.push(...matched);
        }
      });
      templateOutbounds.push(...outboundsArray);
    }
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
