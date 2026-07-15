import { describe, expect, it } from 'vitest';
import {
  clearSessionCookieHeader,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  sessionCookieHeader,
} from '../../worker/infrastructure/security/session-cookie';
import { WebCryptoAuthTokenService } from '../../worker/infrastructure/security/web-crypto-auth-token-service';

const secrets = {
  session: 'session-secret-with-at-least-32-bytes',
  subscription: 'subscription-secret-with-at-least-32-bytes',
};
const now = 1_789_400_000;

describe('WebCryptoAuthTokenService', () => {
  it('roundtrips a signed session token', async () => {
    const service = new WebCryptoAuthTokenService(secrets, () => now);
    const claims = { workspaceId: 'workspace-1', authVersion: 3, expiresAt: now + 900 };
    const token = await service.issueSession(claims);

    await expect(service.verifySession(token, 3)).resolves.toEqual(claims);
  });

  it('rejects tampered, expired, and auth-version-invalidated sessions', async () => {
    const service = new WebCryptoAuthTokenService(secrets, () => now);
    const token = await service.issueSession({ workspaceId: 'workspace-1', authVersion: 3, expiresAt: now + 900 });
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

    await expect(service.verifySession(tampered, 3)).resolves.toBeNull();
    await expect(service.verifySession(token, 4)).resolves.toBeNull();
    const expiredService = new WebCryptoAuthTokenService(secrets, () => now + 901);
    await expect(expiredService.verifySession(token, 3)).resolves.toBeNull();
  });

  it('roundtrips a subscription token and enforces token version', async () => {
    const service = new WebCryptoAuthTokenService(secrets, () => now);
    const claims = { workspaceId: 'workspace-1', tokenVersion: 2, purpose: 'subscription' as const };
    const token = await service.issueSubscription(claims);

    await expect(service.verifySubscription(token, 2)).resolves.toEqual(claims);
    await expect(service.verifySubscription(token, 3)).resolves.toBeNull();
  });

  it('uses separate signing domains for sessions and subscriptions', async () => {
    const service = new WebCryptoAuthTokenService(secrets, () => now);
    const token = await service.issueSubscription({
      workspaceId: 'workspace-1',
      tokenVersion: 2,
      purpose: 'subscription',
    });

    await expect(service.verifySession(token, 2)).resolves.toBeNull();
  });

  it('rejects malformed tokens without throwing', async () => {
    const service = new WebCryptoAuthTokenService(secrets, () => now);

    await expect(service.verifySession('not-a-token', 1)).resolves.toBeNull();
    await expect(service.verifySubscription('v1.bad.signature', 1)).resolves.toBeNull();
  });

  it('requires at least 32 bytes of secret material', () => {
    expect(() => new WebCryptoAuthTokenService({ session: 'short', subscription: secrets.subscription }))
      .toThrow('at least 32 bytes');
  });
});

describe('session cookie', () => {
  it('writes and reads a host-scoped secure cookie', () => {
    const header = sessionCookieHeader('v1.payload.signature', 900);
    expect(header).toContain(`${SESSION_COOKIE_NAME}=v1.payload.signature`);
    expect(header).toContain('HttpOnly; Secure; SameSite=Lax');

    const request = new Request('https://example.com', {
      headers: { Cookie: `theme=dark; ${SESSION_COOKIE_NAME}=v1.payload.signature` },
    });
    expect(readSessionCookie(request)).toBe('v1.payload.signature');
  });

  it('clears the same cookie scope', () => {
    expect(clearSessionCookieHeader()).toBe(
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    );
  });
});
