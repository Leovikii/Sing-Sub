import { describe, expect, it } from 'vitest';
import { createRequestId, redactPath, withRequestId } from '../../worker/lib/logging';

describe('request logging helpers', () => {
  it('redacts subscription and internal job path parameters', () => {
    expect(redactPath('/sub/private-token/default.json')).toBe('/sub/:token/default.json');
    expect(redactPath('/rules/private-token/rules.srs')).toBe('/rules/:token/rules.srs');
    expect(redactPath('/internal/srs-jobs/job-secret/source')).toBe('/internal/srs-jobs/:jobId/source');
  });

  it('creates a request id and returns it as a response header', () => {
    const requestId = createRequestId(new Request('https://example.com/api/state'));
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(withRequestId(new Response('ok'), requestId).headers.get('X-Request-ID')).toBe(requestId);
  });
});
