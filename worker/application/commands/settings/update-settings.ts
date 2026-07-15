import type { WorkspaceSnapshot } from '../../../../shared';
import { executeWorkspaceCommand } from '../execute-workspace-command';
import type { WorkspaceStore } from '../../ports/workspace-store';

export interface UpdateWorkspaceSettingsCommand {
  workspaceId: string;
  expectedRevision: string;
  revisionId: string;
  createdAt: string;
  rotateSubscriptionToken: boolean;
}

export function updateWorkspaceSettings(
  store: WorkspaceStore<WorkspaceSnapshot>,
  command: UpdateWorkspaceSettingsCommand,
) {
  return executeWorkspaceCommand(store, {
    workspaceId: command.workspaceId,
    expectedRevision: command.expectedRevision,
    update: snapshot => ({
      ...snapshot,
      revisionId: command.revisionId,
      previousRevisionId: command.expectedRevision,
      createdAt: command.createdAt,
      settings: {
        ...snapshot.settings,
        tokenVersion: snapshot.settings.tokenVersion + (command.rotateSubscriptionToken ? 1 : 0),
      },
    }),
  });
}
