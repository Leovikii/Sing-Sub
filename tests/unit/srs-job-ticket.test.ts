import { describe, expect, it } from 'vitest';
import { WebCryptoSrsJobTicketService } from '../../worker/infrastructure/security/web-crypto-srs-job-ticket-service';

const secret = 'session-signing-secret-with-at-least-32-bytes';
const now = 1_784_092_800;

function claims(overrides: Partial<Parameters<WebCryptoSrsJobTicketService['issue']>[0]> = {}) {
  return {
    purpose: 'srs-build' as const,
    workspaceId: 'primary',
    jobId: 'srs-job-1',
    operations: ['source', 'complete', 'failed'] as ('source' | 'complete' | 'failed')[],
    issuedAt: now,
    expiresAt: now + 900,
    ...overrides,
  };
}

describe('SRS job tickets', () => {
  it('authorizes only the signed workspace, job, and operations', async () => {
    const service = new WebCryptoSrsJobTicketService(secret, () => now);
    const token = await service.issue(claims());

    await expect(service.verify(token, {
      workspaceId: 'primary', jobId: 'srs-job-1', operation: 'source',
    })).resolves.toMatchObject({ purpose: 'srs-build', expiresAt: now + 900 });
    await expect(service.verify(token, {
      workspaceId: 'other', jobId: 'srs-job-1', operation: 'source',
    })).resolves.toBeNull();
    await expect(service.verify(token, {
      workspaceId: 'primary', jobId: 'srs-job-2', operation: 'source',
    })).resolves.toBeNull();

    const sourceOnly = await service.issue(claims({ operations: ['source'] }));
    await expect(service.verify(sourceOnly, {
      workspaceId: 'primary', jobId: 'srs-job-1', operation: 'complete',
    })).resolves.toBeNull();
  });

  it('rejects tampered, expired, malformed, and excessively long-lived tickets', async () => {
    const service = new WebCryptoSrsJobTicketService(secret, () => now);
    const token = await service.issue(claims());
    const replacement = token.endsWith('a') ? 'b' : 'a';

    await expect(service.verify(`${token.slice(0, -1)}${replacement}`, {
      workspaceId: 'primary', jobId: 'srs-job-1', operation: 'source',
    })).resolves.toBeNull();
    await expect(service.verify('v1.not-json.not-a-signature', {
      workspaceId: 'primary', jobId: 'srs-job-1', operation: 'source',
    })).resolves.toBeNull();

    const expired = await service.issue(claims({ issuedAt: now - 899, expiresAt: now + 1 }));
    const later = new WebCryptoSrsJobTicketService(secret, () => now + 2);
    await expect(later.verify(expired, {
      workspaceId: 'primary', jobId: 'srs-job-1', operation: 'source',
    })).resolves.toBeNull();
    await expect(service.issue(claims({ expiresAt: now + 901 }))).rejects.toThrow('Invalid SRS job ticket claims');
  });

  it('uses a distinct derived key and enforces minimum secret strength', async () => {
    const token = await new WebCryptoSrsJobTicketService(secret, () => now).issue(claims());
    await expect(new WebCryptoSrsJobTicketService(`${secret}-other`, () => now).verify(token, {
      workspaceId: 'primary', jobId: 'srs-job-1', operation: 'source',
    })).resolves.toBeNull();
    expect(() => new WebCryptoSrsJobTicketService('too-short')).toThrow('at least 32 bytes');
  });
});
