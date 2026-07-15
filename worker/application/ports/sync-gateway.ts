export interface SyncFile {
  path: string;
  content: string;
  contentHash: string;
}

export interface SyncDownload {
  remoteRevision: string;
  files: SyncFile[];
  manifestContent?: string;
}

export interface SyncPushCommand {
  expectedRemoteRevision: string | null;
  message: string;
  files: SyncFile[];
}

export interface SyncGateway {
  download(): Promise<SyncDownload>;
  push(command: SyncPushCommand): Promise<{ remoteRevision: string }>;
}

export interface SyncRepositoryConnection {
  owner: string;
  repo: string;
  pat: string;
  defaultBranch: string;
}

export interface SyncRepositoryInfo {
  repository: string;
  defaultBranch: string;
}

export interface SyncGatewayFactory {
  connect(input: Omit<SyncRepositoryConnection, 'defaultBranch'>): Promise<SyncRepositoryConnection>;
  create(connection: SyncRepositoryConnection): SyncGateway;
}
