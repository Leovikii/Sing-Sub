import type { Env } from '../types';
import { requireAuth } from '../lib/auth';
import { isManagedAssetPath, isRulesetPath } from '../lib/assets';
import { COMPILE_SRS_WORKFLOW_CONTENT, COMPILE_SRS_WORKFLOW_PATH } from '../lib/compile-srs-workflow';
import { createRulesetDocument, fetchPublicRuleset, parseImportedRules, parseRulesetImportUrl, readResponseTextLimited, readRulesetMetadata, validateRulesetSource } from '../lib/rulesets';
import { commitMultiFiles, deleteFileContent, fetchFileContent, GithubApiError, putFileContent, type GitTreeItem } from '../lib/github';
import { toRepoSession } from '../lib/helpers';
import { errorResponse, jsonResponse } from '../lib/security';
import { invalidateAssetSnapshot } from '../lib/dashboard';

async function refreshRulesetSources(content: string): Promise<string> {
  const metadata = readRulesetMetadata(content);
  const refreshed = [];
  for (const [index, source] of metadata.sources.entries()) {
    try {
      const response = await fetchPublicRuleset(parseRulesetImportUrl(source.url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bucket = parseImportedRules(await readResponseTextLimited(response));
      if (!Object.values(bucket).some(values => values.length)) throw new Error('source contains no supported rules');
      refreshed.push({ source: { ...source, last_updated: new Date().toISOString() }, bucket });
    } catch (error: any) {
      throw new Error(`Source ${index + 1} (${source.url}) failed: ${error.message}`);
    }
  }
  return createRulesetDocument(
    { ...metadata, sources: refreshed.map(result => result.source) },
    refreshed.map(result => result.bucket),
  );
}

export async function handlePutFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const { path, content, sha, oldPath } = await request.json() as { path: string; content: string; sha?: string; oldPath?: string };
  if (!path || content === undefined) return errorResponse('Missing path or content', 400);
  if (!isManagedAssetPath(path) || (oldPath && !isManagedAssetPath(oldPath))) {
    return errorResponse('Unsupported file path', 400);
  }

  const session = toRepoSession(auth.settings);
  if (!isRulesetPath(path)) return putAssetFile(path, content, sha, oldPath, session, env);

  const validationError = validateRulesetSource(content);
  if (validationError) return errorResponse(validationError, 400);
  let preparedContent: string;
  try {
    preparedContent = await refreshRulesetSources(content);
  } catch (error: any) {
    return errorResponse(error.message || 'Rule-set source validation failed', 400);
  }
  const isRename = !!oldPath && oldPath !== path;
  const fileName = path.split('/').pop()!;
  const compiledPath = `sing-sub/rulesets/compiled/${fileName.replace(/\.json$/, '')}.srs`;
  const oldCompiledPath = isRename && oldPath && isRulesetPath(oldPath)
    ? `sing-sub/rulesets/compiled/${oldPath.split('/').pop()!.replace(/\.json$/, '')}.srs`
    : null;

  try {
    const [workflowFile, currentFile, compiledFile, oldCompiledFile] = await Promise.all([
      fetchFileContent(COMPILE_SRS_WORKFLOW_PATH, session),
      sha ? fetchFileContent(path, session) : Promise.resolve(null),
      fetchFileContent(compiledPath, session),
      oldCompiledPath && oldCompiledPath !== compiledPath ? fetchFileContent(oldCompiledPath, session) : Promise.resolve(null),
    ]);
    if (sha && (!currentFile || currentFile.sha !== sha)) return errorResponse('File was modified; reload it before saving', 409);

    const workflowNeedsSync = !workflowFile || workflowFile.content !== COMPILE_SRS_WORKFLOW_CONTENT;
    const treeItems: GitTreeItem[] = [{ path, mode: '100644', type: 'blob', content: preparedContent }];
    const deletedPaths = new Set<string>();
    const addDeletion = (candidate: string, exists: boolean) => {
      if (exists && !deletedPaths.has(candidate)) {
        deletedPaths.add(candidate);
        treeItems.push({ path: candidate, mode: '100644', type: 'blob', sha: null });
      }
    };
    if (isRename) addDeletion(oldPath!, true);
    if (workflowNeedsSync) treeItems.push({ path: COMPILE_SRS_WORKFLOW_PATH, mode: '100644', type: 'blob', content: COMPILE_SRS_WORKFLOW_CONTENT });
    addDeletion(compiledPath, !!compiledFile);
    if (oldCompiledPath) addDeletion(oldCompiledPath, !!oldCompiledFile);

    const actionMessage = isRename
      ? `ruleset: rename ${oldPath!.split('/').pop()} to ${fileName}`
      : `ruleset: ${sha ? 'update' : 'create'} ${fileName}`;
    await commitMultiFiles(session, treeItems, actionMessage);
    await invalidateAssetSnapshot(env, session);
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 409) return errorResponse('File was modified; reload it before saving', 409);
    throw error;
  }
  return jsonResponse({ success: true, content: preparedContent });
}

async function putAssetFile(
  path: string,
  content: string,
  sha: string | undefined,
  oldPath: string | undefined,
  session: ReturnType<typeof toRepoSession>,
  env: Env,
): Promise<Response> {
  const isRename = !!oldPath && oldPath !== path;
  const fileName = path.split('/').pop()!;
  const scope = path.startsWith('sing-sub/nodes/') ? 'node'
    : path.startsWith('sing-sub/templates/') ? 'template'
      : path.startsWith('sing-sub/patches/') ? 'patch' : 'asset';
  const actionMessage = isRename
    ? `${scope}: rename ${oldPath!.split('/').pop()} to ${fileName}`
    : `${scope}: ${sha ? 'update' : 'create'} ${fileName}`;
  try {
    if (isRename) {
      const treeItems: GitTreeItem[] = [
        { path, mode: '100644', type: 'blob', content },
        { path: oldPath!, mode: '100644', type: 'blob', sha: null },
      ];
      if (isRulesetPath(oldPath!)) {
        const oldBasename = oldPath!.split('/').pop()!.replace(/\.json$/, '');
        const compiledPath = `sing-sub/rulesets/compiled/${oldBasename}.srs`;
        if (await fetchFileContent(compiledPath, session)) {
          treeItems.push({ path: compiledPath, mode: '100644', type: 'blob', sha: null });
        }
      }
      await commitMultiFiles(session, treeItems, actionMessage);
    } else {
      await putFileContent(path, session, content, sha || null, actionMessage);
    }
    await invalidateAssetSnapshot(env, session);
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 409) return errorResponse('文件已被修改，请重新加载后再试', 409);
    throw error;
  }
  return jsonResponse({ success: true });
}

export async function handleDeleteFile(request: Request, env: Env): Promise<Response> {
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

  try {
    if (!isRulesetPath(path)) {
      const scope = path.startsWith('sing-sub/nodes/') ? 'node'
        : path.startsWith('sing-sub/templates/') ? 'template'
          : path.startsWith('sing-sub/patches/') ? 'patch' : 'asset';
      await deleteFileContent(path, session, file.sha, `${scope}: delete ${path.split('/').pop()}`);
    } else {
      const basename = path.split('/').pop()!.replace(/\.json$/, '');
      const compiledPath = `sing-sub/rulesets/compiled/${basename}.srs`;
      const compiledFile = await fetchFileContent(compiledPath, session);
      const treeItems: GitTreeItem[] = [{ path, mode: '100644', type: 'blob', sha: null }];
      if (compiledFile) treeItems.push({ path: compiledPath, mode: '100644', type: 'blob', sha: null });
      await commitMultiFiles(session, treeItems, `ruleset: delete ${basename}.json`);
    }
    await invalidateAssetSnapshot(env, session);
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 409) return errorResponse('文件已被修改，请重新加载后再试', 409);
    throw error;
  }
  return jsonResponse({ success: true });
}
