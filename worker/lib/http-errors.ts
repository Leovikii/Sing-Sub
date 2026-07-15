import type { ApiErrorCode } from '../../shared';
import { WorkspaceConflictError } from '../application/errors/workspace-conflict';
import { AssetAlreadyExistsError, AssetNotFoundError } from '../application/errors/asset-errors';
import { errorResponse } from './security';
import { SyncBaseInvalidError, SyncConflictError } from '../application/sync/sync-workspace';
import { SyncTreeValidationError } from '../application/sync/import-sync-tree';
import { GitHubSyncError } from '../infrastructure/github/github-sync-gateway';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, string | number | boolean>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    details?: Record<string, string | number | boolean>,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function toErrorResponse(error: unknown, requestId?: string): Response {
  if (error instanceof AssetNotFoundError) {
    return errorResponse('Asset not found', 404, 'ASSET_NOT_FOUND', requestId);
  }
  if (error instanceof AssetAlreadyExistsError) {
    return errorResponse('Asset already exists', 409, 'REVISION_CONFLICT', requestId);
  }
  if (error instanceof WorkspaceConflictError) {
    return errorResponse('Workspace revision conflict', 409, 'REVISION_CONFLICT', requestId, {
      expectedRevision: error.expectedRevision,
      actualRevision: error.actualRevision,
    });
  }
  if (error instanceof SyncConflictError) {
    return errorResponse(error.message, 409, 'SYNC_CONFLICT', requestId, {
      status: error.status,
      direction: error.direction,
    });
  }
  if (error instanceof SyncTreeValidationError) {
    return errorResponse('GitHub sync tree validation failed', 400, 'VALIDATION_FAILED', requestId, {
      reason: error.code,
      path: error.path,
    });
  }
  if (error instanceof GitHubSyncError) {
    if (error.code === 'REMOTE_CHANGED') {
      return errorResponse('GitHub branch changed during synchronization', 409, 'SYNC_CONFLICT', requestId, {
        reason: error.code,
      });
    }
    if (['REPOSITORY_ACCESS_DENIED', 'REPOSITORY_NOT_PRIVATE', 'REPOSITORY_READ_ONLY', 'REPOSITORY_UNAVAILABLE']
      .includes(error.code)) {
      return errorResponse('GitHub sync repository is unavailable', 403, 'FORBIDDEN', requestId, {
        reason: error.code,
      });
    }
    return errorResponse('GitHub synchronization failed', 502, 'INTERNAL_ERROR', requestId, {
      reason: error.code,
    });
  }
  if (error instanceof SyncBaseInvalidError) {
    return errorResponse('GitHub sync base is invalid', 500, 'INTERNAL_ERROR', requestId);
  }
  if (error instanceof HttpError) {
    return errorResponse(error.message, error.status, error.code, requestId, error.details);
  }
  return errorResponse('Internal server error', 500, 'INTERNAL_ERROR', requestId);
}
