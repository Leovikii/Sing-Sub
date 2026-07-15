import type { WorkspaceRevision } from '../../../shared';

export class WorkspaceConflictError extends Error {
  readonly expectedRevision: WorkspaceRevision;
  readonly actualRevision: WorkspaceRevision;

  constructor(expectedRevision: WorkspaceRevision, actualRevision: WorkspaceRevision) {
    super('Workspace revision conflict');
    this.name = 'WorkspaceConflictError';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}
