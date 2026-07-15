import { updateSrsCompilerRequestSchema } from '../../shared';
import {
  disableSrsCompiler,
  enableSrsCompiler,
  readSrsCompilerStatus,
  recordSrsCompilerDispatchFailure,
  SrsCompilerNotConnectedError,
} from '../application/srs/manage-srs-compiler';
import {
  dispatchSrsBuildBatch,
  reconcileSrsBuilds,
} from '../application/srs/reconcile-srs-builds';
import {
  createOptionalCompilerDispatcher,
  createSrsBuildStores,
  createSrsCompilerManagementServices,
  createSrsJobTicketService,
} from '../composition/srs-compiler-services';
import { requirePrimaryWorkspaceAuth } from '../http/authenticate';
import {
  GitHubCompilerProvisioningError,
} from '../infrastructure/github/github-compiler-provisioner';
import { errorResponse, jsonResponse } from '../lib/security';
import { logEvent, requestIdFor } from '../lib/logging';
import type { Env } from '../types';

export async function handleGetSrsCompiler(request: Request, env: Env): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const services = createSrsCompilerManagementServices(env);
  return jsonResponse(await readSrsCompilerStatus(services.privateMetadataStore, auth.workspaceId));
}

export async function handlePutSrsCompiler(
  request: Request,
  env: Env,
  context?: Pick<ExecutionContext, 'waitUntil'>,
): Promise<Response> {
  const auth = await requirePrimaryWorkspaceAuth(request, env);
  if (auth instanceof Response) return auth;
  const parsed = updateSrsCompilerRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid SRS compiler request', 400, 'VALIDATION_FAILED');
  const services = createSrsCompilerManagementServices(env);
  if (!parsed.data.enabled) {
    return jsonResponse(await disableSrsCompiler(services.privateMetadataStore, auth.workspaceId));
  }
  try {
    const status = await enableSrsCompiler(services, auth.workspaceId);
    const stores = createSrsBuildStores(env);
    const reconciled = await reconcileSrsBuilds(stores, auth.workspaceId);
    const compiler = await createOptionalCompilerDispatcher(env, auth.workspaceId);
    if (!compiler) throw new Error('SRS compiler became unavailable after provisioning');
    const dispatch = dispatchSrsBuildBatch({
      ...stores,
      dispatcher: compiler,
      ticketService: createSrsJobTicketService(env),
      workerUrl: new URL(request.url).origin,
    }, auth.workspaceId, reconciled.dispatchJobIds).then(async results => {
      const failed = Object.values(results).filter(result => result === 'failed').length;
      if (failed > 0) {
        await recordSrsCompilerDispatchFailure(services.privateMetadataStore, auth.workspaceId);
      }
      logEvent('log', {
        operation: 'srs.reconcile.dispatch',
        requestId: requestIdFor(request),
        jobs: Object.keys(results).length,
        failed,
      });
    });
    if (context) context.waitUntil(dispatch);
    else await dispatch;
    return jsonResponse({
      ...status,
      reconcile: {
        revision: reconciled.revision,
        createdJobs: reconciled.createdJobIds.length,
        dispatchedJobs: reconciled.dispatchJobIds.length,
      },
    });
  } catch (error) {
    if (error instanceof SrsCompilerNotConnectedError) {
      return errorResponse(error.message, 409, 'BUILD_DISPATCH_FAILED', undefined, {
        reason: 'GITHUB_NOT_CONNECTED',
      });
    }
    if (error instanceof GitHubCompilerProvisioningError) {
      const status = ['REPOSITORY_ACCESS_DENIED', 'REPOSITORY_READ_ONLY', 'WORKFLOW_PERMISSION_DENIED']
        .includes(error.code) ? 403 : error.code === 'REPOSITORY_NOT_PRIVATE' ? 409 : 502;
      return errorResponse(error.message, status, 'BUILD_DISPATCH_FAILED', undefined, {
        reason: error.code,
      });
    }
    throw error;
  }
}
