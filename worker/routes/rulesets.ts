import { putFileRequestSchema, type JsonAsset } from '../../shared';
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
  createRulesetDocument,
  fetchPublicRuleset,
  parseImportedRules,
  parseRulesetImportUrl,
  readResponseTextLimited,
  readRulesetMetadata,
  validateRulesetSource,
} from '../lib/rulesets';
import { errorResponse, jsonResponse } from '../lib/security';
import { logEvent, requestIdFor } from '../lib/logging';
import type { Env } from '../types';

function noteFromJson(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const metadata = record._sing_sub;
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata) &&
      typeof (metadata as Record<string, unknown>).note === 'string') {
    return (metadata as Record<string, unknown>).note as string;
  }
  return typeof record.note === 'string' ? record.note : undefined;
}

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
    } catch (error) {
      throw new Error(`Source ${index + 1} (${source.url}) failed`, { cause: error });
    }
  }
  return createRulesetDocument(
    { ...metadata, sources: refreshed.map(result => result.source) },
    refreshed.map(result => result.bucket),
  );
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
  const target = parseManagedAssetPath(parsed.data.path);
  const oldTarget = parsed.data.oldPath ? parseManagedAssetPath(parsed.data.oldPath) : target;
  if (!target || !oldTarget || target.kind !== oldTarget.kind) {
    return errorResponse('Unsupported asset path', 400, 'VALIDATION_FAILED');
  }

  let preparedContent = parsed.data.content;
  if (target.kind === 'rulesets') {
    const validationError = validateRulesetSource(preparedContent);
    if (validationError) return errorResponse(validationError, 400, 'VALIDATION_FAILED');
    try {
      preparedContent = await refreshRulesetSources(preparedContent);
    } catch (error) {
      return errorResponse(error instanceof Error ? error.message : 'Ruleset refresh failed', 400, 'VALIDATION_FAILED');
    }
  }
  let content: unknown;
  try {
    content = JSON.parse(preparedContent);
  } catch {
    return errorResponse('Asset is not valid JSON', 400, 'VALIDATION_FAILED');
  }
  if (!content || typeof content !== 'object' ||
      ((target.kind === 'templates' || target.kind === 'patches' || target.kind === 'rulesets') && Array.isArray(content))) {
    return errorResponse('Asset JSON root is invalid', 400, 'VALIDATION_FAILED');
  }

  const createdAt = new Date().toISOString();
  const baseCommand = {
    workspaceId: auth.workspaceId,
    expectedRevision: parsed.data.expectedRevision,
    revisionId: crypto.randomUUID(),
    createdAt,
    path: parsed.data.path,
    oldPath: parsed.data.oldPath,
    asset: {
      path: parsed.data.path,
      content: content as JsonAsset['content'],
      note: noteFromJson(content),
      updatedAt: createdAt,
    },
  };
  if (target.kind === 'rulesets') {
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
