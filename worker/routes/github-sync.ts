import {
  githubSyncConnectionRequestSchema,
  syncOperationRequestSchema,
  type SyncOperationResult,
} from '../../shared';
import {
  connectGithubSync,
  disconnectGithubSync,
  readGithubSyncConnection,
} from '../application/sync/manage-sync-connection';
import {
  getDisconnectedWorkspaceSyncStatus,
  getWorkspaceSyncStatus,
  pullWorkspaceFromGithub,
  pushWorkspaceToGithub,
} from '../application/sync/sync-workspace';
import { recordSrsCompilerDispatchFailure } from '../application/srs/manage-srs-compiler';
import { dispatchSrsBuildBatch, reconcileSrsBuilds } from '../application/srs/reconcile-srs-builds';
import { createGithubSyncServices } from '../composition/github-sync-services';
import {
  createOptionalCompilerDispatcher,
  createSrsBuildStores,
  createSrsCompilerManagementServices,
  createSrsJobTicketService,
} from '../composition/srs-compiler-services';
import { requirePrimaryWorkspaceAuth } from '../http/authenticate';
import { errorResponse, jsonResponse } from '../lib/security';
import { logEvent, requestIdFor } from '../lib/logging';
import type { Env } from '../types';

async function connectedDependencies(env: Env, workspaceId: string) {
  const services = createGithubSyncServices(env);
  const connected = await readGithubSyncConnection(services.privateMetadataStore, workspaceId);
  if (!connected.connection) return null;
  return {
    ...services,
    connection: connected.connection,
    gateway: services.gatewayFactory.create(connected.connection),
  };
}

export async function handleGetGithubSync(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const dependencies = await connectedDependencies(env, auth.workspaceId);
  if (!dependencies) {
    return jsonResponse(await getDisconnectedWorkspaceSyncStatus(
      createGithubSyncServices(env).workspaceStore,
      auth,
    ));
  }
  return jsonResponse(await getWorkspaceSyncStatus(dependencies, auth.workspaceId));
}

export async function handlePutGithubSyncConnection(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const parsed = githubSyncConnectionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid GitHub sync connection', 400, 'VALIDATION_FAILED');
  const services = createGithubSyncServices(env);
  return jsonResponse(await connectGithubSync(
    services.privateMetadataStore,
    services.gatewayFactory,
    auth.workspaceId,
    parsed.data,
  ));
}

export async function handleDeleteGithubSyncConnection(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  return jsonResponse(await disconnectGithubSync(
    createGithubSyncServices(env).privateMetadataStore,
    auth.workspaceId,
  ));
}

function notConnected(): Response {
  return errorResponse('GitHub sync repository is not connected', 409, 'SYNC_CONFLICT', undefined, {
    reason: 'GITHUB_NOT_CONNECTED',
  });
}

export async function handlePushGithubSync(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const parsed = syncOperationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid GitHub sync push request', 400, 'VALIDATION_FAILED');
  const dependencies = await connectedDependencies(env, auth.workspaceId);
  if (!dependencies) return notConnected();
  return jsonResponse(await pushWorkspaceToGithub(dependencies, {
    workspaceId: auth.workspaceId,
    expectedRevision: parsed.data.expectedRevision,
    overwrite: parsed.data.resolution === 'overwrite',
  }));
}

async function reconcilePulledRulesets(
  request: Request,
  env: Env,
  workspaceId: string,
  result: SyncOperationResult,
  context?: Pick<ExecutionContext, 'waitUntil'>,
): Promise<SyncOperationResult> {
  if (result.action !== 'pulled') return result;
  const compiler = await createOptionalCompilerDispatcher(env, workspaceId);
  if (!compiler) return result;
  const stores = createSrsBuildStores(env);
  let reconciled: Awaited<ReturnType<typeof reconcileSrsBuilds>>;
  try {
    reconciled = await reconcileSrsBuilds(stores, workspaceId);
  } catch {
    logEvent('error', { operation: 'sync.pull.srs-reconcile', requestId: requestIdFor(request), status: 'failed' });
    return { ...result, warnings: ['SRS_RECONCILE_FAILED'] };
  }
  const reconciledResult = { ...result, revision: reconciled.revision };
  const dispatch = dispatchSrsBuildBatch({
    ...stores,
    dispatcher: compiler,
    ticketService: createSrsJobTicketService(env),
    workerUrl: new URL(request.url).origin,
  }, workspaceId, reconciled.dispatchJobIds).then(async results => {
    const failed = Object.values(results).filter(status => status === 'failed').length;
    if (failed > 0) {
      await recordSrsCompilerDispatchFailure(
        createSrsCompilerManagementServices(env).privateMetadataStore,
        workspaceId,
      );
    }
    logEvent('log', { operation: 'sync.pull.srs-dispatch', requestId: requestIdFor(request), jobs: Object.keys(results).length, failed });
  });
  if (context) {
    context.waitUntil(dispatch.catch(() => {
      logEvent('error', { operation: 'sync.pull.srs-dispatch', requestId: requestIdFor(request), status: 'failed' });
    }));
    return reconciledResult;
  }
  try {
    await dispatch;
    return reconciledResult;
  } catch {
    logEvent('error', { operation: 'sync.pull.srs-dispatch', requestId: requestIdFor(request), status: 'failed' });
    return { ...reconciledResult, warnings: ['SRS_DISPATCH_FAILED'] };
  }
}

export async function handlePullGithubSync(
  request: Request,
  env: Env,
  context?: Pick<ExecutionContext, 'waitUntil'>,
): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const parsed = syncOperationRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid GitHub sync pull request', 400, 'VALIDATION_FAILED');
  const dependencies = await connectedDependencies(env, auth.workspaceId);
  if (!dependencies) return notConnected();
  const result = await pullWorkspaceFromGithub(dependencies, {
    workspaceId: auth.workspaceId,
    expectedRevision: parsed.data.expectedRevision,
    overwrite: parsed.data.resolution === 'overwrite',
  });
  return jsonResponse(await reconcilePulledRulesets(request, env, auth.workspaceId, result, context));
}
