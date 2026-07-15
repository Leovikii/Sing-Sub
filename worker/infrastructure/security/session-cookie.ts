export const SESSION_COOKIE_NAME = '__Host-sing-sub-session';

export function readSessionCookie(request: Request): string | null {
  const source = request.headers.get('Cookie');
  if (!source) return null;

  for (const entry of source.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0 || entry.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    const value = entry.slice(separator + 1).trim();
    return value || null;
  }
  return null;
}

export function sessionCookieHeader(token: string, maxAgeSeconds: number): string {
  if (!token || !Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new Error('Invalid session cookie');
  }
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
