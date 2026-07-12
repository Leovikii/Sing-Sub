import type { Env, Profile, StateData } from '../types';
import { requireAuth } from '../lib/auth';
import { buildAllProfiles, buildProfile } from '../lib/builder';
import { commitMultiFiles, fetchDirectoryContents, GithubApiError, type GitTreeItem } from '../lib/github';
import { errorResponse, jsonResponse } from '../lib/security';
import { cleanupScopedConfigCache, fetchAllProfiles, rebuildSingleWithWarning, rebuildWithWarning, toRepoSession } from '../lib/helpers';
import { getProfileSnapshot, putProfileSnapshot } from '../lib/dashboard';
import { configCacheKey } from '../lib/kv';

const SAFE_PROFILE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function validateProfiles(profiles: unknown): string | null {
  if (!Array.isArray(profiles)) return '配置列表无效';
  const names = new Set<string>();
  for (const profile of profiles) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return '配置内容无效';
    if (!SAFE_PROFILE_NAME.test(profile.name)) return '配置名称只能包含字母、数字、点、下划线和连字符，且不能为空';
    if (names.has(profile.name)) return `配置名称重复: ${profile.name}`;
    if (typeof profile.templateUrl !== 'string' || typeof profile.nodesPath !== 'string' ||
        !Array.isArray(profile.rules) || !Array.isArray(profile.inboundRules) ||
        !Number.isInteger(profile.order) || profile.order < 0 ||
        (profile.patchUrl !== undefined && typeof profile.patchUrl !== 'string') ||
        (profile.overrides !== undefined && (!profile.overrides || typeof profile.overrides !== 'object' || Array.isArray(profile.overrides)))) {
      return `配置格式无效: ${profile.name}`;
    }
    names.add(profile.name);
  }
  return null;
}

export async function handleGetState(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const session = toRepoSession(auth.settings);
  let profiles = await getProfileSnapshot(env, session);
  if (!profiles) {
    profiles = await fetchAllProfiles(session);
    await putProfileSnapshot(env, session, profiles);
  }
  return jsonResponse({ state: { profiles } });
}

export async function handleRebuild(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const session = toRepoSession(auth.settings);
  const profiles = await fetchAllProfiles(session);
  await putProfileSnapshot(env, session, profiles);
  try {
    await buildAllProfiles(profiles, session, auth.settings.subToken, env);
  } catch (error) {
    await cleanupScopedConfigCache(auth.settings.subToken, session, env);
    const warning = error instanceof Error ? error.message : 'Build failed';
    return jsonResponse({ state: { profiles }, warning });
  }
  return jsonResponse({ state: { profiles } });
}

export async function handlePutState(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const { state, profileName, oldProfileName } = await request.json() as {
    state?: StateData;
    profileName?: string;
    oldProfileName?: string;
  };
  const validationError = validateProfiles(state?.profiles);
  if (validationError) return errorResponse(validationError, 400);
  if (profileName !== undefined && !SAFE_PROFILE_NAME.test(profileName)) return errorResponse('配置名称无效', 400);
  if (oldProfileName !== undefined && !SAFE_PROFILE_NAME.test(oldProfileName)) return errorResponse('原配置名称无效', 400);

  const session = toRepoSession(auth.settings);
  let existingJson: string[] = [];
  try {
    existingJson = (await fetchDirectoryContents('sing-sub/configs', session) || [])
      .filter(path => path.toLowerCase().endsWith('.json'));
  } catch { /* A first save creates the directory. */ }

  const profiles = state!.profiles;
  const currentNames = new Set(profiles.map(profile => profile.name));
  const renamedPath = profileName && oldProfileName && oldProfileName !== profileName
    ? `sing-sub/configs/${oldProfileName}.json`
    : null;
  const filesToDelete = profileName
    ? (renamedPath && existingJson.includes(renamedPath) ? [renamedPath] : [])
    : existingJson.filter(path => !currentNames.has(path.split('/').pop()?.replace('.json', '') || ''));
  const profilesToUpdate = profileName
    ? profiles.filter(profile => profile.name === profileName)
    : profiles;

  const treeItems: GitTreeItem[] = [
    ...profilesToUpdate.map(profile => ({
      path: `sing-sub/configs/${profile.name}.json`,
      mode: '100644' as const,
      type: 'blob' as const,
      content: JSON.stringify(profile, null, 2),
    })),
    ...filesToDelete.map(path => ({ path, mode: '100644' as const, type: 'blob' as const, sha: null })),
  ];

  if (treeItems.length > 0) {
    const commitMessage = renamedPath
      ? `config: rename ${oldProfileName}.json to ${profileName}.json`
      : profileName
      ? `config: update ${profileName}.json`
      : 'config: sync profiles';
    try {
      await commitMultiFiles(session, treeItems, commitMessage);
    } catch (error) {
      if (error instanceof GithubApiError && (error.status === 409 || error.status === 422)) {
        return errorResponse('配置已被其他操作修改，请重新加载后再试', 409);
      }
      throw error;
    }
  }

  await putProfileSnapshot(env, session, profiles);

  if (renamedPath) {
    await env.SESSIONS.delete(configCacheKey(auth.settings.subToken, auth.settings, oldProfileName!));
  }

  const { warning } = profileName
    ? await rebuildSingleWithWarning(session, auth.settings.subToken, env, profileName)
    : await rebuildWithWarning(session, auth.settings.subToken, env);
  return jsonResponse({ warning });
}

export async function handlePreview(request: Request, env: Env, name: string): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  if (request.method === 'POST') {
    try {
      const profile = await request.json() as Profile;
      return jsonResponse({ content: await buildProfile(profile, toRepoSession(auth.settings)) });
    } catch (error: any) {
      return errorResponse(`Preview build failed: ${error.message}`, 400);
    }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return errorResponse('Invalid profile name', 400);
  const cached = await env.SESSIONS.get(configCacheKey(auth.settings.subToken, auth.settings, name));
  if (!cached) return errorResponse('该配置尚未构建，请先保存或刷新', 404);
  return jsonResponse({ content: cached });
}
