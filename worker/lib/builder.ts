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

function smartMerge(target: any, source: any): any {
  if (Array.isArray(source)) {
    return source;
  }
  if (isObject(source)) {
    if (source['$set'] !== undefined) return source['$set'];
    
    if (Array.isArray(target) && (source['$prepend'] || source['$append'] || source['$remove'] || source['$replace'])) {
      let result = [...target];
      if (source['$remove']) {
        const toRemove = Array.isArray(source['$remove']) ? source['$remove'] : [source['$remove']];
        result = result.filter(item => {
          return !toRemove.some((rm: any) => {
            if (!isObject(item) || !isObject(rm)) return item === rm;
            return Object.keys(rm).every(k => item[k] === rm[k]);
          });
        });
      }
      if (source['$replace']) {
        const replaces = Array.isArray(source['$replace']) ? source['$replace'] : [source['$replace']];
        result = result.map(item => {
          for (const rep of replaces) {
            if (rep.match && rep.with) {
              const matches = Object.keys(rep.match).every(k => {
                if (!isObject(item)) return false;
                return item[k] === rep.match[k];
              });
              if (matches) return rep.with;
            }
          }
          return item;
        });
      }
      if (source['$prepend']) {
        const prep = Array.isArray(source['$prepend']) ? source['$prepend'] : [source['$prepend']];
        result = [...prep, ...result];
      }
      if (source['$append']) {
        const app = Array.isArray(source['$append']) ? source['$append'] : [source['$append']];
        result = [...result, ...app];
      }
      return result;
    }
    
    const output: any = { ...target };
    Object.keys(source).forEach(key => {
      if (isObject(source[key]) || Array.isArray(source[key])) {
        if (!(key in target)) {
          output[key] = source[key];
        } else {
          output[key] = smartMerge(target[key], source[key]);
        }
      } else {
        output[key] = source[key];
      }
    });
    return output;
  }
  return source;
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

  let [template, nodesData] = await Promise.all([
    (isExternalTemplate 
      ? fetchJson(templateUrl) 
      : fetchRepoJson(templateUrl, session)) as Promise<Record<string, unknown>>,
    fetchRepoJson(profile.nodesPath, session),
  ]);
  
  template = template || {};

  // Step 1: Apply overrides first
  if (profile.overrides) {
    template = smartMerge(template, profile.overrides);
  }

  // Step 2: Apply patch (before node insertion, so patch modifications to
  // template structure are in place before we inject nodes into it)
  if (profile.patchUrl) {
    const patch = await fetchRepoJson(profile.patchUrl, session) as Record<string, unknown>;
    if (patch) {
      template = smartMerge(template, patch);
    }
  }

  // Step 3: Insert inbound nodes
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
      template.inbounds = Array.from(new Set(templateInbounds));
    }
  }

  // Step 4: Insert outbound nodes
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

  return JSON.stringify(template, null, 2);
}

export async function buildAllProfiles(
  profiles: Profile[],
  session: RepoSession,
  subToken: string,
  env: Env
): Promise<void> {
  const prefix = `config:${subToken}:`;
  const list = await env.SESSIONS.list({ prefix });
  const currentNames = profiles.map(p => p.name);

  await Promise.all([
    ...list.keys.map(async (key: any) => {
      const name = key.name.substring(prefix.length);
      if (!currentNames.includes(name)) {
        await env.SESSIONS.delete(key.name);
      }
    }),
    ...profiles.map(async (profile) => {
      const config = await buildProfile(profile, session);
      await env.SESSIONS.put(`config:${subToken}:${profile.name}`, config);
    })
  ]);
}
