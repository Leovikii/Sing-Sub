import type { Env } from '../types';
import { getUserSettings } from '../lib/auth';
import { buildProfile } from '../lib/builder';
import { errorResponse } from '../lib/security';
import { toRepoSession, subscriptionResponse, fetchProfile } from '../lib/helpers';

const ALLOWED_UA_PATTERNS = ['sing-box', 'SFI', 'SFA', 'SFM', 'SFT'];
const SAFE_TOKEN = /^[a-zA-Z0-9_-]+$/;

export async function handleSubscription(
  request: Request,
  env: Env,
  token: string,
  name: string
): Promise<Response> {
  const ua = request.headers.get('User-Agent') || '';
  if (!ALLOWED_UA_PATTERNS.some(p => ua.includes(p))) {
    return errorResponse('Forbidden', 403);
  }

  if (!SAFE_TOKEN.test(token) || !SAFE_TOKEN.test(name)) {
    return errorResponse('Invalid subscription link', 400);
  }

  const raw = await env.SESSIONS.get(`sub:${token}`);
  if (!raw) return errorResponse('Invalid subscription link', 404);

  const { owner, repo } = JSON.parse(raw) as { owner: string; repo: string };
  const settings = await getUserSettings(owner, repo, env);
  if (!settings) return errorResponse('User not configured', 404);

  const cached = await env.SESSIONS.get(`config:${token}:${name}`);
  if (cached) {
    return subscriptionResponse(cached);
  }

  const session = toRepoSession(settings);
  const profile = await fetchProfile(session, name);
  
  if (!profile) return errorResponse('Profile not found', 404);

  const config = await buildProfile(profile, session);
  await env.SESSIONS.put(`config:${token}:${name}`, config);

  return subscriptionResponse(config);
}
