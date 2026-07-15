import { adapterPresetSchema, type Profile } from '../../shared';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pathLabel(path: string[]): string {
  return path.join('.');
}

export function applyAdapterPreset(
  target: Record<string, unknown>,
  source: unknown,
): Record<string, unknown> {
  const adapter = adapterPresetSchema.parse(source);
  for (const [index, replacement] of adapter.replacements.entries()) {
    let parent: Record<string, unknown> = target;
    for (const segment of replacement.path.slice(0, -1)) {
      const next = parent[segment];
      if (!isRecord(next)) {
        throw new Error(`Adapter ${adapter.name} replacement ${index + 1} path ${pathLabel(replacement.path)} does not exist`);
      }
      parent = next;
    }
    const key = replacement.path.at(-1)!;
    if (!(key in parent)) {
      throw new Error(`Adapter ${adapter.name} replacement ${index + 1} path ${pathLabel(replacement.path)} does not exist`);
    }
    if (!replacement.match) {
      parent[key] = structuredClone(replacement.value);
      continue;
    }
    const candidates = parent[key];
    if (!Array.isArray(candidates)) {
      throw new Error(`Adapter ${adapter.name} replacement ${index + 1} target ${pathLabel(replacement.path)} is not an array`);
    }
    const matches = candidates.flatMap((candidate, candidateIndex) => {
      if (!isRecord(candidate)) return [];
      return Object.entries(replacement.match!).every(([field, value]) => candidate[field] === value)
        ? [candidateIndex]
        : [];
    });
    if (matches.length !== 1) {
      throw new Error(
        `Adapter ${adapter.name} replacement ${index + 1} expected one match at ${pathLabel(replacement.path)}, found ${matches.length}`,
      );
    }
    candidates[matches[0]] = structuredClone(replacement.value);
  }
  return target;
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

export interface BuildResourceLoader {
  loadTemplate(templateUrl: string): Promise<unknown>;
  loadRepoJson(path: string): Promise<unknown>;
}

export async function buildProfile(
  profile: Profile,
  resources: BuildResourceLoader,
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

  // Apply the selected adapter before node insertion so replacement inbounds
  // become the anchors used by inbound rules.
  if (profile.adapterUrl) {
    const adapter = await resources.loadRepoJson(profile.adapterUrl);
    if (!adapter) throw new Error(`Adapter not found: ${profile.adapterUrl}`);
    template = applyAdapterPreset(template, adapter);
  }

  // Step 2: Insert inbound nodes
  if (nodesData) {
    const inboundsArray = normalizeArray<Inbound>(nodesData, 'inbounds');
    const templateInbounds = Array.isArray(template.inbounds) ? template.inbounds : [];
    if (profile.inboundRules && profile.inboundRules.length > 0) {
      const insertionCursors = new Map<string, number>();
      profile.inboundRules.forEach(rule => {
        if (!rule.tag || !rule.filters) return;
        const matched = applyFilters(inboundsArray, rule.filters);
        if (matched.length > 0) {
          const idx = insertionCursors.has(rule.tag)
            ? insertionCursors.get(rule.tag)!
            : templateInbounds.findIndex((i: any) => i.tag === rule.tag);
          if (idx !== -1) {
            const insertionAt = idx + 1;
            templateInbounds.splice(insertionAt, 0, ...matched);
            insertionCursors.set(rule.tag, insertionAt + matched.length - 1);
          } else {
            templateInbounds.push(...matched);
          }
        }
      });
      template.inbounds = Array.from(new Set(templateInbounds));
    }
  }

  // Step 3: Insert outbound nodes
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
