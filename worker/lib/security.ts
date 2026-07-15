import type { ApiErrorCode, ApiFailure, ApiSuccess } from '../../shared';

export function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' https://avatars.githubusercontent.com",
      "connect-src 'self' https://api.github.com",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };
  const body: ApiSuccess<unknown> = { data };
  return new Response(JSON.stringify(body), { status, headers });
}

function defaultErrorCode(status: number): ApiErrorCode {
  if (status === 400) return 'VALIDATION_FAILED';
  if (status === 401) return 'NOT_AUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'REVISION_CONFLICT';
  return 'INTERNAL_ERROR';
}

export function errorResponse(
  message: string,
  status: number,
  code: ApiErrorCode = defaultErrorCode(status),
  requestId?: string,
  details?: Record<string, string | number | boolean>,
): Response {
  const body: ApiFailure = {
    error: {
      code,
      details: { message, ...details },
      ...(requestId ? { requestId } : {}),
    },
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
