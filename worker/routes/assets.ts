import type { Env } from '../types';
import { requireAuth } from '../lib/auth';
import { loadTemplate } from '../lib/builder';
import { fetchDirectoryContents, fetchFileContent } from '../lib/github';
import { pLimit, toRepoSession } from '../lib/helpers';
import { errorResponse, jsonResponse } from '../lib/security';
import { isManagedAssetPath, TEMPLATE_PATH } from '../lib/assets';
import { RULESET_METADATA_KEY } from '../lib/rulesets';

export async function handleGetAssets(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const session = toRepoSession(auth.settings);
  const [nodes, templates, patches, rulesets] = await Promise.all([
    fetchDirectoryContents('sing-sub/nodes', session),
    fetchDirectoryContents('sing-sub/templates', session),
    fetchDirectoryContents('sing-sub/patches', session),
    fetchDirectoryContents('sing-sub/rulesets', session),
  ]);
  const jsonFiles = (paths: string[] | null) => (paths || []).filter(path => path.toLowerCase().endsWith('.json'));
  const limit = pLimit(5);
  const parseFileMeta = (path: string) => limit(async () => {
    try {
      const file = await fetchFileContent(path, session);
      if (file?.content) {
        const data = JSON.parse(file.content);
        return {
          path,
          inboundsCount: Array.isArray(data.inbounds) ? data.inbounds.length : 0,
          outboundsCount: Array.isArray(data.outbounds) ? data.outbounds.length : 0,
          tags: Array.isArray(data.outbounds) ? data.outbounds.map((outbound: any) => outbound.tag).filter(Boolean).slice(0, 5) : [],
          note: typeof data[RULESET_METADATA_KEY]?.note === 'string'
            ? data[RULESET_METADATA_KEY].note
            : typeof data.note === 'string'
              ? data.note
              : '',
        };
      }
    } catch { /* A malformed asset remains visible with empty metadata. */ }
    return { path, inboundsCount: 0, outboundsCount: 0, tags: [], note: '' };
  });

  const [nodesWithMeta, templatesWithMeta, patchesWithMeta, rulesetsWithMeta] = await Promise.all([
    Promise.all(jsonFiles(nodes).map(parseFileMeta)),
    Promise.all(jsonFiles(templates).map(parseFileMeta)),
    Promise.all(jsonFiles(patches).map(parseFileMeta)),
    Promise.all(jsonFiles(rulesets).map(parseFileMeta)),
  ]);
  return jsonResponse({ nodes: nodesWithMeta, templates: templatesWithMeta, patches: patchesWithMeta, rulesets: rulesetsWithMeta });
}

export async function handleGetFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const path = new URL(request.url).searchParams.get('path');
  if (!path) return errorResponse('Missing path parameter', 400);
  if (!isManagedAssetPath(path)) return errorResponse('Unsupported file path', 400);

  const file = await fetchFileContent(path, toRepoSession(auth.settings));
  if (!file) return errorResponse('File not found', 404);
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
