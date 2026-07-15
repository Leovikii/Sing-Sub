import type {
  AuthTokenService,
  SessionTokenClaims,
  SubscriptionTokenClaims,
} from '../../application/ports/auth-token-service';
import { canonicalJson } from '../../domain/revisions/canonical-json';

const TOKEN_VERSION = 'v1';
const SUBSCRIPTION_TOKEN_VERSION = 's2';
const SUBSCRIPTION_TOKEN_TAG_BYTES = 16;
const SUBSCRIPTION_TOKEN_PATTERN = /^s2\.([a-zA-Z0-9_-]{22})$/;
const SUBSCRIPTION_TOKEN_DOMAIN = 'sing-sub:subscription-token:v2';
const MINIMUM_SECRET_BYTES = 32;
const MAX_TOKEN_LENGTH = 4096;
const SAFE_WORKSPACE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

export interface AuthTokenSecrets {
  session: string;
  subscription: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return null;
  const padding = (4 - value.length % 4) % 4;
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padding));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

function isExactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value as Record<string, unknown>).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function parseSessionClaims(value: unknown): SessionTokenClaims | null {
  if (!isExactObject(value, ['authVersion', 'expiresAt', 'workspaceId'])) return null;
  const { workspaceId, authVersion, expiresAt } = value;
  if (typeof workspaceId !== 'string' || !SAFE_WORKSPACE_ID.test(workspaceId) ||
      !Number.isSafeInteger(authVersion) || (authVersion as number) < 0 ||
      !Number.isSafeInteger(expiresAt) || (expiresAt as number) <= 0) return null;
  return { workspaceId, authVersion: authVersion as number, expiresAt: expiresAt as number };
}

function parseSubscriptionClaims(value: unknown): SubscriptionTokenClaims | null {
  if (!isExactObject(value, ['purpose', 'tokenVersion', 'workspaceId'])) return null;
  const { workspaceId, tokenVersion, purpose } = value;
  if (typeof workspaceId !== 'string' || !SAFE_WORKSPACE_ID.test(workspaceId) ||
      !Number.isSafeInteger(tokenVersion) || (tokenVersion as number) < 0 ||
      purpose !== 'subscription') return null;
  return { workspaceId, tokenVersion: tokenVersion as number, purpose };
}

export class WebCryptoAuthTokenService implements AuthTokenService {
  private readonly sessionKey: Promise<CryptoKey>;
  private readonly subscriptionKey: Promise<CryptoKey>;

  constructor(
    secrets: AuthTokenSecrets,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    this.sessionKey = this.importSecret(this.validateSecret(secrets.session, 'session'));
    this.subscriptionKey = this.importSecret(this.validateSecret(secrets.subscription, 'subscription'));
  }

  issueSession(claims: SessionTokenClaims): Promise<string> {
    const parsed = parseSessionClaims(claims);
    if (!parsed || parsed.expiresAt <= this.now()) throw new Error('Invalid session token claims');
    return this.sign(parsed, this.sessionKey);
  }

  async verifySession(token: string, expectedAuthVersion: number): Promise<SessionTokenClaims | null> {
    const claims = parseSessionClaims(await this.verify(token, this.sessionKey));
    if (!claims || claims.expiresAt <= this.now() || claims.authVersion !== expectedAuthVersion) return null;
    return claims;
  }

  issueSubscription(claims: SubscriptionTokenClaims): Promise<string> {
    const parsed = parseSubscriptionClaims(claims);
    if (!parsed) throw new Error('Invalid subscription token claims');
    return this.issueShortSubscriptionToken(parsed);
  }

  async verifySubscription(
    token: string,
    expected: SubscriptionTokenClaims,
  ): Promise<SubscriptionTokenClaims | null> {
    const claims = parseSubscriptionClaims(expected);
    const match = SUBSCRIPTION_TOKEN_PATTERN.exec(token);
    if (!claims || !match) return null;
    const actual = fromBase64Url(match[1]);
    if (!actual || actual.byteLength !== SUBSCRIPTION_TOKEN_TAG_BYTES) return null;
    const expectedToken = await this.subscriptionTag(claims);
    return equalBytes(actual, expectedToken) ? claims : null;
  }

  private validateSecret(secret: string, label: string): Uint8Array {
    const bytes = encoder.encode(secret);
    if (bytes.byteLength < MINIMUM_SECRET_BYTES) throw new Error(`${label} HMAC secret must contain at least 32 bytes`);
    return bytes;
  }

  private importSecret(bytes: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  }

  private async sign(claims: SessionTokenClaims | SubscriptionTokenClaims, keyPromise: Promise<CryptoKey>): Promise<string> {
    const payload = toBase64Url(encoder.encode(canonicalJson(claims)));
    const message = `${TOKEN_VERSION}.${payload}`;
    const signature = await crypto.subtle.sign('HMAC', await keyPromise, encoder.encode(message));
    return `${message}.${toBase64Url(new Uint8Array(signature))}`;
  }

  private async issueShortSubscriptionToken(claims: SubscriptionTokenClaims): Promise<string> {
    return `${SUBSCRIPTION_TOKEN_VERSION}.${toBase64Url(await this.subscriptionTag(claims))}`;
  }

  private async subscriptionTag(claims: SubscriptionTokenClaims): Promise<Uint8Array> {
    const message = [
      SUBSCRIPTION_TOKEN_DOMAIN,
      claims.workspaceId,
      claims.tokenVersion,
      claims.purpose,
    ].join(':');
    const signature = await crypto.subtle.sign(
      'HMAC',
      await this.subscriptionKey,
      encoder.encode(message),
    );
    return new Uint8Array(signature).slice(0, SUBSCRIPTION_TOKEN_TAG_BYTES);
  }

  private async verify(token: string, keyPromise: Promise<CryptoKey>): Promise<unknown | null> {
    if (!token || token.length > MAX_TOKEN_LENGTH) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
    const payload = fromBase64Url(parts[1]);
    const signature = fromBase64Url(parts[2]);
    if (!payload || !signature) return null;

    const valid = await crypto.subtle.verify(
      'HMAC',
      await keyPromise,
      signature,
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;
    try {
      return JSON.parse(decoder.decode(payload));
    } catch {
      return null;
    }
  }
}
