import type { SyncFileChanges, SyncStatus, SyncMetadata } from '../../../shared';
import type { SyncFile } from '../../application/ports/sync-gateway';

export interface SyncTreeState {
  revision: string;
  contentHash: string;
  files: SyncFile[];
}

export interface SyncBaseState extends SyncTreeState {
  remoteRevision: string;
}

export interface SyncAnalysis {
  status: SyncStatus;
  sameContent: boolean;
  localChanged: boolean;
  remoteChanged: boolean;
  canPush: boolean;
  canPull: boolean;
  requiresResolution: boolean;
  localChanges: SyncFileChanges;
  remoteChanges: SyncFileChanges;
}

function fileMap(files: SyncFile[]): Map<string, string> {
  return new Map(files.map(file => [file.path, file.contentHash]));
}

export function diffSyncFiles(baseFiles: SyncFile[], currentFiles: SyncFile[]): SyncFileChanges {
  const base = fileMap(baseFiles);
  const current = fileMap(currentFiles);
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];
  for (const [path, hash] of current) {
    if (!base.has(path)) added.push(path);
    else if (base.get(path) !== hash) modified.push(path);
  }
  for (const path of base.keys()) {
    if (!current.has(path)) deleted.push(path);
  }
  return {
    added: added.sort(),
    modified: modified.sort(),
    deleted: deleted.sort(),
  };
}

export function analyzeSyncState(
  base: SyncBaseState | null,
  local: SyncTreeState,
  remote: SyncTreeState,
): SyncAnalysis {
  const sameContent = local.contentHash === remote.contentHash;
  const localChanged = base ? local.contentHash !== base.contentHash : local.files.length > 0;
  const remoteChanged = base ? remote.contentHash !== base.contentHash : remote.files.length > 0;
  let status: SyncStatus;
  if (!base) status = 'never';
  else if (sameContent) status = 'synced';
  else if (localChanged && !remoteChanged) status = 'local-ahead';
  else if (!localChanged && remoteChanged) status = 'remote-ahead';
  else status = 'conflict';
  return {
    status,
    sameContent,
    localChanged,
    remoteChanged,
    canPush: sameContent || Boolean(base && !remoteChanged),
    canPull: sameContent || Boolean(base && !localChanged),
    requiresResolution: !sameContent && (!base || (localChanged && remoteChanged)),
    localChanges: diffSyncFiles(base?.files || [], local.files),
    remoteChanges: diffSyncFiles(base?.files || [], remote.files),
  };
}

export function markSyncLocalChange(sync: SyncMetadata, updatedAt: string): SyncMetadata {
  if (!sync.baseContentHash) return sync;
  return { ...sync, status: 'local-ahead', updatedAt };
}
