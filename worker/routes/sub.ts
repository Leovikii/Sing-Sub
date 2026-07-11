import type { Env } from '../types';
import { getUserSettings } from '../lib/auth';
import { buildProfile } from '../lib/builder';
import { errorResponse } from '../lib/security';
import { toRepoSession, subscriptionResponse, fetchProfile } from '../lib/helpers';
import { fetchRawFile } from '../lib/github';

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

export async function handleRuleset(
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
    return errorResponse('Invalid ruleset link', 400);
  }

  const raw = await env.SESSIONS.get(`sub:${token}`);
  if (!raw) return errorResponse('Invalid ruleset link', 404);

  const { owner, repo } = JSON.parse(raw) as { owner: string; repo: string };
  const settings = await getUserSettings(owner, repo, env);
  if (!settings) return errorResponse('User not configured', 404);

  const session = toRepoSession(settings);
  
  const res = await fetchRawFile(`sing-sub/rulesets/compiled/${name}.srs`, session);
  if (!res.ok) {
    if (res.status === 404) return errorResponse('Ruleset not found or not compiled yet', 404);
    return errorResponse('Failed to fetch ruleset from GitHub', 500);
  }

  // Pass through the binary stream
  const response = new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name}.srs"`,
      'Cache-Control': 'public, max-age=300' // cache for 5 minutes
    }
  });

  return response;
}
