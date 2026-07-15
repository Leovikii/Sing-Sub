import type { LoginResult } from '../../shared';
import { loginRequestSchema, updateSettingsRequestSchema } from '../../shared';
import { loginPrimaryWorkspace } from '../application/auth/primary-workspace-auth';
import { toPublicWorkspaceSettings } from '../application/auth/public-workspace-settings';
import { initializeEmptyWorkspace } from '../application/commands/workspace/initialize-empty-workspace';
import { updateWorkspaceSettings } from '../application/commands/settings/update-settings';
import type { GithubImportSettings } from '../application/migration/legacy-migration-model';
import { migrateLegacyWorkspace } from '../application/migration/migrate-legacy-workspace';
import { createPrimaryWorkspaceServices } from '../composition/primary-workspace-services';
import { PRIMARY_WORKSPACE_ID } from '../domain/workspace/primary-workspace';
import { GithubLegacySourceReader } from '../infrastructure/github/github-legacy-source-reader';
import { dryRunLegacyMigration } from '../infrastructure/legacy/legacy-migration-dry-run';
import { isWorkspaceV1, upgradeWorkspaceV1 } from '../infrastructure/r2/r2-workspace-v1-upgrade';
import { WorkspaceNotFoundError, WorkspaceStorageCorruptError } from '../infrastructure/r2/r2-workspace-errors';
import {
  clearSessionCookieHeader,
  sessionCookieHeader,
} from '../infrastructure/security/session-cookie';
import { fetchRepository, fetchUser, type RepoSession } from '../lib/github';
import { getPrimaryWorkspaceAuth } from '../http/authenticate';
import { errorResponse, jsonResponse } from '../lib/security';
import { logEvent, requestIdFor } from '../lib/logging';
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
    if (error instanceof WorkspaceStorageCorruptError &&
        await isWorkspaceV1(env.WORKSPACE_BUCKET, PRIMARY_WORKSPACE_ID)) return true;
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

  const upgrade = await upgradeWorkspaceV1(
    env.WORKSPACE_BUCKET,
    PRIMARY_WORKSPACE_ID,
    new Date().toISOString(),
  );
  if (upgrade === 'upgraded') {
    logEvent('log', {
      operation: 'workspace.v1-upgrade',
      requestId: requestIdFor(request),
      status: 'completed',
    });
  }

  if (!await workspaceExists(env)) {
    const { owner, repo, pat } = parsed.data;
    if (owner && repo && pat) {
      const userResponse = await fetchUser(pat);
      if (!userResponse.ok) return errorResponse('Invalid GitHub PAT', 401, 'NOT_AUTHENTICATED');
      const user = await userResponse.json() as { login: string; avatar_url: string };
      let repository: { default_branch: string };
      try {
        repository = await fetchRepository(owner, repo, pat);
      } catch {
        return errorResponse('Repository not found or not accessible', 404, 'NOT_FOUND');
      }

      const settings: GithubImportSettings = {
        pat,
        owner,
        repo,
        userLogin: user.login,
        userAvatar: user.avatar_url,
        defaultBranch: repository.default_branch,
      };
      const session: RepoSession = { owner, repo, pat, defaultBranch: repository.default_branch };
      const source = await new GithubLegacySourceReader(session).read();
      const dryRun = dryRunLegacyMigration(source, settings);
      if (!dryRun.valid || !dryRun.normalized) {
        return errorResponse(
          dryRun.issues.find(issue => issue.severity === 'error')?.message || 'GitHub import validation failed',
          400,
          'VALIDATION_FAILED',
        );
      }
      await migrateLegacyWorkspace({
        workspaceId: PRIMARY_WORKSPACE_ID,
        revisionId: crypto.randomUUID(),
        migratedAt: new Date().toISOString(),
        normalized: dryRun.normalized,
      }, services);
    } else {
      await initializeEmptyWorkspace(services.workspaceStore, {
        workspaceId: PRIMARY_WORKSPACE_ID,
        revisionId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      });
    }
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
