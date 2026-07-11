import type { Env } from '../types';
import { requireAuth } from '../lib/auth';
import { isManagedAssetPath, isRulesetPath } from '../lib/assets';
import { COMPILE_SRS_WORKFLOW_CONTENT, COMPILE_SRS_WORKFLOW_PATH } from '../lib/compile-srs-workflow';
import { fetchPublicRuleset, MAX_RULESET_IMPORT_BYTES, MAX_RULESET_IMPORT_URLS, normalizeImportedRuleValues, parseRulesetImportUrl, validateRulesetSource } from '../lib/rulesets';
import { commitMultiFiles, deleteFileContent, fetchFileContent, GithubApiError, putFileContent, type GitTreeItem } from '../lib/github';
import { toRepoSession } from '../lib/helpers';
import { errorResponse, jsonResponse } from '../lib/security';

export async function handleImportRuleset(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  let urls: unknown;
  try {
    ({ urls } = await request.json() as { urls?: unknown });
  } catch {
    return errorResponse('Invalid request JSON', 400);
  }
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > MAX_RULESET_IMPORT_URLS ||
      urls.some(url => typeof url !== 'string' || !url.trim())) {
    return errorResponse(`Provide between 1 and ${MAX_RULESET_IMPORT_URLS} rule-set URLs`, 400);
  }

  const domains: string[] = [];
  const domainSuffixes: string[] = [];
  const seenDomains = new Set<string>();
  const seenDomainSuffixes = new Set<string>();
  try {
    for (const rawUrl of urls) {
      const response = await fetchPublicRuleset(parseRulesetImportUrl(rawUrl.trim()));
      if (!response.ok) throw new Error(`Import request failed with HTTP ${response.status}`);

      const contentLength = Number(response.headers.get('content-length') || '0');
      if (contentLength > MAX_RULESET_IMPORT_BYTES) throw new Error('Imported rule-set exceeds 5 MiB');
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_RULESET_IMPORT_BYTES) {
        throw new Error('Imported rule-set exceeds 5 MiB');
      }
      const source = JSON.parse(body) as unknown;
      if (!source || typeof source !== 'object' || Array.isArray(source) || !Array.isArray((source as Record<string, unknown>).rules)) {
        throw new Error('Imported rule-set must be a JSON object with a rules array');
      }

      for (const rule of (source as { rules: unknown[] }).rules) {
        if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('Imported rules must be objects');
        const entries = Object.entries(rule as Record<string, unknown>);
        if (entries.length !== 1 || (entries[0][0] !== 'domain' && entries[0][0] !== 'domain_suffix')) {
          throw new Error('Imported rules may only contain a domain or domain_suffix field');
        }
        const [[field, value]] = entries as [['domain' | 'domain_suffix', unknown]];
        const [target, seen] = field === 'domain'
          ? [domains, seenDomains]
          : [domainSuffixes, seenDomainSuffixes];
        for (const item of normalizeImportedRuleValues(value, field)) {
          if (!seen.has(item)) {
            seen.add(item);
            target.push(item);
          }
        }
      }
    }
  } catch (error: any) {
    return errorResponse(`Rule-set import failed: ${error.message || 'invalid source'}`, 400);
  }

  const rules = [
    ...(domains.length > 0 ? [{ domain: domains }] : []),
    ...(domainSuffixes.length > 0 ? [{ domain_suffix: domainSuffixes }] : []),
  ];
  return jsonResponse({ rules, domain: domains, domain_suffix: domainSuffixes, updated_at: new Date().toISOString() });
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
  if (!isRulesetPath(path)) return putAssetFile(path, content, sha, oldPath, session);

  const validationError = validateRulesetSource(content);
  if (validationError) return errorResponse(validationError, 400);
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
    const treeItems: GitTreeItem[] = [{ path, mode: '100644', type: 'blob', content }];
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
      ? `🤖 Sing-Sub: asset: rename ${oldPath!.split('/').pop()} to ${fileName}`
      : `🤖 Sing-Sub: asset: update ${fileName}`;
    await commitMultiFiles(session, treeItems, workflowNeedsSync ? 'ruleset: synchronize compiler and update source' : actionMessage);
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 409) return errorResponse('File was modified; reload it before saving', 409);
    throw error;
  }
  return jsonResponse({ success: true });
}

async function putAssetFile(path: string, content: string, sha: string | undefined, oldPath: string | undefined, session: ReturnType<typeof toRepoSession>): Promise<Response> {
  const isRename = !!oldPath && oldPath !== path;
  const fileName = path.split('/').pop()!;
  const actionMessage = isRename
    ? `🤖 Sing-Sub: asset: rename ${oldPath!.split('/').pop()} to ${fileName}`
    : `🤖 Sing-Sub: asset: update ${fileName}`;
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
  if (!file) return errorResponse('File not found', 404);

  try {
    if (!isRulesetPath(path)) {
      await deleteFileContent(path, session, file.sha, `🤖 Sing-Sub: asset: delete ${path.split('/').pop()}`);
    } else {
      const basename = path.split('/').pop()!.replace(/\.json$/, '');
      const compiledPath = `sing-sub/rulesets/compiled/${basename}.srs`;
      const compiledFile = await fetchFileContent(compiledPath, session);
      const treeItems: GitTreeItem[] = [{ path, mode: '100644', type: 'blob', sha: null }];
      if (compiledFile) treeItems.push({ path: compiledPath, mode: '100644', type: 'blob', sha: null });
      await commitMultiFiles(session, treeItems, `🤖 Sing-Sub: ruleset: delete ${basename}${compiledFile ? ' and compiled artifact' : ''}`);
    }
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 409) return errorResponse('文件已被修改，请重新加载后再试', 409);
    throw error;
  }
  return jsonResponse({ success: true });
}
