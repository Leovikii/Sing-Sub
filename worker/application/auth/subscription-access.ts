import type { WorkspaceSnapshot } from '../../../shared';
import { PRIMARY_WORKSPACE_ID } from '../../domain/workspace/primary-workspace';
import type { AuthTokenService } from '../ports/auth-token-service';
import type { WorkspaceRead, WorkspaceStore } from '../ports/workspace-store';

export async function authenticateSubscriptionAccess(
  token: string,
  workspaceStore: WorkspaceStore<WorkspaceSnapshot>,
  tokenService: AuthTokenService,
): Promise<WorkspaceRead<WorkspaceSnapshot> | null> {
  const workspace = await workspaceStore.read(PRIMARY_WORKSPACE_ID);
  const claims = await tokenService.verifySubscription(
    token,
    workspace.snapshot.settings.tokenVersion,
  );
  return claims?.workspaceId === PRIMARY_WORKSPACE_ID && claims.purpose === 'subscription'
    ? workspace
    : null;
}
