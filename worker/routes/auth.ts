import type { Env, UserSettings } from '../types';
import {
  getSessionData, getUserSettings, putUserSettings,
  createSession, deleteSession, requireAuth,
  sessionCookieHeader, clearSessionCookieHeader,
} from '../lib/auth';
import { fetchRepository, fetchUser, type RepoSession } from '../lib/github';
import { errorResponse, jsonResponse } from '../lib/security';
import { cleanupSubToken, generateHex, rebuildWithWarning } from '../lib/helpers';

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { owner, repo, pat } = await request.json() as { owner: string; repo: string; pat: string };
  if (!owner || !repo || !pat) return errorResponse('Missing required fields', 400);

  const userRes = await fetchUser(pat);
  if (!userRes.ok) return errorResponse('Invalid PAT', 401);
  const userData = await userRes.json() as { login: string; avatar_url: string };

  let repository: { default_branch: string };
  try {
    repository = await fetchRepository(owner, repo, pat);
  } catch {
    return errorResponse('Repository not found or not accessible', 404);
  }

  const existing = await getUserSettings(owner, repo, env);
  const subToken = existing?.subToken || generateHex(16);
  const settings: UserSettings = {
    pat, owner, repo, subToken,
    userLogin: userData.login,
    userAvatar: userData.avatar_url,
    defaultBranch: repository.default_branch,
    publicBaseUrl: new URL(request.url).origin,
  };
  await putUserSettings(settings, env);
  if (!existing) await env.SESSIONS.put(`sub:${subToken}`, JSON.stringify({ owner, repo }));

  const session: RepoSession = { owner, repo, pat, userLogin: userData.login, defaultBranch: repository.default_branch, publicBaseUrl: settings.publicBaseUrl };
  const { warning } = await rebuildWithWarning(session, subToken, env);
  const sessionId = await createSession(owner, repo, env);

  return jsonResponse(
    { owner, repo, subToken, userLogin: settings.userLogin, userAvatar: settings.userAvatar, warning },
    200,
    { 'Set-Cookie': sessionCookieHeader(sessionId) },
  );
}

export async function handleLogout(request: Request, env: Env): Promise<Response> {
  await deleteSession(request, env);
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader() });
}

export async function handleGetSettings(request: Request, env: Env): Promise<Response> {
  const session = await getSessionData(request, env);
  if (!session) return errorResponse('Not authenticated', 401);

  const settings = await getUserSettings(session.owner, session.repo, env);
  if (!settings) return jsonResponse(null);
  return jsonResponse({
    owner: settings.owner,
    repo: settings.repo,
    subToken: settings.subToken,
    userLogin: settings.userLogin,
    userAvatar: settings.userAvatar,
  });
}

export async function handlePutSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const { owner, repo, pat, subToken } = await request.json() as { owner: string; repo: string; pat: string; subToken: string };
  if (!owner || !repo || !subToken) return errorResponse('Missing required fields', 400);
  if (!/^[a-zA-Z0-9_-]+$/.test(subToken)) {
    return errorResponse('subToken can only contain letters, numbers, hyphens and underscores', 400);
  }

  const effectivePat = pat || auth.settings.pat;
  const userRes = await fetchUser(effectivePat);
  if (!userRes.ok) return errorResponse('Invalid PAT', 401);
  const userData = await userRes.json() as { login: string; avatar_url: string };
  let repository: { default_branch: string };
  try {
    repository = await fetchRepository(owner, repo, effectivePat);
  } catch {
    return errorResponse('Repository not found or not accessible', 404);
  }

  if (auth.settings.subToken !== subToken) {
    const taken = await env.SESSIONS.get(`sub:${subToken}`);
    if (taken) {
      const takenData = JSON.parse(taken) as { owner: string; repo: string };
      if (takenData.owner !== auth.session.owner || takenData.repo !== auth.session.repo) {
        return errorResponse('subToken already taken', 409);
      }
    }
    await cleanupSubToken(auth.settings.subToken, env);
  }

  const isRepoChange = owner !== auth.session.owner || repo !== auth.session.repo;
  const settings: UserSettings = {
    pat: effectivePat, owner, repo, subToken,
    userLogin: userData.login,
    userAvatar: userData.avatar_url,
    defaultBranch: repository.default_branch,
    publicBaseUrl: new URL(request.url).origin,
  };
  if (isRepoChange) await env.SESSIONS.delete(`user:${auth.session.owner}/${auth.session.repo}`);
  await putUserSettings(settings, env);
  await env.SESSIONS.put(`sub:${subToken}`, JSON.stringify({ owner, repo }));

  let cookieHeader: string | undefined;
  if (isRepoChange) {
    await deleteSession(request, env);
    cookieHeader = sessionCookieHeader(await createSession(owner, repo, env));
  }

  const session: RepoSession = { owner, repo, pat: effectivePat, userLogin: userData.login, defaultBranch: repository.default_branch, publicBaseUrl: settings.publicBaseUrl };
  const { warning } = await rebuildWithWarning(session, subToken, env);
  return jsonResponse(
    { owner, repo, subToken, userLogin: settings.userLogin, userAvatar: settings.userAvatar, warning },
    200,
    cookieHeader ? { 'Set-Cookie': cookieHeader } : undefined,
  );
}

export async function handleDeleteSettings(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  await cleanupSubToken(auth.settings.subToken, env);
  await env.SESSIONS.delete(`user:${auth.session.owner}/${auth.session.repo}`);
  await deleteSession(request, env);
  return jsonResponse({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader() });
}
