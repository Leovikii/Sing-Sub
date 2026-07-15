import { stateDataSchema, type StateData, type WorkspaceSnapshot } from '../../../../shared';
import { executeWorkspaceCommand } from '../execute-workspace-command';
import type { WorkspaceStore } from '../../ports/workspace-store';
import { markSyncLocalChange } from '../../../domain/sync/sync-state';

export interface SaveProfilesCommand {
  workspaceId: string;
  expectedRevision: string;
  revisionId: string;
  createdAt: string;
  state: StateData;
}

export function saveProfiles(
  store: WorkspaceStore<WorkspaceSnapshot>,
  command: SaveProfilesCommand,
) {
  const state = stateDataSchema.parse(command.state);
  return executeWorkspaceCommand(store, {
    workspaceId: command.workspaceId,
    expectedRevision: command.expectedRevision,
    update: snapshot => ({
      ...snapshot,
      revisionId: command.revisionId,
      previousRevisionId: command.expectedRevision,
      createdAt: command.createdAt,
      profiles: state.profiles,
      sync: markSyncLocalChange(snapshot.sync, command.createdAt),
    }),
  });
}
