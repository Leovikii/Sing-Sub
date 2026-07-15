import { workspaceSnapshotSchema, type WorkspaceSnapshot } from '../../../../shared';
import type { WorkspaceStore } from '../../ports/workspace-store';

export interface InitializeEmptyWorkspaceCommand {
  workspaceId: string;
  revisionId: string;
  createdAt: string;
}

export function initializeEmptyWorkspace(
  store: WorkspaceStore<WorkspaceSnapshot>,
  command: InitializeEmptyWorkspaceCommand,
) {
  const snapshot = workspaceSnapshotSchema.parse({
    schemaVersion: 1,
    workspaceId: command.workspaceId,
    revisionId: command.revisionId,
    previousRevisionId: null,
    createdAt: command.createdAt,
    settings: {
      userLogin: 'Administrator',
      userAvatar: '',
      authVersion: 1,
      tokenVersion: 1,
    },
    profiles: [],
    assets: { nodes: {}, templates: {}, patches: {}, rulesets: {} },
    builds: {},
    sync: { status: 'never' },
  });
  return store.create({ workspaceId: command.workspaceId, snapshot });
}
