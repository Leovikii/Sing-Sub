import type { Env, Profile } from '../types';
import { fetchFileContent, type RepoSession } from './github';
import { pLimit } from './helpers';
import { fetchPublicJson, parsePublicJsonUrl, readResponseTextLimited } from './rulesets';
import { listAllKvKeys } from './kv';

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

function sanitizeMetadata(obj: any): any {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    delete obj.note;
    delete obj._note;
  }
  return obj;
}

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetchPublicJson(parsePublicJsonUrl(url));
    if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
    return sanitizeMetadata(JSON.parse(await readResponseTextLimited(res)));
  } catch (e: any) {
    throw e;
  }
}

async function fetchRepoJson(path: string, session: RepoSession): Promise<unknown> {
  if (!path) return null;
  const file = await fetchFileContent(path, session);
  if (!file) return null;
  return sanitizeMetadata(JSON.parse(file.content));
}

export async function loadTemplate(templateUrl: string, session: RepoSession): Promise<unknown> {
  const isExternalTemplate = templateUrl.startsWith('http://') || templateUrl.startsWith('https://');
  return isExternalTemplate ? fetchJson(templateUrl) : fetchRepoJson(templateUrl, session);
}

interface BuildResourceLoader {
  loadTemplate(templateUrl: string): Promise<unknown>;
  loadRepoJson(path: string): Promise<unknown>;
}

export async function buildProfile(
  profile: Profile,
  session: RepoSession,
  resources: BuildResourceLoader = {
    loadTemplate: (url) => loadTemplate(url, session),
    loadRepoJson: (path) => fetchRepoJson(path, session),
  },
): Promise<string> {
  const templateUrl = profile.templateUrl;
  let [template, nodesData] = await Promise.all([
    resources.loadTemplate(templateUrl) as Promise<Record<string, unknown>>,
    resources.loadRepoJson(profile.nodesPath),
  ]);
  
  // Resource loaders may cache parsed JSON objects across concurrent profile
  // builds. Every build must own the objects it mutates.
  template = structuredClone(template || {});
  nodesData = structuredClone(nodesData);

  // Step 1: Apply overrides first
  if (profile.overrides) {
    template = smartMerge(template, profile.overrides);
  }

  // Step 2: Apply patch (before node insertion, so patch modifications to
  // template structure are in place before we inject nodes into it)
  if (profile.patchUrl) {
    const loadedPatch = await resources.loadRepoJson(profile.patchUrl) as Record<string, unknown>;
    const patch = loadedPatch ? structuredClone(loadedPatch) : null;
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
  const keys = await listAllKvKeys(env, prefix);
  const currentNames = profiles.map(p => p.name);
  const resourceCache = new Map<string, Promise<unknown>>();
  const cached = (key: string, loader: () => Promise<unknown>) => {
    let value = resourceCache.get(key);
    if (!value) {
      value = loader();
      resourceCache.set(key, value);
    }
    return value;
  };
  const resources: BuildResourceLoader = {
    loadTemplate: (url) => cached(`template:${url}`, () => loadTemplate(url, session)),
    loadRepoJson: (path) => cached(`repo:${path}`, () => fetchRepoJson(path, session)),
  };

  const limit = pLimit(3);
  await Promise.all([
    ...keys.map(async key => {
      const name = key.substring(prefix.length);
      if (!currentNames.includes(name)) {
        await env.SESSIONS.delete(key);
      }
    }),
    ...profiles.map(profile => limit(async () => {
      const config = await buildProfile(profile, session, resources);
      await env.SESSIONS.put(`config:${subToken}:${profile.name}`, config);
    }))
  ]);
}
