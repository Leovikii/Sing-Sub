import type { Env } from '../types';
import { requireAuth } from '../lib/auth';
import { loadTemplate } from '../lib/builder';
import { fetchFileContent } from '../lib/github';
import { toRepoSession } from '../lib/helpers';
import { errorResponse, jsonResponse } from '../lib/security';
import { isManagedAssetPath, TEMPLATE_PATH } from '../lib/assets';
import { getAssetSnapshot, invalidateAssetSnapshot } from '../lib/dashboard';

export async function handleGetAssets(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const session = toRepoSession(auth.settings);
  const force = new URL(request.url).searchParams.get('refresh') === '1';
  return jsonResponse(await getAssetSnapshot(env, session, force));
}

export async function handleGetFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const path = new URL(request.url).searchParams.get('path');
  if (!path) return errorResponse('Missing path parameter', 400);
  if (!isManagedAssetPath(path)) return errorResponse('Unsupported file path', 400);

  const session = toRepoSession(auth.settings);
  const file = await fetchFileContent(path, session);
  if (!file) {
    await invalidateAssetSnapshot(env, session);
    return errorResponse('File no longer exists', 404, 'ASSET_NOT_FOUND');
  }
  return jsonResponse({ content: file.content, sha: file.sha });
}

export async function handleGetTemplate(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const source = new URL(request.url).searchParams.get('source');
  if (!source) return errorResponse('Missing template source', 400);
  const isExternal = source.startsWith('http://') || source.startsWith('https://');
  if (!isExternal && !TEMPLATE_PATH.test(source)) return errorResponse('Unsupported template source', 400);
  return jsonResponse({ content: await loadTemplate(source, toRepoSession(auth.settings)) });
}
