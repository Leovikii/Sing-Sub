import { privateCredentialsSchema, workspaceSnapshotSchema, type WorkspaceSnapshot } from '../../../shared';
import type { NormalizedLegacyWorkspace } from './legacy-migration-model';
import type { PrivateMetadataStore } from '../ports/private-metadata-store';
import type { WorkspaceStore } from '../ports/workspace-store';
import { exportSyncBusinessFiles } from '../sync/export-workspace';

export interface MigrateLegacyWorkspaceCommand {
  workspaceId: string;
  revisionId: string;
  migratedAt: string;
  normalized: NormalizedLegacyWorkspace;
}

export interface MigrateLegacyWorkspaceDependencies {
  workspaceStore: WorkspaceStore<WorkspaceSnapshot>;
  privateMetadataStore: PrivateMetadataStore;
}

export interface MigrateLegacyWorkspaceResult {
  workspaceId: string;
  revision: string;
  previousRevision: null;
}

export class MigrationTargetConflictError extends Error {
  constructor(readonly workspaceId: string) {
    super('Migration target already contains private metadata');
    this.name = 'MigrationTargetConflictError';
  }
}

export class MigrationIncompleteError extends Error {
  constructor(readonly workspaceId: string, options?: ErrorOptions) {
    super('Workspace was created but private metadata could not be created', options);
    this.name = 'MigrationIncompleteError';
  }
}

export async function migrateLegacyWorkspace(
  command: MigrateLegacyWorkspaceCommand,
  dependencies: MigrateLegacyWorkspaceDependencies,
): Promise<MigrateLegacyWorkspaceResult> {
  const { source, settings, profiles, assets } = command.normalized;
  const importedSnapshot = workspaceSnapshotSchema.parse({
    schemaVersion: 1,
    workspaceId: command.workspaceId,
    revisionId: command.revisionId,
    previousRevisionId: null,
    createdAt: command.migratedAt,
    settings: {
      owner: settings.owner,
      repo: settings.repo,
      userLogin: settings.userLogin,
      userAvatar: settings.userAvatar,
      defaultBranch: settings.defaultBranch,
      authVersion: 1,
      tokenVersion: 1,
    },
    profiles,
    assets,
    builds: {},
    sync: { status: 'never' },
    migration: {
      source: 'github-import',
      owner: source.owner,
      repo: source.repo,
      branch: source.branch,
      commitSha: source.commitSha,
      migratedAt: command.migratedAt,
    },
  });
  const importedBusiness = await exportSyncBusinessFiles(importedSnapshot);
  const snapshot = workspaceSnapshotSchema.parse({
    ...importedSnapshot,
    sync: {
      status: 'synced',
      baseWorkspaceRevision: command.revisionId,
      baseRemoteRevision: source.commitSha,
      baseContentHash: importedBusiness.contentHash,
      baseRepository: `${source.owner}/${source.repo}`,
      updatedAt: command.migratedAt,
    },
  });
  const credentials = privateCredentialsSchema.parse({
    schemaVersion: 1,
    workspaceId: command.workspaceId,
    github: {
      pat: settings.pat,
      owner: settings.owner,
      repo: settings.repo,
      defaultBranch: settings.defaultBranch,
    },
    updatedAt: command.migratedAt,
  });

  if (await dependencies.privateMetadataStore.read(command.workspaceId)) {
    throw new MigrationTargetConflictError(command.workspaceId);
  }
  const created = await dependencies.workspaceStore.create({ workspaceId: command.workspaceId, snapshot });
  try {
    await dependencies.privateMetadataStore.create(credentials);
  } catch (error) {
    throw new MigrationIncompleteError(command.workspaceId, { cause: error });
  }
  return {
    workspaceId: command.workspaceId,
    revision: created.revision,
    previousRevision: null,
  };
}
