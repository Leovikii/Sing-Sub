import {
  persistedWorkspaceSnapshotSchema,
  type WorkspaceSnapshot,
} from '../../../../shared';
import type { WorkspaceStore } from '../../ports/workspace-store';
import { projectWorkspace } from '../../../lib/workspace-metadata';

export interface InitializeEmptyWorkspaceCommand {
  workspaceId: string;
  revisionId: string;
  createdAt: string;
}

export function initializeEmptyWorkspace(
  store: WorkspaceStore<WorkspaceSnapshot>,
  command: InitializeEmptyWorkspaceCommand,
) {
  const snapshot = persistedWorkspaceSnapshotSchema.parse({
    schemaVersion: 4,
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
    assets: {
      nodes: {},
      templates: {},
      rulesets: {},
    },
    builds: {},
    metadata: { schemaVersion: 1, entities: {} },
    sync: { status: 'never' },
  });
  return store.create({ workspaceId: command.workspaceId, snapshot: projectWorkspace(snapshot) });
}
