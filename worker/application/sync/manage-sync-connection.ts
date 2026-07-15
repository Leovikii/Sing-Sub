import {
  privateCredentialsSchema,
  type GithubSyncConnectionRequest,
  type GithubSyncConnectionResult,
  type PrivateCredentials,
} from '../../../shared';
import { WorkspaceConflictError } from '../errors/workspace-conflict';
import type { PrivateMetadataStore } from '../ports/private-metadata-store';
import type { SyncGatewayFactory, SyncRepositoryConnection } from '../ports/sync-gateway';

const MAX_CAS_ATTEMPTS = 4;

function publicConnection(
  connection: SyncRepositoryConnection | undefined,
  updatedAt?: string,
): GithubSyncConnectionResult {
  return connection ? {
    connected: true,
    repository: `${connection.owner}/${connection.repo}`,
    defaultBranch: connection.defaultBranch,
    updatedAt,
  } : { connected: false, updatedAt };
}

function sameRepository(
  current: PrivateCredentials['github'],
  next: SyncRepositoryConnection,
): boolean {
  return Boolean(current && current.owner.toLowerCase() === next.owner.toLowerCase() &&
    current.repo.toLowerCase() === next.repo.toLowerCase() &&
    current.defaultBranch === next.defaultBranch);
}

export async function readGithubSyncConnection(
  store: PrivateMetadataStore,
  workspaceId: string,
): Promise<{ connection?: SyncRepositoryConnection; public: GithubSyncConnectionResult }> {
  const metadata = await store.read(workspaceId);
  const connection = metadata?.credentials.github;
  return {
    ...(connection ? { connection } : {}),
    public: publicConnection(connection, metadata?.credentials.updatedAt),
  };
}

export async function connectGithubSync(
  store: PrivateMetadataStore,
  factory: SyncGatewayFactory,
  workspaceId: string,
  request: GithubSyncConnectionRequest,
): Promise<GithubSyncConnectionResult> {
  const connection = await factory.connect(request);
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await store.read(workspaceId);
    const updatedAt = new Date().toISOString();
    const preserveCompiler = sameRepository(current?.credentials.github, connection);
    const next = privateCredentialsSchema.parse({
      schemaVersion: 1,
      workspaceId,
      github: connection,
      ...(preserveCompiler && current?.credentials.srsCompiler
        ? { srsCompiler: current.credentials.srsCompiler }
        : current?.credentials.srsCompiler
          ? {
              srsCompiler: {
                enabled: false,
                status: 'disabled',
                workflowVersion: 1,
                updatedAt,
              },
            }
          : {}),
      updatedAt,
    });
    try {
      if (current) await store.update(next, current.version);
      else await store.create(next);
      return publicConnection(connection, updatedAt);
    } catch (error) {
      if (!(error instanceof WorkspaceConflictError) || attempt === MAX_CAS_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error('GitHub sync connection update failed');
}

export async function disconnectGithubSync(
  store: PrivateMetadataStore,
  workspaceId: string,
): Promise<GithubSyncConnectionResult> {
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await store.read(workspaceId);
    if (!current) return { connected: false };
    const updatedAt = new Date().toISOString();
    const next = privateCredentialsSchema.parse({
      ...current.credentials,
      github: undefined,
      ...(current.credentials.srsCompiler ? {
        srsCompiler: {
          enabled: false,
          status: 'disabled',
          workflowVersion: 1,
          updatedAt,
        },
      } : {}),
      updatedAt,
    });
    try {
      await store.update(next, current.version);
      return { connected: false, updatedAt };
    } catch (error) {
      if (!(error instanceof WorkspaceConflictError) || attempt === MAX_CAS_ATTEMPTS - 1) throw error;
    }
  }
  throw new Error('GitHub sync disconnect failed');
}
