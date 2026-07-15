import { describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '../../shared';
import {
  authenticatePrimarySession,
  loginPrimaryWorkspace,
} from '../../worker/application/auth/primary-workspace-auth';
import { InMemoryWorkspaceStore } from '../fakes/in-memory-workspace-store';
import { WebCryptoAdminAuthenticator } from '../../worker/infrastructure/security/web-crypto-admin-authenticator';
import { WebCryptoAuthTokenService } from '../../worker/infrastructure/security/web-crypto-auth-token-service';

const now = 1_789_400_000;
const secrets = {
  session: 'session-secret-with-at-least-32-bytes',
  subscription: 'subscription-secret-with-at-least-32-bytes',
};
const snapshot = {
  settings: { authVersion: 2 },
} as WorkspaceSnapshot;

async function dependencies() {
  const workspaceStore = new InMemoryWorkspaceStore<WorkspaceSnapshot>('primary', snapshot);
  return {
    workspaceStore,
    tokenService: new WebCryptoAuthTokenService(secrets, () => now),
    adminAuthenticator: new WebCryptoAdminAuthenticator('correct-password'),
  };
}

describe('primary workspace authentication', () => {
  it('issues and verifies a session for the fixed primary workspace', async () => {
    const deps = await dependencies();
    const login = await loginPrimaryWorkspace('correct-password', now + 900, deps);

    expect(login).toMatchObject({ workspace: { workspaceId: 'primary', revision: 'revision-1' } });
    await expect(authenticatePrimarySession(login!.token, deps)).resolves.toMatchObject({
      workspaceId: 'primary',
      revision: 'revision-1',
    });
  });

  it('rejects an incorrect administrator password', async () => {
    await expect(loginPrimaryWorkspace('wrong-password', now + 900, await dependencies()))
      .resolves.toBeNull();
  });

  it('invalidates existing sessions when authVersion changes', async () => {
    const deps = await dependencies();
    const login = await loginPrimaryWorkspace('correct-password', now + 900, deps);
    const current = await deps.workspaceStore.read('primary');
    await deps.workspaceStore.publish({
      workspaceId: 'primary',
      expectedRevision: current.revision,
      snapshot: { ...snapshot, settings: { authVersion: 3 } } as WorkspaceSnapshot,
    });

    await expect(authenticatePrimarySession(login!.token, deps)).resolves.toBeNull();
  });
});
