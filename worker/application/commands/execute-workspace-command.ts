import type { WorkspaceRevision } from '../../../shared';
import { WorkspaceConflictError } from '../errors/workspace-conflict';
import type { PublishWorkspaceResult, WorkspaceStore } from '../ports/workspace-store';

export interface ExecuteWorkspaceCommand<TSnapshot> {
  workspaceId: string;
  expectedRevision: WorkspaceRevision;
  update(snapshot: TSnapshot): TSnapshot;
}

export async function executeWorkspaceCommand<TSnapshot>(
  store: WorkspaceStore<TSnapshot>,
  command: ExecuteWorkspaceCommand<TSnapshot>,
): Promise<PublishWorkspaceResult> {
  const current = await store.read(command.workspaceId);
  if (current.revision !== command.expectedRevision) {
    throw new WorkspaceConflictError(command.expectedRevision, current.revision);
  }

  const next = command.update(structuredClone(current.snapshot));
  return store.publish({
    workspaceId: command.workspaceId,
    expectedRevision: command.expectedRevision,
    snapshot: next,
  });
}
