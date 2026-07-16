import type { LoginResult } from '../../shared';
import { loginRequestSchema, updateSettingsRequestSchema } from '../../shared';
import { loginPrimaryWorkspace } from '../application/auth/primary-workspace-auth';
import { toPublicWorkspaceSettings } from '../application/auth/public-workspace-settings';
import { initializeEmptyWorkspace } from '../application/commands/workspace/initialize-empty-workspace';
import { updateWorkspaceSettings } from '../application/commands/settings/update-settings';
import { createPrimaryWorkspaceServices } from '../composition/primary-workspace-services';
import { PRIMARY_WORKSPACE_ID } from '../domain/workspace/primary-workspace';
import { WorkspaceNotFoundError } from '../infrastructure/r2/r2-workspace-errors';
import {
  clearSessionCookieHeader,
  sessionCookieHeader,
} from '../infrastructure/security/session-cookie';
import { getPrimaryWorkspaceAuth } from '../http/authenticate';
import { errorResponse, jsonResponse } from '../lib/security';
import type { Env } from '../types';

const SESSION_MAX_AGE_SECONDS = 86400 * 30;

async function publicSettings(workspace: Parameters<typeof toPublicWorkspaceSettings>[0], env: Env) {
  return toPublicWorkspaceSettings(workspace, createPrimaryWorkspaceServices(env).tokenService);
}

async function workspaceExists(env: Env): Promise<boolean> {
  try {
    await createPrimaryWorkspaceServices(env).workspaceStore.read(PRIMARY_WORKSPACE_ID);
    return true;
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) return false;
    throw error;
  }
}

export async function handleBootstrap(request: Request, env: Env): Promise<Response> {
  const workspace = await getPrimaryWorkspaceAuth(request, env);
  if (!workspace) {
    return jsonResponse({ settings: null, setupRequired: !await workspaceExists(env) });
  }
  return jsonResponse({
    settings: await publicSettings(workspace, env),
    state: { profiles: workspace.snapshot.profiles },
    revision: workspace.revision,
    setupRequired: false,
  });
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const parsed = loginRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid login request', 400, 'VALIDATION_FAILED');
  const services = createPrimaryWorkspaceServices(env);
  if (!await services.adminAuthenticator.verify(parsed.data.adminPassword)) {
    return errorResponse('Invalid administrator credentials', 401, 'NOT_AUTHENTICATED');
  }

  if (!await workspaceExists(env)) {
    await initializeEmptyWorkspace(services.workspaceStore, {
      workspaceId: PRIMARY_WORKSPACE_ID,
      revisionId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    });
  }

  const now = Math.floor(Date.now() / 1000);
  const login = await loginPrimaryWorkspace(
    parsed.data.adminPassword,
    now + SESSION_MAX_AGE_SECONDS,
    services,
  );
  if (!login) return errorResponse('Invalid administrator credentials', 401, 'NOT_AUTHENTICATED');
  const result: LoginResult = {
    ...await publicSettings(login.workspace, env),
    revision: login.workspace.revision,
  };
  return jsonResponse(result, 200, {
    'Set-Cookie': sessionCookieHeader(login.token, SESSION_MAX_AGE_SECONDS),
  });
}

export async function handleLogout(_request?: Request, _env?: Env): Promise<Response> {
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader() });
}

export async function handleGetSettings(request: Request, env: Env): Promise<Response> {
  const workspace = await getPrimaryWorkspaceAuth(request, env);
  if (!workspace) return errorResponse('Not authenticated', 401, 'NOT_AUTHENTICATED');
  return jsonResponse(await publicSettings(workspace, env));
}

export async function handlePutSettings(request: Request, env: Env): Promise<Response> {
  const workspace = await getPrimaryWorkspaceAuth(request, env);
  if (!workspace) return errorResponse('Not authenticated', 401, 'NOT_AUTHENTICATED');
  const parsed = updateSettingsRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse('Invalid settings request', 400, 'VALIDATION_FAILED');
  const services = createPrimaryWorkspaceServices(env);
  const result = await updateWorkspaceSettings(services.workspaceStore, {
    workspaceId: workspace.workspaceId,
    expectedRevision: parsed.data.expectedRevision,
    revisionId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    rotateSubscriptionToken: parsed.data.rotateSubscriptionToken,
  });
  const updated = await services.workspaceStore.read(workspace.workspaceId);
  const response: LoginResult = {
    ...await toPublicWorkspaceSettings(updated, services.tokenService),
    revision: result.revision,
  };
  return jsonResponse(response);
}
