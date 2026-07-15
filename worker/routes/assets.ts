import type { AssetSnapshot, JsonAsset } from '../../shared';
import { parseManagedAssetPath } from '../domain/assets/managed-asset-path';
import { requirePrimaryWorkspaceAuth } from '../http/authenticate';
import { errorResponse, jsonResponse } from '../lib/security';
import type { Env } from '../types';

function summaries(assets: Record<string, JsonAsset>) {
  return Object.values(assets)
    .map(asset => ({ path: asset.path, note: asset.note || '' }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export async function handleGetAssets(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const result: AssetSnapshot = {
    nodes: summaries(auth.snapshot.assets.nodes),
    templates: summaries(auth.snapshot.assets.templates),
    patches: summaries(auth.snapshot.assets.patches),
    rulesets: summaries(auth.snapshot.assets.rulesets),
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
  return jsonResponse({ content: JSON.stringify(asset.content, null, 2), sha: auth.revision });
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
  return jsonResponse({ content: asset.content });
}
