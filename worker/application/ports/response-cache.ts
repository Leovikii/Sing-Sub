export type CachedResourceKind = 'subscription-json' | 'ruleset-json' | 'srs';

export interface RevisionedCacheIdentity {
  workspaceId: string;
  revision: string;
  resource: CachedResourceKind;
  entityId: string;
}

export interface CachedPayload {
  body: Uint8Array;
  contentType: string;
}

export interface ResponseCache {
  get(identity: RevisionedCacheIdentity): Promise<CachedPayload | null>;
  put(identity: RevisionedCacheIdentity, payload: CachedPayload, ttlSeconds: number): Promise<void>;
}
