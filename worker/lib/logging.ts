const requestIds = new WeakMap<Request, string>();

export function createRequestId(request: Request): string {
  const requestId = crypto.randomUUID();
  requestIds.set(request, requestId);
  return requestId;
}

export function requestIdFor(request: Request): string | undefined {
  return requestIds.get(request);
}

export function redactPath(path: string): string {
  return path
    .replace(/^\/sub\/[^/]+\/([^/]+\.json)$/, '/sub/:token/$1')
    .replace(/^\/rules\/[^/]+\/([^/]+\.(?:json|srs))$/, '/rules/:token/$1')
    .replace(/^\/internal\/srs-jobs\/[^/]+\//, '/internal/srs-jobs/:jobId/');
}

export function withRequestId(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID', requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type LogLevel = 'log' | 'error' | 'warn';

const SENSITIVE_KEY = /token|ticket|secret|password|authorization|cookie|pat|body|content/i;

export function logEvent(level: LogLevel, event: Record<string, unknown>): void {
  const safe = Object.fromEntries(Object.entries(event).flatMap(([key, value]) => {
    if (SENSITIVE_KEY.test(key)) return [];
    if (key === 'path' && typeof value === 'string') return [[key, redactPath(value)]];
    if (['string', 'number', 'boolean'].includes(typeof value) || value === null) return [[key, value]];
    return [];
  }));
  console[level](JSON.stringify(safe));
}
