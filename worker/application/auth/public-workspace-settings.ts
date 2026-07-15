import type { PublicUserSettings, WorkspaceSnapshot } from '../../../shared';
import { PRIMARY_WORKSPACE_ID } from '../../domain/workspace/primary-workspace';
import type { AuthTokenService } from '../ports/auth-token-service';
import type { WorkspaceRead } from '../ports/workspace-store';

export async function toPublicWorkspaceSettings(
  workspace: WorkspaceRead<WorkspaceSnapshot>,
  tokenService: AuthTokenService,
): Promise<PublicUserSettings> {
  const { settings } = workspace.snapshot;
  return {
    owner: settings.owner,
    repo: settings.repo,
    subToken: await tokenService.issueSubscription({
      workspaceId: PRIMARY_WORKSPACE_ID,
      tokenVersion: settings.tokenVersion,
      purpose: 'subscription',
    }),
    userLogin: settings.userLogin,
    userAvatar: settings.userAvatar,
    defaultBranch: settings.defaultBranch,
  };
}
