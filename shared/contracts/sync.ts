import type { SyncStatus } from './workspace';

export interface SyncFileChanges {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface SyncSideState {
  revision: string;
  contentHash: string;
  changedFromBase: boolean;
  changes: SyncFileChanges;
}

export interface GithubSyncConnectionResult {
  connected: boolean;
  repository?: string;
  defaultBranch?: string;
  updatedAt?: string;
}

export interface SyncStatusResult extends GithubSyncConnectionResult {
  status: SyncStatus;
  local: SyncSideState;
  remote?: SyncSideState;
  base?: {
    workspaceRevision: string;
    remoteRevision: string;
    contentHash: string;
  };
  sameContent: boolean;
  canPush: boolean;
  canPull: boolean;
  requiresResolution: boolean;
}

export interface SyncOperationResult {
  action: 'aligned' | 'noop' | 'pushed' | 'pulled';
  revision: string;
  remoteRevision: string;
  contentHash: string;
  changes: SyncFileChanges;
  warnings?: string[];
}
