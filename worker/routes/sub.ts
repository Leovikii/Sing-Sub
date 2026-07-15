import { authenticateSubscriptionAccess } from '../application/auth/subscription-access';
import type { CachedPayload, RevisionedCacheIdentity } from '../application/ports/response-cache';
import {
  createPrimaryWorkspaceServices,
  createPrimaryWorkspaceStore,
} from '../composition/primary-workspace-services';
import { PRIMARY_WORKSPACE_ID } from '../domain/workspace/primary-workspace';
import { createCompilerSource } from '../domain/rulesets/compiler-source';
import { CacheApiResponseCache } from '../infrastructure/cache/cache-api-response-cache';
import { R2ArtifactStore } from '../infrastructure/r2/r2-artifact-store';
import { WorkspaceNotFoundError } from '../infrastructure/r2/r2-workspace-errors';
import { buildProfileFromWorkspace } from '../lib/workspace-builder';
import { sha256Hex } from '../domain/revisions/canonical-json';
import { errorResponse } from '../lib/security';
import type { Env } from '../types';

const ALLOWED_UA_PATTERNS = ['sing-box', 'SFI', 'SFA', 'SFM', 'SFT'];
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const CACHE_TTL_SECONDS = 300;

function subscriptionResponse(config: string): Response {
  return new Response(config, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Profile-Update-Interval': '3600',
    },
  });
}

async function subscriptionWorkspace(token: string, env: Env) {
  try {
    const services = createPrimaryWorkspaceServices(env);
    return await authenticateSubscriptionAccess(token, services.workspaceStore, services.tokenService);
  } catch {
    return null;
  }
}

function responseCache(): CacheApiResponseCache | null {
  try {
    return new CacheApiResponseCache(caches.default);
  } catch {
    return null;
  }
}

async function cacheGet(identity: RevisionedCacheIdentity): Promise<CachedPayload | null> {
  try {
    return await responseCache()?.get(identity) || null;
  } catch {
    return null;
  }
}

async function cachePut(identity: RevisionedCacheIdentity, payload: CachedPayload): Promise<void> {
  try {
    await responseCache()?.put(identity, payload, CACHE_TTL_SECONDS);
  } catch {
    // Cache API is disposable; source data remains authoritative.
  }
}

export async function handleSubscription(
  request: Request,
  env: Env,
  token: string,
  name: string,
): Promise<Response> {
  const userAgent = request.headers.get('User-Agent') || '';
  if (!ALLOWED_UA_PATTERNS.some(pattern => userAgent.includes(pattern))) {
    return errorResponse('Forbidden', 403, 'FORBIDDEN');
  }
  if (!SAFE_NAME.test(name)) return errorResponse('Invalid subscription link', 400, 'VALIDATION_FAILED');
  const workspace = await subscriptionWorkspace(token, env);
  if (!workspace) return errorResponse('Invalid subscription link', 404, 'NOT_FOUND');
  const profile = workspace.snapshot.profiles.find(candidate => candidate.name === name);
  if (!profile) return errorResponse('Profile not found', 404, 'NOT_FOUND');

  const identity: RevisionedCacheIdentity = {
    workspaceId: workspace.workspaceId,
    revision: workspace.revision,
    resource: 'subscription-json',
    entityId: `profile-v2-${name}`,
  };
  const cached = await cacheGet(identity);
  if (cached) return subscriptionResponse(new TextDecoder().decode(cached.body));

  try {
    const config = await buildProfileFromWorkspace(profile, workspace.snapshot, new URL(request.url).origin);
    await cachePut(identity, {
      body: new TextEncoder().encode(config),
      contentType: 'application/json; charset=utf-8',
    });
    return subscriptionResponse(config);
  } catch {
    return errorResponse('Subscription build failed', 500, 'INTERNAL_ERROR');
  }
}

export async function handleRuleset(
  _request: Request,
  env: Env,
  name: string,
): Promise<Response> {
  if (!SAFE_NAME.test(name)) return errorResponse('Invalid ruleset link', 400, 'VALIDATION_FAILED');
  let workspace;
  try {
    workspace = await createPrimaryWorkspaceStore(env).read(PRIMARY_WORKSPACE_ID);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return errorResponse('Ruleset not found', 404, 'NOT_FOUND');
    }
    throw error;
  }
  const active = workspace.snapshot.builds[name]?.activeArtifact;
  if (!active) return errorResponse('Ruleset not found', 404, 'NOT_FOUND');
  const identity: RevisionedCacheIdentity = {
    workspaceId: workspace.workspaceId,
    revision: workspace.revision,
    resource: 'srs',
    entityId: name,
  };
  const cached = await cacheGet(identity);
  const body = cached?.body || await new R2ArtifactStore(env.WORKSPACE_BUCKET).getSrs({
    workspaceId: workspace.workspaceId,
    rulesetId: active.rulesetId,
    sourceHash: active.sourceHash,
  });
  if (!body) return errorResponse('Ruleset not found', 404, 'NOT_FOUND');
  if (!cached) await cachePut(identity, { body, contentType: 'application/octet-stream' });
  return new Response(body.slice().buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}.srs"`,
      'Cache-Control': 'public, max-age=300',
      ETag: `"${active.contentHash}"`,
    },
  });
}

export async function handleRulesetJson(
  _request: Request,
  env: Env,
  name: string,
): Promise<Response> {
  if (!SAFE_NAME.test(name)) return errorResponse('Invalid ruleset link', 400, 'VALIDATION_FAILED');
  let workspace;
  try {
    workspace = await createPrimaryWorkspaceStore(env).read(PRIMARY_WORKSPACE_ID);
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      return errorResponse('Ruleset not found', 404, 'NOT_FOUND');
    }
    throw error;
  }
  const asset = workspace.snapshot.assets.rulesets[name];
  if (!asset) return errorResponse('Ruleset not found', 404, 'NOT_FOUND');
  const identity: RevisionedCacheIdentity = {
    workspaceId: workspace.workspaceId,
    revision: workspace.revision,
    resource: 'ruleset-json',
    entityId: name,
  };
  const cached = await cacheGet(identity);
  const source = cached
    ? { body: new TextDecoder().decode(cached.body), sourceHash: await sha256Hex(cached.body) }
    : await createCompilerSource(asset.content);
  if (!cached) {
    await cachePut(identity, {
      body: new TextEncoder().encode(source.body),
      contentType: 'application/json; charset=utf-8',
    });
  }
  return new Response(source.body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ETag: `"${source.sourceHash}"`,
    },
  });
}
