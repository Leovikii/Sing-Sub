import type { Env } from '../types';
import { GitHubSyncGatewayFactory } from '../infrastructure/github/github-sync-gateway';
import { R2PrivateMetadataStore } from '../infrastructure/r2/r2-private-metadata-store';
import { createPrimaryWorkspaceStore } from './primary-workspace-services';

export function createGithubSyncServices(env: Env) {
  return {
    workspaceStore: createPrimaryWorkspaceStore(env),
    privateMetadataStore: new R2PrivateMetadataStore(env.WORKSPACE_BUCKET),
    gatewayFactory: new GitHubSyncGatewayFactory(),
  };
}
