import type { SrsCompilerPrivateState } from '../../../shared';
import type {
  CompilerProvisionerFactory,
  CompilerRepositoryConnection,
} from '../ports/compiler-provisioner';
import type { PrivateMetadataStore } from '../ports/private-metadata-store';
import { WorkspaceConflictError } from '../errors/workspace-conflict';

const MAX_METADATA_CAS_ATTEMPTS = 4;

export class SrsCompilerNotConnectedError extends Error {
  constructor() {
    super('A private GitHub repository must be connected before enabling SRS compilation');
    this.name = 'SrsCompilerNotConnectedError';
  }
}

export interface SrsCompilerStatus {
  connected: boolean;
  repository?: string;
  defaultBranch?: string;
  enabled: boolean;
  status: SrsCompilerPrivateState['status'];
  workflowVersion: 1;
  workflowHash?: string;
  errorCode?: string;
  updatedAt?: string;
}

interface SrsCompilerDependencies {
  privateMetadataStore: PrivateMetadataStore;
  provisionerFactory: CompilerProvisionerFactory;
}

function publicStatus(
  github: CompilerRepositoryConnection | undefined,
  state: SrsCompilerPrivateState | undefined,
): SrsCompilerStatus {
  return {
    connected: Boolean(github),
    ...(github ? { repository: `${github.owner}/${github.repo}`, defaultBranch: github.defaultBranch } : {}),
    enabled: state?.enabled === true,
    status: state?.status || 'disabled',
    workflowVersion: 1,
    ...(state?.workflowHash ? { workflowHash: state.workflowHash } : {}),
    ...(state?.errorCode ? { errorCode: state.errorCode } : {}),
    ...(state?.updatedAt ? { updatedAt: state.updatedAt } : {}),
  };
}

function provisioningErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error &&
      typeof error.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code)) {
    return error.code;
  }
  return 'PROVISION_FAILED';
}

function sameConnection(
  left: CompilerRepositoryConnection | undefined,
  right: CompilerRepositoryConnection,
): boolean {
  return Boolean(left && left.owner === right.owner && left.repo === right.repo &&
    left.defaultBranch === right.defaultBranch && left.pat === right.pat);
}

export async function readSrsCompilerStatus(
  store: PrivateMetadataStore,
  workspaceId: string,
): Promise<SrsCompilerStatus> {
  const metadata = await store.read(workspaceId);
  return publicStatus(metadata?.credentials.github, metadata?.credentials.srsCompiler);
}

export async function disableSrsCompiler(
  store: PrivateMetadataStore,
  workspaceId: string,
): Promise<SrsCompilerStatus> {
  const metadata = await store.read(workspaceId);
  if (!metadata) return publicStatus(undefined, undefined);
  const updatedAt = new Date().toISOString();
  const state: SrsCompilerPrivateState = {
    enabled: false,
    status: 'disabled',
    workflowVersion: 1,
    ...(metadata.credentials.srsCompiler?.workflowHash
      ? { workflowHash: metadata.credentials.srsCompiler.workflowHash }
      : {}),
    updatedAt,
  };
  await store.update({ ...metadata.credentials, srsCompiler: state, updatedAt }, metadata.version);
  return publicStatus(metadata.credentials.github, state);
}

export async function recordSrsCompilerDispatchFailure(
  store: PrivateMetadataStore,
  workspaceId: string,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_METADATA_CAS_ATTEMPTS; attempt += 1) {
    const current = await store.read(workspaceId);
    const state = current?.credentials.srsCompiler;
    if (!current || !state?.enabled) return;
    const updatedAt = new Date().toISOString();
    try {
      await store.update({
        ...current.credentials,
        srsCompiler: {
          ...state,
          status: 'error',
          errorCode: 'ACTION_DISPATCH_FAILED',
          updatedAt,
        },
        updatedAt,
      }, current.version);
      return;
    } catch (error) {
      if (!(error instanceof WorkspaceConflictError) || attempt === MAX_METADATA_CAS_ATTEMPTS - 1) throw error;
    }
  }
}

export async function enableSrsCompiler(
  dependencies: SrsCompilerDependencies,
  workspaceId: string,
): Promise<SrsCompilerStatus> {
  const metadata = await dependencies.privateMetadataStore.read(workspaceId);
  const github = metadata?.credentials.github;
  if (!metadata || !github) throw new SrsCompilerNotConnectedError();
  const provisioningAt = new Date().toISOString();
  const provisioning: SrsCompilerPrivateState = {
    enabled: true,
    status: 'provisioning',
    workflowVersion: 1,
    ...(metadata.credentials.srsCompiler?.workflowHash
      ? { workflowHash: metadata.credentials.srsCompiler.workflowHash }
      : {}),
    updatedAt: provisioningAt,
  };
  const stagedVersion = await dependencies.privateMetadataStore.update({
    ...metadata.credentials,
    srsCompiler: provisioning,
    updatedAt: provisioningAt,
  }, metadata.version);

  try {
    const result = await dependencies.provisionerFactory.create(github).provision();
    const readyAt = new Date().toISOString();
    const ready: SrsCompilerPrivateState = {
      enabled: true,
      status: 'ready',
      workflowVersion: 1,
      workflowHash: result.workflowHash,
      updatedAt: readyAt,
    };
    await dependencies.privateMetadataStore.update({
      ...metadata.credentials,
      srsCompiler: ready,
      updatedAt: readyAt,
    }, stagedVersion);
    return publicStatus(github, ready);
  } catch (error) {
    const current = await dependencies.privateMetadataStore.read(workspaceId);
    if (current && sameConnection(current.credentials.github, github) &&
        current.credentials.srsCompiler?.status === 'provisioning') {
      const failedAt = new Date().toISOString();
      await dependencies.privateMetadataStore.update({
        ...current.credentials,
        srsCompiler: {
          enabled: true,
          status: 'error',
          workflowVersion: 1,
          ...(current.credentials.srsCompiler.workflowHash
            ? { workflowHash: current.credentials.srsCompiler.workflowHash }
            : {}),
          errorCode: provisioningErrorCode(error),
          updatedAt: failedAt,
        },
        updatedAt: failedAt,
      }, current.version);
    }
    throw error;
  }
}
