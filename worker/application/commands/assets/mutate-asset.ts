import { jsonAssetSchema, type JsonAsset, type WorkspaceSnapshot } from '../../../../shared';
import { parseManagedAssetPath } from '../../../domain/assets/managed-asset-path';
import { executeWorkspaceCommand } from '../execute-workspace-command';
import { AssetAlreadyExistsError, AssetNotFoundError } from '../../errors/asset-errors';
import type { WorkspaceStore } from '../../ports/workspace-store';
import { markSyncLocalChange } from '../../../domain/sync/sync-state';

interface AssetMutationBase {
  workspaceId: string;
  expectedRevision: string;
  revisionId: string;
  createdAt: string;
}

export interface SaveAssetCommand extends AssetMutationBase {
  path: string;
  oldPath?: string;
  asset: JsonAsset;
}

export interface DeleteAssetCommand extends AssetMutationBase {
  path: string;
}

export function saveAsset(store: WorkspaceStore<WorkspaceSnapshot>, command: SaveAssetCommand) {
  const target = parseManagedAssetPath(command.path);
  const source = command.oldPath ? parseManagedAssetPath(command.oldPath) : target;
  if (!target || !source || target.kind !== source.kind) throw new Error('Invalid asset path');
  const asset = jsonAssetSchema.parse({ ...command.asset, path: command.path, updatedAt: command.createdAt });
  return executeWorkspaceCommand(store, {
    workspaceId: command.workspaceId,
    expectedRevision: command.expectedRevision,
    update: snapshot => {
      const collection = snapshot.assets[target.kind];
      const isRename = command.oldPath && command.oldPath !== command.path;
      if (isRename && !snapshot.assets[source.kind][source.entityId]) throw new AssetNotFoundError(command.oldPath!);
      if (isRename && collection[target.entityId]) throw new AssetAlreadyExistsError(command.path);
      if (isRename) delete snapshot.assets[source.kind][source.entityId];
      collection[target.entityId] = asset;
      return {
        ...snapshot,
        revisionId: command.revisionId,
        previousRevisionId: command.expectedRevision,
        createdAt: command.createdAt,
        sync: markSyncLocalChange(snapshot.sync, command.createdAt),
      };
    },
  });
}

export function deleteAsset(store: WorkspaceStore<WorkspaceSnapshot>, command: DeleteAssetCommand) {
  const target = parseManagedAssetPath(command.path);
  if (!target) throw new Error('Invalid asset path');
  return executeWorkspaceCommand(store, {
    workspaceId: command.workspaceId,
    expectedRevision: command.expectedRevision,
    update: snapshot => {
      if (!snapshot.assets[target.kind][target.entityId]) throw new AssetNotFoundError(command.path);
      delete snapshot.assets[target.kind][target.entityId];
      if (target.kind === 'rulesets') delete snapshot.builds[target.entityId];
      return {
        ...snapshot,
        revisionId: command.revisionId,
        previousRevisionId: command.expectedRevision,
        createdAt: command.createdAt,
        sync: markSyncLocalChange(snapshot.sync, command.createdAt),
      };
    },
  });
}
