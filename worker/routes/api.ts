import type { Env, UserSettings, StateData } from '../types';
import {
  getSessionData, getUserSettings, putUserSettings,
  createSession, deleteSession, requireAuth,
  sessionCookieHeader, clearSessionCookieHeader,
} from '../lib/auth';
import { fetchUser, fetchFileContent, putFileContent, deleteFileContent, fetchDirectoryContents, type RepoSession } from '../lib/github';
import { buildAllProfiles } from '../lib/builder';
import { jsonResponse, errorResponse } from '../lib/security';
import { generateHex, toRepoSession, rebuildWithWarning, rebuildSingleWithWarning, cleanupSubToken, seedRepository } from '../lib/helpers';

const RULES_PATH = 'sing-sub/rules.json';

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { owner, repo, pat } = await request.json() as {
    owner: string; repo: string; pat: string;
  };

  if (!owner || !repo || !pat) {
    return errorResponse('Missing required fields', 400);
  }

  const userRes = await fetchUser(pat);
  if (!userRes.ok) return errorResponse('Invalid PAT', 401);
  const userData = await userRes.json() as { login: string; avatar_url: string };

  const existing = await getUserSettings(owner, repo, env);

  const subToken = existing?.subToken || generateHex(16);

  const settings: UserSettings = {
    pat,
    owner,
    repo,
    subToken,
    userLogin: userData.login,
    userAvatar: userData.avatar_url,
  };

  await putUserSettings(settings, env);

  if (!existing) {
    await env.SESSIONS.put(`sub:${subToken}`, JSON.stringify({ owner, repo }));
  }

  const session = { owner, repo, pat };
  await seedRepository(session);
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

  const { owner, repo, pat, subToken } = await request.json() as {
    owner: string; repo: string; pat: string; subToken: string;
  };

  if (!owner || !repo || !subToken) {
    return errorResponse('Missing required fields', 400);
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(subToken)) {
    return errorResponse('subToken can only contain letters, numbers, hyphens and underscores', 400);
  }

  const effectivePat = pat || auth.settings.pat;

  const userRes = await fetchUser(effectivePat);
  if (!userRes.ok) return errorResponse('Invalid PAT', 401);
  const userData = await userRes.json() as { login: string; avatar_url: string };

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
    pat: effectivePat,
    owner,
    repo,
    subToken,
    userLogin: userData.login,
    userAvatar: userData.avatar_url,
  };

  if (isRepoChange) {
    const oldKey = `user:${auth.session.owner}/${auth.session.repo}`;
    await env.SESSIONS.delete(oldKey);
  }

  await putUserSettings(settings, env);
  await env.SESSIONS.put(`sub:${subToken}`, JSON.stringify({ owner, repo }));

  let cookieHeader: string | undefined;
  if (isRepoChange) {
    await deleteSession(request, env);
    const newSessionId = await createSession(owner, repo, env);
    cookieHeader = sessionCookieHeader(newSessionId);
  }

  const session: RepoSession = { owner, repo, pat: effectivePat };
  if (isRepoChange) {
    await seedRepository(session);
  }
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

export async function handleGetState(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const session = toRepoSession(auth.settings);

  const { fetchAllProfiles } = await import('../lib/helpers');
  const profiles = await fetchAllProfiles(session);

  return jsonResponse({ state: { profiles }, sha: 'split' });
}

export async function handleRebuild(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const session = toRepoSession(auth.settings);

  let healed = false;
  const [nodes, templates] = await Promise.all([
    fetchDirectoryContents('sing-sub/nodes', session),
    fetchDirectoryContents('sing-sub/templates', session),
  ]);
  
  if (nodes.length === 0 || templates.length === 0) {
    const { seedRepository } = await import('../lib/helpers');
    await seedRepository(session);
    healed = true;
  }

  const file = await fetchFileContent(RULES_PATH, session);
  if (!file) return errorResponse('No rules found', 404);

  const state = JSON.parse(file.content) as StateData;

  try {
    await buildAllProfiles(state.profiles, session, auth.settings.subToken, env);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Build failed';
    return jsonResponse({ state, sha: file.sha, warning: msg });
  }

  const responsePayload: any = { state, sha: file.sha };
  if (healed) responsePayload.warning = '检测到节点目录缺失，已自动为您重建初始结构';
  
  return jsonResponse(responsePayload);
}
export async function handlePutState(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const { state, profileName } = await request.json() as { state: StateData; profileName?: string };
  const session = toRepoSession(auth.settings);

  // Read existing files to detect deletions
  let existingJson: string[] = [];
  try {
    const existingFiles = await fetchDirectoryContents('sing-sub/configs', session);
    existingJson = existingFiles.filter(p => p.toLowerCase().endsWith('.json'));
  } catch {}

  const currentNames = state.profiles.map(p => p.name);
  const filesToDelete = existingJson.filter(p => {
    const name = p.split('/').pop()?.replace('.json', '');
    return !currentNames.includes(name || '');
  });

  // Write all current profiles
  await Promise.all(state.profiles.map(async profile => {
    const path = `sing-sub/configs/${profile.name}.json`;
    const content = JSON.stringify(profile, null, 2);
    // Passing null for SHA forces putFileContent to fetch it first, making it safe for updates
    await putFileContent(path, session, content, null, `Update config ${profile.name}`);
  }));

  // Delete removed profiles
  if (filesToDelete.length > 0) {
    const { deleteFileContent } = await import('../lib/github');
    await Promise.all(filesToDelete.map(async path => {
      await deleteFileContent(path, session, `Delete config`);
    }));
  }

  // Delete legacy rules.json if it exists
  try {
    const { deleteFileContent, fetchFileContent } = await import('../lib/github');
    const legacy = await fetchFileContent(RULES_PATH, session);
    if (legacy) await deleteFileContent(RULES_PATH, session, `Delete legacy rules.json`);
  } catch {}

  let warning;
  if (profileName) {
    const res = await rebuildSingleWithWarning(session, auth.settings.subToken, env, profileName);
    warning = res.warning;
  } else {
    const res = await rebuildWithWarning(session, auth.settings.subToken, env);
    warning = res.warning;
  }
  
  return jsonResponse({ sha: 'split', warning });
}

export async function handlePreview(request: Request, env: Env, name: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  if (request.method === 'POST') {
    const profile = await request.json() as Profile;
    const session = toRepoSession(auth.settings);
    try {
      const config = await import('../lib/builder').then(m => m.buildProfile(profile, session));
      return jsonResponse({ content: config });
    } catch (e: any) {
      return errorResponse(`Preview build failed: ${e.message}`, 400);
    }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return errorResponse('Invalid profile name', 400);
  }

  const cached = await env.SESSIONS.get(`config:${auth.settings.subToken}:${name}`);
  if (!cached) return errorResponse('该配置尚未构建，请先保存或刷新', 404);

  return jsonResponse({ content: cached });
}

export async function handleGetAssets(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const session = toRepoSession(auth.settings);

  // Fetch both directories concurrently
  let [nodes, templates] = await Promise.all([
    fetchDirectoryContents('sing-sub/nodes', session),
    fetchDirectoryContents('sing-sub/templates', session),
  ]);

  let healed = false;
  if (nodes.length === 0 || templates.length === 0) {
    const { seedRepository } = await import('../lib/helpers');
    await seedRepository(session);
    healed = true;
    
    // Re-fetch after healing
    [nodes, templates] = await Promise.all([
      fetchDirectoryContents('sing-sub/nodes', session),
      fetchDirectoryContents('sing-sub/templates', session),
    ]);
  }

  // Filter to only include JSON files
  const filterJson = (paths: string[]) => paths.filter(p => p.toLowerCase().endsWith('.json'));

  const jsonNodes = filterJson(nodes);
  const jsonTemplates = filterJson(templates);
  
  const parseFileMeta = async (path: string) => {
    try {
      const file = await fetchFileContent(path, session);
      if (file && file.content) {
        const data = JSON.parse(file.content);
        return {
          path,
          inboundsCount: Array.isArray(data.inbounds) ? data.inbounds.length : 0,
          outboundsCount: Array.isArray(data.outbounds) ? data.outbounds.length : 0,
          tags: Array.isArray(data.outbounds) ? data.outbounds.map((o: any) => o.tag).filter(Boolean).slice(0, 5) : []
        };
      }
    } catch { /* ignore parse errors */ }
    return { path, inboundsCount: 0, outboundsCount: 0, tags: [] };
  };

  const [nodesWithMeta, templatesWithMeta] = await Promise.all([
    Promise.all(jsonNodes.map(parseFileMeta)),
    Promise.all(jsonTemplates.map(parseFileMeta))
  ]);

  return jsonResponse({
    nodes: nodesWithMeta,
    templates: templatesWithMeta,
    warning: healed ? '检测到节点目录缺失，已自动为您重建初始结构' : undefined
  });
}

export async function handleGetFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path) return errorResponse('Missing path parameter', 400);

  const session = toRepoSession(auth.settings);
  const file = await fetchFileContent(path, session);
  if (!file) return errorResponse('File not found', 404);

  return jsonResponse({ content: file.content, sha: file.sha });
}

export async function handlePutFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const { path, content, sha, message } = await request.json() as { path: string; content: string; sha?: string; message?: string };
  if (!path || content === undefined) return errorResponse('Missing path or content', 400);

  const session = toRepoSession(auth.settings);
  await putFileContent(path, session, content, sha || null, message || `Update ${path}`);
  return jsonResponse({ success: true });
}

export async function handleDeleteFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path) return errorResponse('Missing path parameter', 400);

  const session = toRepoSession(auth.settings);
  
  // Need to get SHA first to delete
  const file = await fetchFileContent(path, session);
  if (!file) return errorResponse('File not found', 404);

  await deleteFileContent(path, session, file.sha, `Delete ${path}`);
  return jsonResponse({ success: true });
}
