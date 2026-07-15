import {
  type SyncOperationResult,
  type SyncStatus,
  type SyncStatusResult,
  type WorkspaceSnapshot,
} from '../../../shared';
import { WorkspaceConflictError } from '../errors/workspace-conflict';
import type { SyncGateway, SyncRepositoryConnection } from '../ports/sync-gateway';
import type { WorkspaceRead, WorkspaceStore } from '../ports/workspace-store';
import {
  analyzeSyncState,
  diffSyncFiles,
  type SyncBaseState,
  type SyncTreeState,
} from '../../domain/sync/sync-state';
import {
  createCompilerSource,
  createSrsJobId,
  SRS_COMPILER_VERSION,
} from '../../domain/rulesets/compiler-source';
import { exportSyncBusinessFiles, exportWorkspaceForSync, hashSyncFiles } from './export-workspace';
import {
  importSyncTree,
  SyncTreeValidationError,
  type ImportedSyncTree,
} from './import-sync-tree';

const MAX_BASE_RECORD_ATTEMPTS = 4;

export class SyncConflictError extends Error {
  constructor(
    readonly status: SyncStatus,
    readonly direction: 'push' | 'pull',
  ) {
    super('GitHub sync requires an explicit overwrite decision');
    this.name = 'SyncConflictError';
  }
}

export class SyncBaseInvalidError extends Error {
  constructor() {
    super('Stored GitHub sync base does not match its retained workspace revision');
    this.name = 'SyncBaseInvalidError';
  }
}

interface SyncWorkspaceDependencies {
  workspaceStore: WorkspaceStore<WorkspaceSnapshot>;
  gateway: SyncGateway;
  connection: SyncRepositoryConnection;
}

interface LoadedSyncContext {
  current: WorkspaceRead<WorkspaceSnapshot>;
  local: SyncTreeState;
  remote: SyncTreeState;
  importedRemote: ImportedSyncTree;
  base: SyncBaseState | null;
  analysis: ReturnType<typeof analyzeSyncState>;
}

class InvalidRemoteSyncTreeError extends Error {
  constructor(
    readonly current: WorkspaceRead<WorkspaceSnapshot>,
    readonly local: SyncTreeState,
    readonly remote: SyncTreeState,
    readonly validation: SyncTreeValidationError,
  ) {
    super('GitHub sync tree is invalid');
    this.name = 'InvalidRemoteSyncTreeError';
  }
}

function repositoryName(connection: SyncRepositoryConnection): string {
  return `${connection.owner}/${connection.repo}`;
}

async function loadSyncContext(
  dependencies: SyncWorkspaceDependencies,
  workspaceId: string,
): Promise<LoadedSyncContext> {
  const current = await dependencies.workspaceStore.read(workspaceId);
  const [localBusiness, download] = await Promise.all([
    exportSyncBusinessFiles(current.snapshot),
    dependencies.gateway.download(),
  ]);
  const local: SyncTreeState = {
    revision: current.revision,
    contentHash: localBusiness.contentHash,
    files: localBusiness.files,
  };
  let importedRemote: ImportedSyncTree;
  try {
    importedRemote = await importSyncTree(download.files);
  } catch (error) {
    if (!(error instanceof SyncTreeValidationError)) throw error;
    throw new InvalidRemoteSyncTreeError(current, local, {
      revision: download.remoteRevision,
      contentHash: await hashSyncFiles(download.files),
      files: download.files,
    }, error);
  }
  const remote: SyncTreeState = {
    revision: download.remoteRevision,
    contentHash: importedRemote.contentHash,
    files: importedRemote.files,
  };
  const sync = current.snapshot.sync;
  const expectedRepository = repositoryName(dependencies.connection).toLowerCase();
  let base: SyncBaseState | null = null;
  if (sync.baseWorkspaceRevision && sync.baseRemoteRevision && sync.baseContentHash &&
      sync.baseRepository?.toLowerCase() === expectedRepository) {
    const baseSnapshot = await dependencies.workspaceStore.readRevision(workspaceId, sync.baseWorkspaceRevision);
    const baseBusiness = await exportSyncBusinessFiles(baseSnapshot);
    if (baseBusiness.contentHash !== sync.baseContentHash) throw new SyncBaseInvalidError();
    base = {
      revision: sync.baseWorkspaceRevision,
      remoteRevision: sync.baseRemoteRevision,
      contentHash: sync.baseContentHash,
      files: baseBusiness.files,
    };
  }
  return {
    current,
    local,
    remote,
    importedRemote,
    base,
    analysis: analyzeSyncState(base, local, remote),
  };
}

export async function getWorkspaceSyncStatus(
  dependencies: SyncWorkspaceDependencies,
  workspaceId: string,
): Promise<SyncStatusResult> {
  let context: LoadedSyncContext;
  try {
    context = await loadSyncContext(dependencies, workspaceId);
  } catch (error) {
    if (!(error instanceof InvalidRemoteSyncTreeError)) throw error;
    return {
      connected: true,
      repository: repositoryName(dependencies.connection),
      defaultBranch: dependencies.connection.defaultBranch,
      status: 'conflict',
      local: {
        revision: error.local.revision,
        contentHash: error.local.contentHash,
        changedFromBase: true,
        changes: diffSyncFiles([], error.local.files),
      },
      remote: {
        revision: error.remote.revision,
        contentHash: error.remote.contentHash,
        changedFromBase: true,
        changes: diffSyncFiles([], error.remote.files),
      },
      sameContent: false,
      canPush: false,
      canPull: false,
      requiresResolution: true,
    };
  }
  const { analysis, base, local, remote } = context;
  return {
    connected: true,
    repository: repositoryName(dependencies.connection),
    defaultBranch: dependencies.connection.defaultBranch,
    status: analysis.status,
    local: {
      revision: local.revision,
      contentHash: local.contentHash,
      changedFromBase: analysis.localChanged,
      changes: analysis.localChanges,
    },
    remote: {
      revision: remote.revision,
      contentHash: remote.contentHash,
      changedFromBase: analysis.remoteChanged,
      changes: analysis.remoteChanges,
    },
    ...(base ? {
      base: {
        workspaceRevision: base.revision,
        remoteRevision: base.remoteRevision,
        contentHash: base.contentHash,
      },
    } : {}),
    sameContent: analysis.sameContent,
    canPush: analysis.canPush,
    canPull: analysis.canPull,
    requiresResolution: analysis.requiresResolution,
  };
}

export async function getDisconnectedWorkspaceSyncStatus(
  workspaceStore: WorkspaceStore<WorkspaceSnapshot>,
  current: WorkspaceRead<WorkspaceSnapshot>,
): Promise<SyncStatusResult> {
  const localBusiness = await exportSyncBusinessFiles(current.snapshot);
  let baseFiles = [] as typeof localBusiness.files;
  let changedFromBase = localBusiness.files.length > 0;
  const sync = current.snapshot.sync;
  if (sync.baseWorkspaceRevision && sync.baseContentHash) {
    const baseSnapshot = await workspaceStore.readRevision(current.workspaceId, sync.baseWorkspaceRevision);
    const baseBusiness = await exportSyncBusinessFiles(baseSnapshot);
    if (baseBusiness.contentHash === sync.baseContentHash) {
      baseFiles = baseBusiness.files;
      changedFromBase = localBusiness.contentHash !== sync.baseContentHash;
    }
  }
  return {
    connected: false,
    status: 'never',
    local: {
      revision: current.revision,
      contentHash: localBusiness.contentHash,
      changedFromBase,
      changes: diffSyncFiles(baseFiles, localBusiness.files),
    },
    sameContent: false,
    canPush: false,
    canPull: false,
    requiresResolution: false,
  };
}

function syncedMetadata(
  connection: SyncRepositoryConnection,
  baseWorkspaceRevision: string,
  baseRemoteRevision: string,
  baseContentHash: string,
  updatedAt: string,
  status: 'synced' | 'local-ahead' = 'synced',
): WorkspaceSnapshot['sync'] {
  return {
    status,
    baseWorkspaceRevision,
    baseRemoteRevision,
    baseContentHash,
    baseRepository: repositoryName(connection),
    updatedAt,
  };
}

async function publishAlignedBase(
  dependencies: SyncWorkspaceDependencies,
  current: WorkspaceRead<WorkspaceSnapshot>,
  remoteRevision: string,
  contentHash: string,
): Promise<string> {
  const createdAt = new Date().toISOString();
  const revisionId = crypto.randomUUID();
  const result = await dependencies.workspaceStore.publish({
    workspaceId: current.workspaceId,
    expectedRevision: current.revision,
    snapshot: {
      ...current.snapshot,
      revisionId,
      previousRevisionId: current.revision,
      createdAt,
      sync: syncedMetadata(
        dependencies.connection,
        current.revision,
        remoteRevision,
        contentHash,
        createdAt,
      ),
    },
  });
  return result.revision;
}

async function recordPushedBase(
  dependencies: SyncWorkspaceDependencies,
  workspaceId: string,
  baseWorkspaceRevision: string,
  remoteRevision: string,
  contentHash: string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_BASE_RECORD_ATTEMPTS; attempt += 1) {
    const latest = await dependencies.workspaceStore.read(workspaceId);
    const latestBusiness = await exportSyncBusinessFiles(latest.snapshot);
    const createdAt = new Date().toISOString();
    const revisionId = crypto.randomUUID();
    try {
      const result = await dependencies.workspaceStore.publish({
        workspaceId,
        expectedRevision: latest.revision,
        snapshot: {
          ...latest.snapshot,
          revisionId,
          previousRevisionId: latest.revision,
          createdAt,
          sync: syncedMetadata(
            dependencies.connection,
            baseWorkspaceRevision,
            remoteRevision,
            contentHash,
            createdAt,
            latestBusiness.contentHash === contentHash ? 'synced' : 'local-ahead',
          ),
        },
      });
      return result.revision;
    } catch (error) {
      if (!(error instanceof WorkspaceConflictError) || attempt === MAX_BASE_RECORD_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error('GitHub push base could not be recorded');
}

export async function pushWorkspaceToGithub(
  dependencies: SyncWorkspaceDependencies,
  command: { workspaceId: string; expectedRevision: string; overwrite: boolean },
): Promise<SyncOperationResult> {
  let context: LoadedSyncContext;
  try {
    context = await loadSyncContext(dependencies, command.workspaceId);
  } catch (error) {
    if (!(error instanceof InvalidRemoteSyncTreeError)) throw error;
    if (error.current.revision !== command.expectedRevision) {
      throw new WorkspaceConflictError(command.expectedRevision, error.current.revision);
    }
    if (!command.overwrite) throw new SyncConflictError('conflict', 'push');
    const exportedAt = new Date().toISOString();
    const exported = await exportWorkspaceForSync(error.current.snapshot, {
      baseRemoteRevision: error.remote.revision,
      exportedAt,
    });
    const pushed = await dependencies.gateway.push({
      expectedRemoteRevision: error.remote.revision,
      message: `chore: sync Sing-Sub workspace ${exportedAt}`,
      files: exported.files,
    });
    const revision = await recordPushedBase(
      dependencies,
      command.workspaceId,
      error.current.revision,
      pushed.remoteRevision,
      exported.contentHash,
    );
    return {
      action: 'pushed',
      revision,
      remoteRevision: pushed.remoteRevision,
      contentHash: exported.contentHash,
      changes: diffSyncFiles(error.remote.files, error.local.files),
    };
  }
  if (context.current.revision !== command.expectedRevision) {
    throw new WorkspaceConflictError(command.expectedRevision, context.current.revision);
  }
  if (context.analysis.sameContent) {
    if (context.base?.remoteRevision === context.remote.revision &&
        context.base.contentHash === context.local.contentHash) {
      return {
        action: 'noop',
        revision: context.current.revision,
        remoteRevision: context.remote.revision,
        contentHash: context.local.contentHash,
        changes: { added: [], modified: [], deleted: [] },
      };
    }
    const revision = await publishAlignedBase(
      dependencies, context.current, context.remote.revision, context.local.contentHash,
    );
    return {
      action: 'aligned',
      revision,
      remoteRevision: context.remote.revision,
      contentHash: context.local.contentHash,
      changes: { added: [], modified: [], deleted: [] },
    };
  }
  if (!command.overwrite && !context.analysis.canPush) {
    throw new SyncConflictError(context.analysis.status, 'push');
  }
  const exportedAt = new Date().toISOString();
  const exported = await exportWorkspaceForSync(context.current.snapshot, {
    baseRemoteRevision: context.remote.revision,
    exportedAt,
  });
  const pushed = await dependencies.gateway.push({
    expectedRemoteRevision: context.remote.revision,
    message: `chore: sync Sing-Sub workspace ${exportedAt}`,
    files: exported.files,
  });
  const revision = await recordPushedBase(
    dependencies,
    command.workspaceId,
    context.current.revision,
    pushed.remoteRevision,
    exported.contentHash,
  );
  return {
    action: 'pushed',
    revision,
    remoteRevision: pushed.remoteRevision,
    contentHash: exported.contentHash,
    changes: diffSyncFiles(context.remote.files, context.local.files),
  };
}

async function pulledBuilds(
  current: WorkspaceSnapshot,
  imported: ImportedSyncTree,
  revisionId: string,
  createdAt: string,
): Promise<WorkspaceSnapshot['builds']> {
  const builds: WorkspaceSnapshot['builds'] = {};
  for (const [rulesetId, asset] of Object.entries(imported.assets.rulesets)) {
    const source = await createCompilerSource(asset.content);
    const previous = current.builds[rulesetId];
    if (previous?.sourceHash === source.sourceHash) {
      builds[rulesetId] = previous;
      continue;
    }
    builds[rulesetId] = {
      jobId: await createSrsJobId({
        workspaceId: current.workspaceId,
        rulesetId,
        sourceRevision: revisionId,
        sourceHash: source.sourceHash,
        compilerVersion: SRS_COMPILER_VERSION,
      }),
      rulesetId,
      sourceHash: source.sourceHash,
      compilerVersion: SRS_COMPILER_VERSION,
      status: 'none',
      ...(previous?.activeArtifact ? { activeArtifact: previous.activeArtifact } : {}),
      updatedAt: createdAt,
    };
  }
  return builds;
}

export async function pullWorkspaceFromGithub(
  dependencies: SyncWorkspaceDependencies,
  command: { workspaceId: string; expectedRevision: string; overwrite: boolean },
): Promise<SyncOperationResult> {
  let context: LoadedSyncContext;
  try {
    context = await loadSyncContext(dependencies, command.workspaceId);
  } catch (error) {
    if (error instanceof InvalidRemoteSyncTreeError) throw error.validation;
    throw error;
  }
  if (context.current.revision !== command.expectedRevision) {
    throw new WorkspaceConflictError(command.expectedRevision, context.current.revision);
  }
  if (context.analysis.sameContent) {
    if (context.base?.remoteRevision === context.remote.revision &&
        context.base.contentHash === context.remote.contentHash) {
      return {
        action: 'noop',
        revision: context.current.revision,
        remoteRevision: context.remote.revision,
        contentHash: context.remote.contentHash,
        changes: { added: [], modified: [], deleted: [] },
      };
    }
    const revision = await publishAlignedBase(
      dependencies, context.current, context.remote.revision, context.remote.contentHash,
    );
    return {
      action: 'aligned',
      revision,
      remoteRevision: context.remote.revision,
      contentHash: context.remote.contentHash,
      changes: { added: [], modified: [], deleted: [] },
    };
  }
  if (!command.overwrite && !context.analysis.canPull) {
    throw new SyncConflictError(context.analysis.status, 'pull');
  }
  const createdAt = new Date().toISOString();
  const revisionId = crypto.randomUUID();
  const builds = await pulledBuilds(context.current.snapshot, context.importedRemote, revisionId, createdAt);
  const result = await dependencies.workspaceStore.publish({
    workspaceId: command.workspaceId,
    expectedRevision: context.current.revision,
    snapshot: {
      ...context.current.snapshot,
      revisionId,
      previousRevisionId: context.current.revision,
      createdAt,
      profiles: context.importedRemote.profiles,
      assets: context.importedRemote.assets,
      builds,
      sync: syncedMetadata(
        dependencies.connection,
        revisionId,
        context.remote.revision,
        context.remote.contentHash,
        createdAt,
      ),
    },
  });
  return {
    action: 'pulled',
    revision: result.revision,
    remoteRevision: context.remote.revision,
    contentHash: context.remote.contentHash,
    changes: diffSyncFiles(context.local.files, context.remote.files),
  };
}
