import { describe, expect, it } from 'vitest';
import { HttpError, toErrorResponse } from '../../worker/lib/http-errors';
import { errorResponse, jsonResponse } from '../../worker/lib/security';

async function body(response: Response): Promise<unknown> {
  return response.json();
}

describe('API response envelopes', () => {
  it('wraps successful data', async () => {
    await expect(body(jsonResponse({ ok: true }))).resolves.toEqual({ data: { ok: true } });
  });

  it.each([
    [400, 'VALIDATION_FAILED'],
    [401, 'NOT_AUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'REVISION_CONFLICT'],
    [500, 'INTERNAL_ERROR'],
  ] as const)('maps HTTP %s to %s', async (status, code) => {
    const response = errorResponse('safe message', status);
    expect(response.status).toBe(status);
    await expect(body(response)).resolves.toEqual({
      error: { code, details: { message: 'safe message' } },
    });
  });

  it('maps known HttpError details and request ID', async () => {
    const response = toErrorResponse(
      new HttpError(409, 'REVISION_CONFLICT', 'Workspace changed', { expectedRevision: 'rev-1' }),
      'request-1',
    );
    await expect(body(response)).resolves.toEqual({
      error: {
        code: 'REVISION_CONFLICT',
        details: { message: 'Workspace changed', expectedRevision: 'rev-1' },
        requestId: 'request-1',
      },
    });
  });

  it('does not expose unknown exception messages', async () => {
    const response = toErrorResponse(new Error('private token leaked'));
    await expect(body(response)).resolves.toEqual({
      error: { code: 'INTERNAL_ERROR', details: { message: 'Internal server error' } },
    });
  });
});
