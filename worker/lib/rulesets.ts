export const RULESET_METADATA_KEY = '_sing_sub';
export const RULESET_ALLOWED_KEYS = new Set(['version', 'rules', RULESET_METADATA_KEY]);
export const RULESET_METADATA_ALLOWED_KEYS = new Set(['note', 'sources']);
export const RULESET_SOURCE_ALLOWED_KEYS = new Set(['url', 'interval_hours', 'last_updated', 'rules']);
export const MAX_RULESET_IMPORT_URLS = 20;
export const MAX_RULESET_IMPORT_BYTES = 5 * 1024 * 1024;

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
  if (url.protocol !== 'https:' || url.username || url.password || isPrivateHostname(url.hostname)) {
    throw new Error('Only public HTTPS rule-set URLs are allowed');
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

export function normalizeImportedRuleValues(value: unknown, field: 'domain' | 'domain_suffix'): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Imported ${field} rule must contain non-empty strings`);
  }
  return value.map(item => item.trim());
}

function validateRuleList(rules: unknown, description: string): string | null {
  if (!Array.isArray(rules)) return `${description} must be an array`;

  for (const rule of rules) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return `${description} must contain objects`;
    const entries = Object.entries(rule as Record<string, unknown>);
    if (entries.length !== 1 || (entries[0][0] !== 'domain' && entries[0][0] !== 'domain_suffix')) {
      return `${description} may only contain domain or domain_suffix fields`;
    }
    try {
      normalizeImportedRuleValues(entries[0][1], entries[0][0] as 'domain' | 'domain_suffix');
    } catch (error: any) {
      return error.message;
    }
  }
  return null;
}

export function validateRulesetSource(content: string): string | null {
  let source: unknown;
  try {
    source = JSON.parse(content);
  } catch (error: any) {
    return `Invalid rule-set JSON: ${error.message}`;
  }

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return 'Rule-set source must be a JSON object';
  }

  const data = source as Record<string, unknown>;
  if (!Array.isArray(data.rules)) return 'Rule-set source must contain a rules array';
  const rulesError = validateRuleList(data.rules, 'Rule-set rules');
  if (rulesError) return rulesError;

  for (const key of Object.keys(data)) {
    if (!RULESET_ALLOWED_KEYS.has(key)) return `Unsupported rule-set top-level field: ${key}`;
  }

  const metadata = data[RULESET_METADATA_KEY];
  if (metadata === undefined) return null;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return `${RULESET_METADATA_KEY} must be an object`;
  }

  const metadataRecord = metadata as Record<string, unknown>;
  for (const key of Object.keys(metadataRecord)) {
    if (!RULESET_METADATA_ALLOWED_KEYS.has(key)) return `Unsupported ${RULESET_METADATA_KEY} field: ${key}`;
  }
  if (metadataRecord.note !== undefined && typeof metadataRecord.note !== 'string') {
    return `${RULESET_METADATA_KEY}.note must be a string`;
  }
  if (metadataRecord.sources === undefined) return null;
  if (!Array.isArray(metadataRecord.sources) || metadataRecord.sources.length > 1) {
    return `${RULESET_METADATA_KEY}.sources must contain at most one entry`;
  }

  for (const sourceEntry of metadataRecord.sources) {
    if (!sourceEntry || typeof sourceEntry !== 'object' || Array.isArray(sourceEntry)) {
      return 'Rule-set source metadata must be an object';
    }
    const entry = sourceEntry as Record<string, unknown>;
    for (const key of Object.keys(entry)) {
      if (!RULESET_SOURCE_ALLOWED_KEYS.has(key)) return `Unsupported rule-set source field: ${key}`;
    }
    try {
      if (typeof entry.url !== 'string') throw new Error('url is required');
      parseRulesetImportUrl(entry.url);
    } catch (error: any) {
      return `Invalid rule-set source URL: ${error.message}`;
    }
    if (![0, 24, 168, 720, 8760].includes(entry.interval_hours as number)) {
      return 'Rule-set source interval_hours must be 0, 24, 168, 720, or 8760';
    }
    if (entry.last_updated !== undefined && typeof entry.last_updated !== 'string') {
      return 'Rule-set source last_updated must be a string';
    }
    if (entry.rules !== undefined) {
      const sourceRulesError = validateRuleList(entry.rules, 'Rule-set source rules');
      if (sourceRulesError) return sourceRulesError;
    }
  }

  return null;
}
