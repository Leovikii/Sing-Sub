import type { WorkspaceSnapshot } from '../../../shared';
import { PRIMARY_WORKSPACE_ID } from '../../domain/workspace/primary-workspace';
import type { AdminAuthenticator } from '../ports/admin-authenticator';
import type { AuthTokenService } from '../ports/auth-token-service';
import type { WorkspaceRead, WorkspaceStore } from '../ports/workspace-store';

export interface PrimaryWorkspaceAuthDependencies {
  workspaceStore: WorkspaceStore<WorkspaceSnapshot>;
  tokenService: AuthTokenService;
}

export interface AdminLoginDependencies extends PrimaryWorkspaceAuthDependencies {
  adminAuthenticator: AdminAuthenticator;
}

export interface AdminLoginResult {
  token: string;
  expiresAt: number;
  workspace: WorkspaceRead<WorkspaceSnapshot>;
}

export async function authenticatePrimarySession(
  token: string,
  dependencies: PrimaryWorkspaceAuthDependencies,
): Promise<WorkspaceRead<WorkspaceSnapshot> | null> {
  const workspace = await dependencies.workspaceStore.read(PRIMARY_WORKSPACE_ID);
  const claims = await dependencies.tokenService.verifySession(
    token,
    workspace.snapshot.settings.authVersion,
  );
  return claims?.workspaceId === PRIMARY_WORKSPACE_ID ? workspace : null;
}

export async function loginPrimaryWorkspace(
  password: string,
  expiresAt: number,
  dependencies: AdminLoginDependencies,
): Promise<AdminLoginResult | null> {
  if (!await dependencies.adminAuthenticator.verify(password)) return null;
  const workspace = await dependencies.workspaceStore.read(PRIMARY_WORKSPACE_ID);
  const token = await dependencies.tokenService.issueSession({
    workspaceId: PRIMARY_WORKSPACE_ID,
    authVersion: workspace.snapshot.settings.authVersion,
    expiresAt,
  });
  return { token, expiresAt, workspace };
}
