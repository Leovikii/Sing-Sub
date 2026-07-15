import type {
  SrsJobOperation,
  SrsJobTicketClaims,
  SrsJobTicketService,
} from '../../application/ports/srs-job-ticket-service';
import { SRS_JOB_OPERATIONS } from '../../application/ports/srs-job-ticket-service';
import { canonicalJson } from '../../domain/revisions/canonical-json';

const TOKEN_VERSION = 'v1';
const TOKEN_PURPOSE = 'srs-build';
const MINIMUM_SECRET_BYTES = 32;
const MAX_TOKEN_LENGTH = 4096;
const MAX_TICKET_LIFETIME_SECONDS = 15 * 60;
const CLOCK_SKEW_SECONDS = 30;
const SAFE_OPAQUE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
const salt = encoder.encode('sing-sub:srs-job-ticket:v1:salt');
const info = encoder.encode('sing-sub:srs-job-ticket:v1:hmac-key');

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

function isExactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const expected = [...keys].sort();
  const actual = Object.keys(value as Record<string, unknown>).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseOperations(value: unknown): SrsJobOperation[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > SRS_JOB_OPERATIONS.length) return null;
  if (!value.every(operation => typeof operation === 'string' && SRS_JOB_OPERATIONS.includes(operation as SrsJobOperation))) {
    return null;
  }
  if (new Set(value).size !== value.length) return null;
  return value as SrsJobOperation[];
}

function parseClaims(value: unknown): SrsJobTicketClaims | null {
  if (!isExactObject(value, ['expiresAt', 'issuedAt', 'jobId', 'operations', 'purpose', 'workspaceId'])) return null;
  const { purpose, workspaceId, jobId, operations, issuedAt, expiresAt } = value;
  const parsedOperations = parseOperations(operations);
  if (purpose !== TOKEN_PURPOSE ||
      typeof workspaceId !== 'string' || !SAFE_OPAQUE_ID.test(workspaceId) ||
      typeof jobId !== 'string' || !SAFE_OPAQUE_ID.test(jobId) ||
      !parsedOperations ||
      !Number.isSafeInteger(issuedAt) || (issuedAt as number) <= 0 ||
      !Number.isSafeInteger(expiresAt) || (expiresAt as number) <= (issuedAt as number) ||
      (expiresAt as number) - (issuedAt as number) > MAX_TICKET_LIFETIME_SECONDS) return null;
  return {
    purpose,
    workspaceId,
    jobId,
    operations: parsedOperations,
    issuedAt: issuedAt as number,
    expiresAt: expiresAt as number,
  };
}

export class WebCryptoSrsJobTicketService implements SrsJobTicketService {
  private readonly key: Promise<CryptoKey>;

  constructor(
    secret: string,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
  ) {
    const secretBytes = encoder.encode(secret);
    if (secretBytes.byteLength < MINIMUM_SECRET_BYTES) {
      throw new Error('SRS job ticket signing secret must contain at least 32 bytes');
    }
    this.key = this.deriveKey(secretBytes);
  }

  async issue(claims: SrsJobTicketClaims): Promise<string> {
    const parsed = parseClaims(claims);
    const now = this.now();
    if (!parsed || parsed.issuedAt > now + CLOCK_SKEW_SECONDS || parsed.expiresAt <= now) {
      throw new Error('Invalid SRS job ticket claims');
    }
    const payload = toBase64Url(encoder.encode(canonicalJson(parsed)));
    const message = `${TOKEN_VERSION}.${payload}`;
    const signature = await crypto.subtle.sign('HMAC', await this.key, encoder.encode(message));
    return `${message}.${toBase64Url(new Uint8Array(signature))}`;
  }

  async verify(
    token: string,
    expected: { workspaceId: string; jobId: string; operation: SrsJobOperation },
  ): Promise<SrsJobTicketClaims | null> {
    if (!token || token.length > MAX_TOKEN_LENGTH ||
        !SAFE_OPAQUE_ID.test(expected.workspaceId) || !SAFE_OPAQUE_ID.test(expected.jobId) ||
        !SRS_JOB_OPERATIONS.includes(expected.operation)) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null;
    const payload = fromBase64Url(parts[1]);
    const signature = fromBase64Url(parts[2]);
    if (!payload || !signature) return null;
    const valid = await crypto.subtle.verify(
      'HMAC',
      await this.key,
      signature,
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return null;

    let claims: SrsJobTicketClaims | null;
    try {
      claims = parseClaims(JSON.parse(decoder.decode(payload)));
    } catch {
      return null;
    }
    const now = this.now();
    if (!claims || claims.issuedAt > now + CLOCK_SKEW_SECONDS || claims.expiresAt <= now ||
        claims.workspaceId !== expected.workspaceId || claims.jobId !== expected.jobId ||
        !claims.operations.includes(expected.operation)) return null;
    return claims;
  }

  private async deriveKey(secret: Uint8Array): Promise<CryptoKey> {
    const baseKey = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      baseKey,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign', 'verify'],
    );
  }
}
