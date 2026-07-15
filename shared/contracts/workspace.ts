export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'failed';
export type SrsBuildStatus = 'none' | 'pending' | 'dispatching' | 'compiling' | 'ready' | 'failed' | 'superseded';
export type SyncStatus = 'never' | 'synced' | 'local-ahead' | 'remote-ahead' | 'conflict' | 'running' | 'failed';

export type WorkspaceRevision = string;

export interface Revisioned {
  revision: WorkspaceRevision;
}

export interface ExpectedRevision {
  expectedRevision: WorkspaceRevision;
}

export type WorkspaceHead = import('../schemas/workspace.schema').WorkspaceHeadDocument;
