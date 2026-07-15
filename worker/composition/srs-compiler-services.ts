import { R2ArtifactStore } from '../infrastructure/r2/r2-artifact-store';
import { R2JobStore } from '../infrastructure/r2/r2-job-store';
import { GitHubActionsCompilerDispatcher } from '../infrastructure/github/github-actions-compiler-dispatcher';
import { R2PrivateMetadataStore } from '../infrastructure/r2/r2-private-metadata-store';
import type { Env } from '../types';
import { WebCryptoSrsJobTicketService } from '../infrastructure/security/web-crypto-srs-job-ticket-service';
import { GitHubCompilerProvisioner } from '../infrastructure/github/github-compiler-provisioner';
import type {
  CompilerProvisionerFactory,
  CompilerRepositoryConnection,
} from '../application/ports/compiler-provisioner';
import { createPrimaryWorkspaceStore } from './primary-workspace-services';

export function createSrsBuildStores(env: Env) {
  return {
    workspaceStore: createPrimaryWorkspaceStore(env),
    jobStore: new R2JobStore(env.WORKSPACE_BUCKET),
    artifactStore: new R2ArtifactStore(env.WORKSPACE_BUCKET),
  };
}

export async function createOptionalCompilerDispatcher(
  env: Env,
  workspaceId: string,
): Promise<GitHubActionsCompilerDispatcher | null> {
  const metadata = await new R2PrivateMetadataStore(env.WORKSPACE_BUCKET).read(workspaceId);
  const github = metadata?.credentials.github;
  if (!github || metadata.credentials.srsCompiler?.enabled !== true ||
      metadata.credentials.srsCompiler.status !== 'ready') return null;
  return new GitHubActionsCompilerDispatcher({
    repository: `${github.owner}/${github.repo}`,
    token: github.pat,
    ref: github.defaultBranch,
  });
}

export function createSrsJobTicketService(env: Env): WebCryptoSrsJobTicketService {
  return new WebCryptoSrsJobTicketService(env.SESSION_SIGNING_SECRET);
}

class GitHubCompilerProvisionerFactory implements CompilerProvisionerFactory {
  create(connection: CompilerRepositoryConnection): GitHubCompilerProvisioner {
    return new GitHubCompilerProvisioner({
      repository: `${connection.owner}/${connection.repo}`,
      token: connection.pat,
      defaultBranch: connection.defaultBranch,
    });
  }
}

export function createSrsCompilerManagementServices(env: Env) {
  return {
    privateMetadataStore: new R2PrivateMetadataStore(env.WORKSPACE_BUCKET),
    provisionerFactory: new GitHubCompilerProvisionerFactory(),
  };
}
