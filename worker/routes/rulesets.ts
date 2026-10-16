import { WorkspaceConflictError } from '../application/errors/workspace-conflict';
import { parseStrictJson } from '../lib/strict-json';
import { editableMetadata, splitAsset } from '../lib/workspace-metadata';
import { putFileRequestSchema, workspaceMetadataSchema, type JsonAsset, type EntityEditMetadata } from '../../shared';
import { deleteAsset, saveAsset } from '../application/commands/assets/mutate-asset';
import { saveRulesetSource } from '../application/commands/rulesets/save-ruleset-source';
import { dispatchSrsBuild } from '../application/srs/manage-srs-build';
import { createPrimaryWorkspaceServices } from '../composition/primary-workspace-services';
import {
  createOptionalCompilerDispatcher,
  createSrsBuildStores,
  createSrsJobTicketService,
} from '../composition/srs-compiler-services';
import { parseManagedAssetPath } from '../domain/assets/managed-asset-path';
import { requirePrimaryWorkspaceAuth } from '../http/authenticate';
import {
  mergeRuleBuckets,
  fetchPublicRuleset,
  parseImportedRules,
  parseRulesetImportUrl,
  readResponseTextLimited,
} from '../lib/rulesets';
import { errorResponse, jsonResponse } from '../lib/security';
import { logEvent, requestIdFor } from '../lib/logging';
import type { Env } from '../types';

type RulesetDefinition = NonNullable<NonNullable<EntityEditMetadata['editor']>['ruleset']>;
async function refreshRulesetSources(definition: RulesetDefinition) {
  const urls = definition.sources.map(source => parseRulesetImportUrl(source.url));
  const refreshed = [];
  for (const [index, source] of definition.sources.entries()) {
    try {
      const response = await fetchPublicRuleset(urls[index]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bucket = parseImportedRules(await readResponseTextLimited(response));
      if (!Object.values(bucket).some(values => values.length)) throw new Error('source contains no supported rules');
      refreshed.push({ source: { ...source, lastFetchedAt: new Date().toISOString() }, bucket });
    } catch (error) {
      throw new Error(`Source ${index + 1} (${source.url}) failed`, { cause: error });
    }
  }
  const merged = mergeRuleBuckets([{ domain: [], domain_suffix: [], domain_keyword: [], domain_regex: [], ...definition.manual }, ...refreshed.map(result => result.bucket)]);
  const rule = Object.fromEntries(Object.entries(merged).filter(([, values]) => values.length));
  return { content: JSON.stringify({ version: 2, rules: Object.keys(rule).length ? [rule] : [] }, null, 2),
    definition: { manual: definition.manual, sources: refreshed.map(result => result.source) } };
}

export async function handlePutFile(
  request: Request,
  env: Env,
  context?: Pick<ExecutionContext, 'waitUntil'>,
): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const parsed = putFileRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid asset request', 400, 'VALIDATION_FAILED');
  if (parsed.data.expectedRevision !== auth.revision) throw new WorkspaceConflictError(parsed.data.expectedRevision, auth.revision);
  const target = parseManagedAssetPath(parsed.data.path);
  const oldTarget = parsed.data.oldPath ? parseManagedAssetPath(parsed.data.oldPath) : target;
  if (!target || !oldTarget || target.kind !== oldTarget.kind) {
    return errorResponse('Unsupported asset path', 400, 'VALIDATION_FAILED');
  }

  let preparedContent = parsed.data.content;
  let metadata: EntityEditMetadata = parsed.data.metadata ?? {};
  const previous = auth.snapshot.assets[target.kind][oldTarget.entityId];
  const previousMeta = auth.snapshot.metadata?.entities[previous?.path ?? ''] ?? {};
  if (target.kind === 'rulesets') {
    try {
      const split = splitAsset({ path: parsed.data.path, content: parseStrictJson(preparedContent) as JsonAsset['content'] }, { ...previousMeta, ...metadata });
      metadata = { note: split.metadata.note, editor: split.metadata.editor };
      const definition = metadata.editor?.ruleset;
      if (definition?.needsReview) return errorResponse('Confirm stale ruleset editor before saving', 400, 'VALIDATION_FAILED');
      // Fetch observations are server-owned, including when an editor submits
      // unchanged sources alongside a note-only save.
      if (definition) definition.sources = definition.sources.map(source => {
        const observed = previousMeta.editor?.ruleset?.sources.find(item => item.url === source.url)?.lastFetchedAt;
        return { url: source.url, intervalHours: source.intervalHours, ...(observed ? { lastFetchedAt: observed } : {}) };
      });
      const bodyChanged = !previous || JSON.stringify(previous.content) !== JSON.stringify(split.asset.content);
      const editorChanged = JSON.stringify(editableMetadata({ editor: previousMeta.editor })) !== JSON.stringify(editableMetadata({ editor: metadata.editor }));
      if (definition && (bodyChanged || editorChanged)) {
        const refreshed = await refreshRulesetSources(definition);
        metadata = { ...metadata, editor: { ...metadata.editor, ruleset: refreshed.definition } };
        preparedContent = refreshed.content;
      } else preparedContent = JSON.stringify(split.asset.content, null, 2);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Ruleset refresh failed', 400, 'VALIDATION_FAILED');
    }
  }
  let content: unknown;
  try {
    content = parseStrictJson(preparedContent);
  } catch {
    return errorResponse('Asset is not valid JSON', 400, 'VALIDATION_FAILED');
  }
  if (!content || typeof content !== 'object' ||
      ((target.kind === 'templates' || target.kind === 'rulesets') && Array.isArray(content))) {
    return errorResponse('Asset JSON root is invalid', 400, 'VALIDATION_FAILED');
  }

  try {
    const separated = splitAsset({ path: parsed.data.path, content: content as JsonAsset['content'] }, { ...previousMeta, ...metadata });
    workspaceMetadataSchema.parse({ schemaVersion: 1, entities: { [parsed.data.path]: separated.metadata } });
    content = separated.asset.content;
    metadata = { note: separated.metadata.note, editor: separated.metadata.editor };
    preparedContent = JSON.stringify(content, null, 2);
  } catch {
    return errorResponse('Invalid or ambiguous asset metadata', 400, 'VALIDATION_FAILED');
  }
  const createdAt = new Date().toISOString();
  const baseCommand = {
    workspaceId: auth.workspaceId,
    expectedRevision: parsed.data.expectedRevision,
    revisionId: crypto.randomUUID(),
    createdAt,
    path: parsed.data.path,
    oldPath: parsed.data.oldPath,
    metadata,
    asset: {
      path: parsed.data.path,
      content: content as JsonAsset['content'],
    },
  };
  if (target.kind === 'rulesets' && (!previous || previous.path !== parsed.data.path || JSON.stringify(previous.content) !== JSON.stringify(content))) {
    const compiler = await createOptionalCompilerDispatcher(env, auth.workspaceId);
    const result = await saveRulesetSource(
      createPrimaryWorkspaceServices(env).workspaceStore,
      createSrsBuildStores(env).jobStore,
      { ...baseCommand, compilerEnabled: Boolean(compiler) },
    );
    if (result.job && compiler) {
      const dispatch = dispatchSrsBuild(
        {
          ...createSrsBuildStores(env),
          dispatcher: compiler,
          ticketService: createSrsJobTicketService(env),
          workerUrl: new URL(request.url).origin,
        },
        auth.workspaceId,
        result.job.jobId,
      ).then(status => {
        logEvent('log', { operation: 'srs.dispatch', requestId: requestIdFor(request), jobId: result.job?.jobId, status });
      });
      if (context) context.waitUntil(dispatch);
      else await dispatch;
    }
    return jsonResponse({
      success: true,
      revision: result.revision,
      content: preparedContent,
      build: result.build,
    });
  }
  const result = await saveAsset(createPrimaryWorkspaceServices(env).workspaceStore, baseCommand);
  return jsonResponse({
    success: true,
    revision: result.revision,
  });
}

export async function handleDeleteFile(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  const expectedRevision = url.searchParams.get('expectedRevision');
  if (!path || !expectedRevision || !parseManagedAssetPath(path)) {
    return errorResponse('Invalid asset delete request', 400, 'VALIDATION_FAILED');
  }
  const result = await deleteAsset(createPrimaryWorkspaceServices(env).workspaceStore, {
    workspaceId: auth.workspaceId,
    expectedRevision,
    revisionId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    path,
  });
  return jsonResponse({ success: true, revision: result.revision });
}
