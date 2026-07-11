export const RULESET_METADATA_KEY = '_sing_sub';
export const MAX_RULESET_IMPORT_BYTES = 5 * 1024 * 1024;

export interface RuleBucket {
  domain: string[];
  domain_suffix: string[];
}

export interface RulesetSource extends RuleBucket {
  url: string;
  interval_hours: number;
  last_updated?: string;
}

export interface RulesetMetadata {
  note?: string;
  manual: RuleBucket;
  sources: RulesetSource[];
}

function emptyBucket(): RuleBucket {
  return { domain: [], domain_suffix: [] };
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized.includes(':')) return true;
  const parts = normalized.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}

export function parseRulesetImportUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || isPrivateHostname(url.hostname)) {
    throw new Error('Only public HTTPS rule-set URLs without credentials or fragments are allowed');
  }
  return url;
}

export async function fetchPublicRuleset(url: URL): Promise<Response> {
  let current = url;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('Import redirect has no location');
    current = parseRulesetImportUrl(new URL(location, current).toString());
  }
  throw new Error('Import exceeded the redirect limit');
}

export async function readResponseTextLimited(response: Response): Promise<string> {
  const declaredSize = Number(response.headers.get('content-length') || '0');
  if (declaredSize > MAX_RULESET_IMPORT_BYTES) throw new Error('source exceeds 5 MiB');
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RULESET_IMPORT_BYTES) {
      await reader.cancel();
      throw new Error('source exceeds 5 MiB');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(merged);
}

function normalizeDomain(value: unknown, field: keyof RuleBucket): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} values must be non-empty strings`);
  let normalized = value.trim().toLowerCase();
  if (field === 'domain_suffix') normalized = normalized.replace(/^\.+/, '');
  if (!normalized || /[\s/:@]/.test(normalized)) throw new Error(`Invalid ${field} value: ${value}`);
  try {
    normalized = new URL(`http://${normalized}`).hostname;
  } catch {
    throw new Error(`Invalid ${field} value: ${value}`);
  }
  if (!normalized || normalized.length > 253 || normalized.split('.').some(label =>
    !label || label.length > 63 || !/^[a-z0-9-]+$/.test(label) || label.startsWith('-') || label.endsWith('-'))) {
    throw new Error(`Invalid ${field} value: ${value}`);
  }
  return normalized;
}

function values(value: unknown, field: keyof RuleBucket): string[] {
  const list = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(list)) throw new Error(`${field} must be a string or string array`);
  return list.map(item => normalizeDomain(item, field));
}

export function parseImportedRules(content: string): RuleBucket {
  const source = JSON.parse(content) as unknown;
  if (!source || typeof source !== 'object' || Array.isArray(source) || !Array.isArray((source as Record<string, unknown>).rules)) {
    throw new Error('Rule-set must be a JSON object with a rules array');
  }
  const result = emptyBucket();
  for (const rule of (source as { rules: unknown[] }).rules) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('Rules must be objects');
    const entries = Object.entries(rule as Record<string, unknown>);
    if (entries.length === 0 || entries.some(([field]) => field !== 'domain' && field !== 'domain_suffix')) {
      throw new Error('Rules may only contain domain or domain_suffix fields');
    }
    for (const [field, value] of entries as Array<[keyof RuleBucket, unknown]>) result[field].push(...values(value, field));
  }
  return mergeRuleBuckets([result]);
}

export function mergeRuleBuckets(buckets: RuleBucket[]): RuleBucket {
  const merged = emptyBucket();
  const seen = { domain: new Set<string>(), domain_suffix: new Set<string>() };
  for (const bucket of buckets) {
    for (const field of ['domain', 'domain_suffix'] as const) {
      for (const value of bucket[field]) {
        const normalized = normalizeDomain(value, field);
        if (!seen[field].has(normalized)) {
          seen[field].add(normalized);
          merged[field].push(normalized);
        }
      }
    }
  }
  return merged;
}

export function readRulesetMetadata(content: string): RulesetMetadata {
  const document = JSON.parse(content) as Record<string, unknown>;
  if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Rule-set must be a JSON object');
  if (Object.keys(document).some(key => !['version', 'rules', RULESET_METADATA_KEY].includes(key))) {
    throw new Error('Rule-set has unsupported top-level fields');
  }
  const metadata = document[RULESET_METADATA_KEY];
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('_sing_sub metadata is required');
  const record = metadata as Record<string, unknown>;
  if (Object.keys(record).some(key => !['note', 'manual', 'sources'].includes(key))) throw new Error('Unsupported _sing_sub field');
  if (record.note !== undefined && typeof record.note !== 'string') throw new Error('_sing_sub.note must be a string');
  const manual = parseBucket(record.manual, 'manual');
  if (!Array.isArray(record.sources)) throw new Error('_sing_sub.sources must be an array');
  const sources = record.sources.map((source, index) => parseSource(source, index));
  if (new Set(sources.map(source => source.url)).size !== sources.length) throw new Error('Source URLs must be unique');
  return { note: record.note as string | undefined, manual, sources };
}

function parseBucket(value: unknown, label: string): RuleBucket {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => key !== 'domain' && key !== 'domain_suffix')) throw new Error(`${label} has unsupported fields`);
  return mergeRuleBuckets([{
    domain: values(record.domain ?? [], 'domain'),
    domain_suffix: values(record.domain_suffix ?? [], 'domain_suffix'),
  }]);
}

function parseSource(value: unknown, index: number): RulesetSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`source ${index + 1} must be an object`);
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !['url', 'interval_hours', 'last_updated', 'domain', 'domain_suffix'].includes(key))) {
    throw new Error(`source ${index + 1} has unsupported fields`);
  }
  if (typeof record.url !== 'string') throw new Error(`source ${index + 1} URL is required`);
  const url = parseRulesetImportUrl(record.url).toString();
  if (![0, 24, 168, 720, 8760].includes(record.interval_hours as number)) throw new Error(`source ${index + 1} has invalid interval`);
  if (record.last_updated !== undefined && typeof record.last_updated !== 'string') throw new Error(`source ${index + 1} has invalid timestamp`);
  const bucket = parseBucket({ domain: record.domain ?? [], domain_suffix: record.domain_suffix ?? [] }, `source ${index + 1}`);
  return { url, interval_hours: record.interval_hours as number, last_updated: record.last_updated as string | undefined, ...bucket };
}

export function createRulesetDocument(metadata: RulesetMetadata): string {
  const merged = mergeRuleBuckets([metadata.manual, ...metadata.sources]);
  const rule: Record<string, string[]> = {};
  if (merged.domain.length) rule.domain = merged.domain;
  if (merged.domain_suffix.length) rule.domain_suffix = merged.domain_suffix;
  return JSON.stringify({
    version: 2,
    rules: Object.keys(rule).length ? [rule] : [],
    [RULESET_METADATA_KEY]: metadata,
  }, null, 2);
}

export function validateRulesetSource(content: string): string | null {
  try {
    readRulesetMetadata(content);
    return null;
  } catch (error: any) {
    return error.message || 'Invalid rule-set';
  }
}
