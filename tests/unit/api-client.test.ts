import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiRequest } from '../../src/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('typed API client', () => {
  it('unwraps successful data envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: { ok: true } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(apiRequest<{ ok: boolean }>('/api/test')).resolves.toEqual({ ok: true });
  });

  it('maps structured failures without string matching', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: 'REVISION_CONFLICT',
        details: { message: 'Reload before saving' },
        requestId: 'request-1',
      },
    }), { status: 409 })));

    const error = await apiRequest('/api/test').catch(value => value);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      message: 'Reload before saving',
      status: 409,
      code: 'REVISION_CONFLICT',
      requestId: 'request-1',
    });
  });

  it('rejects malformed success payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await expect(apiRequest('/api/test')).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
