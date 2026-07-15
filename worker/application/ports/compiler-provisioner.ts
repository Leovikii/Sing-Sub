export interface CompilerProvisionResult {
  repository: string;
  defaultBranch: string;
  workflowHash: string;
  action: 'installed' | 'upgraded' | 'unchanged';
}

export interface CompilerProvisioner {
  provision(): Promise<CompilerProvisionResult>;
}

export interface CompilerRepositoryConnection {
  owner: string;
  repo: string;
  pat: string;
  defaultBranch: string;
}

export interface CompilerProvisionerFactory {
  create(connection: CompilerRepositoryConnection): CompilerProvisioner;
}
