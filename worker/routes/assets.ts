import type { AssetSnapshot, JsonAsset, WorkspaceMetadata } from '../../shared';
import { parseManagedAssetPath } from '../domain/assets/managed-asset-path';
import { requirePrimaryWorkspaceAuth } from '../http/authenticate';
import { errorResponse, jsonResponse } from '../lib/security';
import type { Env } from '../types';

function summaries(assets: Record<string, JsonAsset>, metadata?: WorkspaceMetadata) {
  return Object.values(assets)
    .map(asset => ({ path: asset.path, order: metadata?.entities[asset.path]?.order, note: asset.note || '', ...(asset.updatedAt ? { updatedAt: asset.updatedAt } : {}) }))
    .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export async function handleGetAssets(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const result: AssetSnapshot = {
    nodes: summaries(auth.snapshot.assets.nodes, auth.snapshot.metadata),
    templates: summaries(auth.snapshot.assets.templates, auth.snapshot.metadata),
    rulesets: summaries(auth.snapshot.assets.rulesets, auth.snapshot.metadata),
  };
  return jsonResponse(result);
}

export async function handleGetFile(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const path = new URL(request.url).searchParams.get('path');
  const target = path ? parseManagedAssetPath(path) : null;
  if (!path || !target) return errorResponse('Unsupported file path', 400, 'VALIDATION_FAILED');
  const asset = auth.snapshot.assets[target.kind][target.entityId];
  if (!asset) return errorResponse('Asset not found', 404, 'ASSET_NOT_FOUND');
  return jsonResponse({ content: JSON.stringify(asset.content, null, 2), sha: auth.revision, metadata: auth.snapshot.metadata?.entities[path] ?? {} });
}

export async function handleGetTemplate(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const source = new URL(request.url).searchParams.get('source');
  if (!source) return errorResponse('Missing template source', 400, 'VALIDATION_FAILED');
  if (/^https?:\/\//i.test(source)) return errorResponse('External templates are not supported', 400, 'VALIDATION_FAILED');
  const target = parseManagedAssetPath(source);
  if (!target || target.kind !== 'templates') {
    return errorResponse('Unsupported template source', 400, 'VALIDATION_FAILED');
  }
  const asset = auth.snapshot.assets.templates[target.entityId];
  if (!asset) return errorResponse('Template not found', 404, 'ASSET_NOT_FOUND');
  return jsonResponse({ content: asset.content, metadata: auth.snapshot.metadata?.entities[asset.path] ?? {} });
}
