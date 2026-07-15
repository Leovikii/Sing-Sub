import type { WorkspaceSnapshot } from '../../shared';
import { authenticatePrimarySession } from '../application/auth/primary-workspace-auth';
import type { WorkspaceRead } from '../application/ports/workspace-store';
import { createPrimaryWorkspaceServices } from '../composition/primary-workspace-services';
import { readSessionCookie } from '../infrastructure/security/session-cookie';
import type { Env } from '../types';
import { errorResponse } from '../lib/security';

export async function getPrimaryWorkspaceAuth(
  request: Request,
  env: Env,
): Promise<WorkspaceRead<WorkspaceSnapshot> | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  try {
    return await authenticatePrimarySession(token, createPrimaryWorkspaceServices(env));
  } catch {
    return null;
  }
}

export async function requirePrimaryWorkspaceAuth(
  request: Request,
  env: Env,
): Promise<WorkspaceRead<WorkspaceSnapshot> | Response> {
  const authenticated = await getPrimaryWorkspaceAuth(request, env);
  return authenticated || errorResponse('Not authenticated', 401, 'NOT_AUTHENTICATED');
}
