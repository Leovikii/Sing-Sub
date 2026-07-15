import { describe, expect, it } from 'vitest';
import type { RevisionedCacheIdentity } from '../../worker/application/ports/response-cache';
import {
  CacheApiResponseCache,
  revisionedCacheRequest,
} from '../../worker/infrastructure/cache/cache-api-response-cache';
import { InMemoryCacheApi } from '../fakes/in-memory-cache-api';

const identity: RevisionedCacheIdentity = {
  workspaceId: 'workspace-1',
  revision: 'revision-1',
  resource: 'subscription-json',
  entityId: 'profile-1',
};

describe('CacheApiResponseCache', () => {
  it('roundtrips a response payload through the Cache API boundary', async () => {
    const cache = new CacheApiResponseCache(new InMemoryCacheApi());
    const payload = {
      body: new TextEncoder().encode('{"outbounds":[]}'),
      contentType: 'application/json; charset=utf-8',
    };

    await cache.put(identity, payload, 300);

    await expect(cache.get(identity)).resolves.toEqual(payload);
  });

  it('uses workspace revision in the cache key instead of explicit invalidation', async () => {
    const cache = new CacheApiResponseCache(new InMemoryCacheApi());
    await cache.put(identity, { body: new Uint8Array([1]), contentType: 'application/json' }, 300);

    await expect(cache.get({ ...identity, revision: 'revision-2' })).resolves.toBeNull();
    await expect(cache.get(identity)).resolves.toMatchObject({ body: new Uint8Array([1]) });
  });

  it('separates subscription and SRS resources', () => {
    const subscriptionUrl = revisionedCacheRequest(identity).url;
    const srsUrl = revisionedCacheRequest({ ...identity, resource: 'srs' }).url;

    expect(subscriptionUrl).not.toBe(srsUrl);
  });

  it('treats eviction as a cache miss', async () => {
    const api = new InMemoryCacheApi();
    const cache = new CacheApiResponseCache(api);
    await cache.put(identity, { body: new Uint8Array([1]), contentType: 'application/json' }, 300);
    api.evictAll();

    await expect(cache.get(identity)).resolves.toBeNull();
  });

  it('rejects unsafe identities and unbounded TTL values', async () => {
    const cache = new CacheApiResponseCache(new InMemoryCacheApi());

    expect(() => revisionedCacheRequest({ ...identity, workspaceId: '../other' }))
      .toThrow('Invalid cache workspace ID');
    await expect(cache.put(identity, { body: new Uint8Array(), contentType: 'application/json' }, 0))
      .rejects.toThrow('Invalid cache entry');
    await expect(cache.put(identity, { body: new Uint8Array(), contentType: 'application/json' }, 86401))
      .rejects.toThrow('Invalid cache entry');
  });
});
