import type {
  CachedPayload,
  ResponseCache,
  RevisionedCacheIdentity,
} from '../../application/ports/response-cache';

const CACHE_ORIGIN = 'https://cache.sing-sub.invalid';
const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const MIN_TTL_SECONDS = 1;
const MAX_TTL_SECONDS = 86400;

export interface CacheApiPort {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function segment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Invalid cache ${label}`);
  return encodeURIComponent(value);
}

export function revisionedCacheRequest(identity: RevisionedCacheIdentity): Request {
  const resource = identity.resource === 'subscription-json'
    ? 'subscriptions'
    : identity.resource === 'ruleset-json' ? 'rulesets-json' : 'srs';
  const path = [
    'v1',
    resource,
    segment(identity.workspaceId, 'workspace ID'),
    segment(identity.revision, 'revision'),
    segment(identity.entityId, 'entity ID'),
  ].join('/');
  return new Request(`${CACHE_ORIGIN}/${path}`, { method: 'GET' });
}

export class CacheApiResponseCache implements ResponseCache {
  constructor(private readonly cache: CacheApiPort) {}

  async get(identity: RevisionedCacheIdentity): Promise<CachedPayload | null> {
    const response = await this.cache.match(revisionedCacheRequest(identity));
    if (!response) return null;
    const contentType = response.headers.get('Content-Type');
    if (!response.ok || !contentType) return null;
    return {
      body: new Uint8Array(await response.arrayBuffer()),
      contentType,
    };
  }

  async put(identity: RevisionedCacheIdentity, payload: CachedPayload, ttlSeconds: number): Promise<void> {
    if (!payload.contentType || !Number.isInteger(ttlSeconds) ||
        ttlSeconds < MIN_TTL_SECONDS || ttlSeconds > MAX_TTL_SECONDS) {
      throw new Error('Invalid cache entry');
    }
    const response = new Response(payload.body.slice().buffer, {
      status: 200,
      headers: {
        'Content-Type': payload.contentType,
        'Cache-Control': `public, max-age=${ttlSeconds}`,
      },
    });
    await this.cache.put(revisionedCacheRequest(identity), response);
  }
}
