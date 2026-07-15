import type { Env } from '../types';
import { R2PrivateMetadataStore } from '../infrastructure/r2/r2-private-metadata-store';
import { R2WorkspaceStore } from '../infrastructure/r2/r2-workspace-store';
import { WebCryptoAdminAuthenticator } from '../infrastructure/security/web-crypto-admin-authenticator';
import { WebCryptoAuthTokenService } from '../infrastructure/security/web-crypto-auth-token-service';

export function createPrimaryWorkspaceStore(env: Env) {
  return new R2WorkspaceStore(env.WORKSPACE_BUCKET);
}

export function createPrimaryWorkspaceServices(env: Env) {
  return {
    workspaceStore: createPrimaryWorkspaceStore(env),
    privateMetadataStore: new R2PrivateMetadataStore(env.WORKSPACE_BUCKET),
    adminAuthenticator: new WebCryptoAdminAuthenticator(env.ADMIN_PASSWORD),
    tokenService: new WebCryptoAuthTokenService({
      session: env.SESSION_SIGNING_SECRET,
      subscription: env.SUBSCRIPTION_SIGNING_SECRET,
    }),
  };
}
