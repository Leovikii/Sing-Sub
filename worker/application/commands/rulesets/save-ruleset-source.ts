import {
  jsonAssetSchema,
  type BuildJob,
  type BuildSummary,
  type JsonAsset,
  type WorkspaceSnapshot,
} from '../../../../shared';
import { parseManagedAssetPath } from '../../../domain/assets/managed-asset-path';
import {
  createCompilerSource,
  createSrsJobId,
  SRS_COMPILER_VERSION,
} from '../../../domain/rulesets/compiler-source';
import { executeWorkspaceCommand } from '../execute-workspace-command';
import { AssetAlreadyExistsError, AssetNotFoundError } from '../../errors/asset-errors';
import { WorkspaceConflictError } from '../../errors/workspace-conflict';
import type { BuildJobStore } from '../../ports/build-job-store';
import type { PublishWorkspaceResult, WorkspaceStore } from '../../ports/workspace-store';
import { markSyncLocalChange } from '../../../domain/sync/sync-state';

export interface SaveRulesetSourceCommand {
  workspaceId: string;
  expectedRevision: string;
  revisionId: string;
  createdAt: string;
  path: string;
  oldPath?: string;
  asset: JsonAsset;
  compilerEnabled: boolean;
}

export interface SaveRulesetSourceResult extends PublishWorkspaceResult {
  job?: BuildJob;
  build: BuildSummary;
}

export async function saveRulesetSource(
  workspaceStore: WorkspaceStore<WorkspaceSnapshot>,
  jobStore: BuildJobStore,
  command: SaveRulesetSourceCommand,
): Promise<SaveRulesetSourceResult> {
  const target = parseManagedAssetPath(command.path);
  const source = command.oldPath ? parseManagedAssetPath(command.oldPath) : target;
  if (!target || !source || target.kind !== 'rulesets' || source.kind !== 'rulesets') {
    throw new Error('Invalid ruleset path');
  }
  const asset = jsonAssetSchema.parse({
    ...command.asset,
    path: command.path,
    updatedAt: command.createdAt,
  });
  const compilerSource = await createCompilerSource(asset.content);
  const jobId = await createSrsJobId({
    workspaceId: command.workspaceId,
    rulesetId: target.entityId,
    sourceRevision: command.revisionId,
    sourceHash: compilerSource.sourceHash,
    compilerVersion: SRS_COMPILER_VERSION,
  });
  const current = await workspaceStore.read(command.workspaceId);
  if (current.revision !== command.expectedRevision) {
    throw new WorkspaceConflictError(command.expectedRevision, current.revision);
  }
  const previousBuild = current.snapshot.builds[source.entityId];
  const isRename = source.entityId !== target.entityId;
  const build: BuildSummary = {
    jobId,
    rulesetId: target.entityId,
    sourceHash: compilerSource.sourceHash,
    compilerVersion: SRS_COMPILER_VERSION,
    status: command.compilerEnabled ? 'pending' : 'none',
    ...(!isRename && previousBuild?.activeArtifact
      ? { activeArtifact: previousBuild.activeArtifact }
      : {}),
    updatedAt: command.createdAt,
  };
  const job: BuildJob | undefined = command.compilerEnabled ? {
    schemaVersion: 1,
    jobId,
    workspaceId: command.workspaceId,
    rulesetId: target.entityId,
    sourceRevision: command.revisionId,
    sourceHash: compilerSource.sourceHash,
    compilerVersion: SRS_COMPILER_VERSION,
    status: 'pending',
    attempts: 0,
    createdAt: command.createdAt,
    updatedAt: command.createdAt,
  } : undefined;

  if (job) await jobStore.create(job);

  const published = await executeWorkspaceCommand(workspaceStore, {
    workspaceId: command.workspaceId,
    expectedRevision: command.expectedRevision,
    update: snapshot => {
      const collection = snapshot.assets.rulesets;
      if (command.oldPath && isRename && !collection[source.entityId]) {
        throw new AssetNotFoundError(command.oldPath);
      }
      if (command.oldPath && isRename && collection[target.entityId]) {
        throw new AssetAlreadyExistsError(command.path);
      }
      if (isRename) {
        delete collection[source.entityId];
        delete snapshot.builds[source.entityId];
      }
      collection[target.entityId] = asset;
      snapshot.builds[target.entityId] = build;
      return {
        ...snapshot,
        revisionId: command.revisionId,
        previousRevisionId: command.expectedRevision,
        createdAt: command.createdAt,
        sync: markSyncLocalChange(snapshot.sync, command.createdAt),
      };
    },
  });
  return { ...published, ...(job ? { job } : {}), build };
}
