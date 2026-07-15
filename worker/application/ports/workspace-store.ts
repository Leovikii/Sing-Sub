import type { WorkspaceRevision } from '../../../shared';

export interface WorkspaceRead<TSnapshot> {
  workspaceId: string;
  revision: WorkspaceRevision;
  snapshot: TSnapshot;
}

export interface PublishWorkspaceCommand<TSnapshot> {
  workspaceId: string;
  expectedRevision: WorkspaceRevision;
  snapshot: TSnapshot;
}

export interface PublishWorkspaceResult {
  revision: WorkspaceRevision;
  previousRevision: WorkspaceRevision | null;
}

export interface CreateWorkspaceCommand<TSnapshot> {
  workspaceId: string;
  snapshot: TSnapshot;
}

export interface WorkspaceStore<TSnapshot> {
  create(command: CreateWorkspaceCommand<TSnapshot>): Promise<PublishWorkspaceResult>;
  read(workspaceId: string): Promise<WorkspaceRead<TSnapshot>>;
  readRevision(workspaceId: string, revision: WorkspaceRevision): Promise<TSnapshot>;
  publish(command: PublishWorkspaceCommand<TSnapshot>): Promise<PublishWorkspaceResult>;
}
