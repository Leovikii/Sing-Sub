import type { SrsBuildStatus } from '../../shared';
import { dispatchSrsBuild } from '../application/srs/manage-srs-build';
import {
  createOptionalCompilerDispatcher,
  createSrsBuildStores,
  createSrsJobTicketService,
} from '../composition/srs-compiler-services';
import { requirePrimaryWorkspaceAuth } from '../http/authenticate';
import { logEvent, requestIdFor } from '../lib/logging';
import { errorResponse, jsonResponse } from '../lib/security';
import type { Env } from '../types';

const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export async function handleGetRulesetBuild(
  request: Request,
  env: Env,
  rulesetId: string,
): Promise<Response> {
  if (!SAFE_NAME.test(rulesetId)) return errorResponse('Ruleset not found', 404, 'NOT_FOUND');
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const stores = createSrsBuildStores(env);
  const workspace = await stores.workspaceStore.read(auth.workspaceId);
  if (!workspace.snapshot.assets.rulesets[rulesetId]) {
    return errorResponse('Ruleset not found', 404, 'NOT_FOUND');
  }
  const build = workspace.snapshot.builds[rulesetId] || null;
  const job = build ? await stores.jobStore.read(auth.workspaceId, build.jobId) : null;
  const compiler = await createOptionalCompilerDispatcher(env, auth.workspaceId);
  return jsonResponse({
    revision: workspace.revision,
    rulesetId,
    status: (job?.job.status || build?.status || 'none') as SrsBuildStatus,
    compilerAvailable: Boolean(compiler),
    formats: { source: true, binary: Boolean(build?.activeArtifact) },
    build,
  });
}

export async function handleRetryRulesetBuild(
  request: Request,
  env: Env,
  rulesetId: string,
  context?: Pick<ExecutionContext, 'waitUntil'>,
): Promise<Response> {
  if (!SAFE_NAME.test(rulesetId)) return errorResponse('Ruleset not found', 404, 'NOT_FOUND');
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const stores = createSrsBuildStores(env);
  const workspace = await stores.workspaceStore.read(auth.workspaceId);
  const build = workspace.snapshot.builds[rulesetId];
  const job = build ? await stores.jobStore.read(auth.workspaceId, build.jobId) : null;
  if (!job || job.job.status !== 'failed') {
    return errorResponse('Build is not retryable', 409, 'BUILD_FAILED');
  }
  const compiler = await createOptionalCompilerDispatcher(env, auth.workspaceId);
  if (!compiler) {
    return errorResponse('SRS compiler is not configured', 409, 'BUILD_DISPATCH_FAILED');
  }
  const retry = dispatchSrsBuild(
    {
      ...stores,
      dispatcher: compiler,
      ticketService: createSrsJobTicketService(env),
      workerUrl: new URL(request.url).origin,
    },
    auth.workspaceId,
    job.job.jobId,
  ).then(status => {
    logEvent('log', { operation: 'srs.retry', requestId: requestIdFor(request), jobId: job.job.jobId, status });
  });
  if (context) context.waitUntil(retry);
  else await retry;
  return jsonResponse({ accepted: true, jobId: job.job.jobId }, 202);
}
