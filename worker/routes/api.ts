import type { Env, UserSettings, StateData, Profile } from '../types';
import {
  getSessionData, getUserSettings, putUserSettings,
  createSession, deleteSession, requireAuth,
  sessionCookieHeader, clearSessionCookieHeader,
} from '../lib/auth';
import { fetchUser, fetchRepository, fetchFileContent, putFileContent, deleteFileContent, fetchDirectoryContents, commitMultiFiles, GithubApiError, type GitTreeItem, type RepoSession } from '../lib/github';
import { buildAllProfiles, loadTemplate } from '../lib/builder';
import { jsonResponse, errorResponse } from '../lib/security';
import { generateHex, toRepoSession, rebuildWithWarning, rebuildSingleWithWarning, cleanupSubToken, fetchAllProfiles, pLimit } from '../lib/helpers';

const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MANAGED_ASSET_PATH = /^sing-sub\/(nodes|templates|patches|rulesets)\/([a-zA-Z0-9][a-zA-Z0-9._-]*)\.json$/;
const TEMPLATE_PATH = /^sing-sub\/templates\/([a-zA-Z0-9][a-zA-Z0-9._-]*)\.json$/;

function isManagedAssetPath(path: string): boolean {
  return MANAGED_ASSET_PATH.test(path);
}

function validateProfiles(profiles: Profile[]): string | null {
  const names = new Set<string>();
  for (const profile of profiles) {
    if (!SAFE_NAME.test(profile.name)) return '配置名称只能包含字母、数字、点、下划线和连字符，且不能为空';
    if (names.has(profile.name)) return `配置名称重复: ${profile.name}`;
    names.add(profile.name);
  }
  return null;
}


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
  let repository: { default_branch: string };
  try {
    repository = await fetchRepository(owner, repo, pat);
  } catch {
    return errorResponse('Repository not found or not accessible', 404);
  }

  const existing = await getUserSettings(owner, repo, env);

  const subToken = existing?.subToken || generateHex(16);

  const settings: UserSettings = {
    pat,
    owner,
    repo,
    subToken,
    userLogin: userData.login,
    userAvatar: userData.avatar_url,
    defaultBranch: repository.default_branch,
  };

  await putUserSettings(settings, env);

  if (!existing) {
    await env.SESSIONS.put(`sub:${subToken}`, JSON.stringify({ owner, repo }));
  }

  const session = { owner, repo, pat, userLogin: userData.login, defaultBranch: repository.default_branch };

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
    pat: effectivePat,
    owner,
    repo,
    subToken,
    userLogin: userData.login,
    userAvatar: userData.avatar_url,
    defaultBranch: repository.default_branch,
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

  const session: RepoSession = { owner, repo, pat: effectivePat, userLogin: userData.login, defaultBranch: repository.default_branch };

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

  const profiles = await fetchAllProfiles(session);

  return jsonResponse({ state: { profiles }, sha: 'split' });
}

export async function handleRebuild(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const session = toRepoSession(auth.settings);

  const profiles = await fetchAllProfiles(session);

  try {
    await buildAllProfiles(profiles, session, auth.settings.subToken, env);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Build failed';
    return jsonResponse({ state: { profiles }, sha: 'split', warning: msg });
  }

  return jsonResponse({ state: { profiles }, sha: 'split' });
}
export async function handlePutState(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const { state, profileName } = await request.json() as { state: StateData; profileName?: string };
  const session = toRepoSession(auth.settings);
  const validationError = validateProfiles(state.profiles);
  if (validationError) return errorResponse(validationError, 400);

  // Read existing files to detect deletions
  let existingJson: string[] = [];
  try {
    const existingFiles = await fetchDirectoryContents('sing-sub/configs', session);
    existingJson = (existingFiles || []).filter(p => p.toLowerCase().endsWith('.json'));
  } catch {}

  const currentNames = state.profiles.map((p: Profile) => p.name);
  const filesToDelete = profileName ? [] : existingJson.filter(p => {
    const name = p.split('/').pop()?.replace('.json', '');
    return !currentNames.includes(name || '');
  });

  const existingNames = existingJson.map(p => p.split('/').pop()?.replace('.json', ''));

  const profilesToUpdate = state.profiles.filter((profile: Profile) => {
    // If profileName is explicitly provided (single update), we MUST update it
    if (profileName && profile.name === profileName) return true;
    // Otherwise, we update all (this handles bulk edits, reordering, and new creations)
    if (!profileName) return true;
    return false;
  });

  const treeItems: GitTreeItem[] = [];

  // Add updated/new profiles to the tree
  profilesToUpdate.forEach((profile: Profile) => {
    const path = `sing-sub/configs/${profile.name}.json`;
    const content = JSON.stringify(profile, null, 2);
    treeItems.push({
      path,
      mode: '100644',
      type: 'blob',
      content
    });
  });

  // Add deleted profiles to the tree (sha: null deletes them)
  filesToDelete.forEach((path: string) => {
    treeItems.push({
      path,
      mode: '100644',
      type: 'blob',
      sha: null
    });
  });

  // Commit changes if there are any
  if (treeItems.length > 0) {
    let commitMessage = '';
    if (profileName) {
      commitMessage = `Update config ${profileName}`;
    } else {
      commitMessage = `Sync configurations (${profilesToUpdate.length} updated, ${filesToDelete.length} deleted)`;
    }
    try {
      await commitMultiFiles(session, treeItems, commitMessage);
    } catch (e) {
      if (e instanceof GithubApiError && (e.status === 409 || e.status === 422)) {
        return errorResponse('配置已被其他操作修改，请重新加载后再试', 409);
      }
      throw e;
    }
  }


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

  // Fetch directories concurrently
  const [nodes, templates, patches, rulesets] = await Promise.all([
    fetchDirectoryContents('sing-sub/nodes', session),
    fetchDirectoryContents('sing-sub/templates', session),
    fetchDirectoryContents('sing-sub/patches', session),
    fetchDirectoryContents('sing-sub/rulesets', session),
  ]);



  // Filter to only include JSON files
  const filterJson = (paths: string[] | null) => (paths || []).filter(p => p.toLowerCase().endsWith('.json'));

  const jsonNodes = filterJson(nodes);
  const jsonTemplates = filterJson(templates);
  const jsonPatches = filterJson(patches);
  const jsonRulesets = filterJson(rulesets);
  
  const limit = pLimit(5);
  const parseFileMeta = (path: string) => limit(async () => {
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
  });

  const [nodesWithMeta, templatesWithMeta, patchesWithMeta, rulesetsWithMeta] = await Promise.all([
    Promise.all(jsonNodes.map(parseFileMeta)),
    Promise.all(jsonTemplates.map(parseFileMeta)),
    Promise.all(jsonPatches.map(parseFileMeta)),
    Promise.all(jsonRulesets.map(parseFileMeta))
  ]);

  return jsonResponse({
    nodes: nodesWithMeta,
    templates: templatesWithMeta,
    patches: patchesWithMeta,
    rulesets: rulesetsWithMeta,
  });
}

export async function handleGetFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path) return errorResponse('Missing path parameter', 400);
  if (!isManagedAssetPath(path)) return errorResponse('Unsupported file path', 400);

  const session = toRepoSession(auth.settings);
  const file = await fetchFileContent(path, session);
  if (!file) return errorResponse('File not found', 404);

  return jsonResponse({ content: file.content, sha: file.sha });
}

export async function handleGetTemplate(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const source = new URL(request.url).searchParams.get('source');
  if (!source) return errorResponse('Missing template source', 400);
  const isExternal = source.startsWith('http://') || source.startsWith('https://');
  if (!isExternal && !TEMPLATE_PATH.test(source)) return errorResponse('Unsupported template source', 400);

  const content = await loadTemplate(source, toRepoSession(auth.settings));
  return jsonResponse({ content });
}

const COMPILE_SRS_WORKFLOW_PATH = '.github/workflows/compile-srs.yml';

const COMPILE_SRS_WORKFLOW_CONTENT = `name: Compile SRS
on:
  push:
    paths:
      - 'sing-sub/rulesets/*.json'
    branches:
      - main
      - master
  workflow_dispatch:

jobs:
  compile:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Fetch and compile rulesets
        run: |
          mkdir -p sing-sub/rulesets/compiled

          set -euo pipefail
          SING_BOX_VERSION="v1.9.3"
          curl --fail --location --retry 3 --connect-timeout 10 \\
            "https://github.com/SagerNet/sing-box/releases/download/\${SING_BOX_VERSION}/sing-box-\${SING_BOX_VERSION#v}-linux-amd64.tar.gz" \\
            --output sing-box.tar.gz
          tar -xzf sing-box.tar.gz
          mv sing-box-*/sing-box ./sing-box
          chmod +x ./sing-box

          cat << 'EOF' > process.js
          const fs = require('fs');
          async function main() {
            const files = fs.readdirSync('sing-sub/rulesets').filter(f => f.endsWith('.json'));
            for (const file of files) {
              const path = 'sing-sub/rulesets/' + file;
              const data = JSON.parse(fs.readFileSync(path, 'utf8'));
              let mergedRules = [];

              if (data._urls && Array.isArray(data._urls)) {
                for (const url of data._urls) {
                  try {
                    const parsedUrl = new URL(url);
                    if (parsedUrl.protocol !== 'https:') throw new Error('only HTTPS URLs are allowed');
                    const res = await fetch(parsedUrl, { signal: AbortSignal.timeout(10000) });
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    const length = Number(res.headers.get('content-length') || '0');
                    if (length > 5 * 1024 * 1024) throw new Error('response exceeds 5 MiB');
                    const body = await res.text();
                    if (body.length > 5 * 1024 * 1024) throw new Error('response exceeds 5 MiB');
                    const upstream = JSON.parse(body);
                    if (upstream.rules && Array.isArray(upstream.rules)) {
                      mergedRules = mergedRules.concat(upstream.rules);
                    }
                  } catch (e) {
                    console.log('::warning::Failed to fetch ruleset URL ' + url + ': ' + (e && e.message ? e.message : e));
                  }
                }
                delete data._urls;
              }

              delete data.note;
              delete data._note;

              if (data.rules) {
                mergedRules = mergedRules.concat(data.rules);
              }
              data.rules = mergedRules;

              const tmpPath = 'sing-sub/rulesets/compiled/tmp_' + file;
              fs.writeFileSync(tmpPath, JSON.stringify(data));
            }
          }
          main().catch(error => { console.error(error); process.exit(1); });
          EOF

          node process.js

          for tmp in sing-sub/rulesets/compiled/tmp_*.json; do
            [ -e "$tmp" ] || continue
            base=$(basename "$tmp" | sed 's/^tmp_//')
            name="\${base%.json}"
            ./sing-box rule-set compile "$tmp" -o "sing-sub/rulesets/compiled/$name.srs" || { echo "::warning::compile failed for $name"; rm -f "$tmp"; continue; }
            rm "$tmp"
          done
      - name: Commit and Push
        run: |
          git config user.name "Sing-Sub Bot"
          git config user.email "bot@sing-sub.local"
          git add -A sing-sub/rulesets/compiled
          git diff --cached --quiet || (git commit -m "🤖 Sing-Sub: ruleset: compile" && git push)
`;

export async function handlePutFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const { path, content, sha, message, oldPath } = await request.json() as { path: string; content: string; sha?: string; message?: string; oldPath?: string };
  if (!path || content === undefined) return errorResponse('Missing path or content', 400);
  if (!isManagedAssetPath(path) || (oldPath && !isManagedAssetPath(oldPath))) {
    return errorResponse('Unsupported file path', 400);
  }

  const session = toRepoSession(auth.settings);
  const isRuleset = path.startsWith('sing-sub/rulesets/');
  const isRename = !!oldPath && oldPath !== path;
  let warning: string | undefined;
  const fileName = path.split('/').pop()!;
  const actionMessage = isRename
    ? `🤖 Sing-Sub: asset: rename ${oldPath!.split('/').pop()} to ${fileName}`
    : `🤖 Sing-Sub: asset: update ${fileName}`;

  try {
    const workflowFile = isRuleset ? await fetchFileContent(COMPILE_SRS_WORKFLOW_PATH, session) : null;
    const needsWorkflow = isRuleset && !workflowFile;

    if (isRename || needsWorkflow) {
      // Keep renames and first-time ruleset setup in one atomic commit.
      const treeItems: GitTreeItem[] = [
        { path, mode: '100644', type: 'blob', content },
      ];

      if (isRename) {
        treeItems.push({ path: oldPath!, mode: '100644', type: 'blob', sha: null });
      } else if (sha) {
        const current = await fetchFileContent(path, session);
        if (!current || current.sha !== sha) return errorResponse('文件已被修改，请重新加载后再试', 409);
      }

      if (needsWorkflow) {
        treeItems.push({
          path: COMPILE_SRS_WORKFLOW_PATH,
          mode: '100644',
          type: 'blob',
          content: COMPILE_SRS_WORKFLOW_CONTENT,
        });
      }

      if (isRename && oldPath!.startsWith('sing-sub/rulesets/')) {
        const oldBasename = oldPath!.split('/').pop()!.replace(/\.json$/, '');
        const compiledPath = `sing-sub/rulesets/compiled/${oldBasename}.srs`;
        const compiledFile = await fetchFileContent(compiledPath, session);
        if (compiledFile) {
          treeItems.push({ path: compiledPath, mode: '100644', type: 'blob', sha: null });
        }
      }

      await commitMultiFiles(session, treeItems, needsWorkflow ? '🤖 Sing-Sub: ruleset: initialize compiler and update source' : actionMessage);
    } else {
      await putFileContent(path, session, content, sha || null, actionMessage);
    }
  } catch (e) {
    if (e instanceof GithubApiError && e.status === 409) {
      return errorResponse('文件已被修改，请重新加载后再试', 409);
    }
    throw e;
  }

  return jsonResponse({ success: true, warning });
}

export async function handleDeleteFile(request: Request, env: Env): Promise<Response> {
  const auth = await requireAuth(request, env);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const path = url.searchParams.get('path');
  if (!path) return errorResponse('Missing path parameter', 400);
  if (!isManagedAssetPath(path)) return errorResponse('Unsupported file path', 400);

  const session = toRepoSession(auth.settings);

  // Need to get SHA first to delete
  const file = await fetchFileContent(path, session);
  if (!file) return errorResponse('File not found', 404);

  if (path.startsWith('sing-sub/rulesets/')) {
    const basename = path.split('/').pop()!.replace(/\.json$/, '');
    const compiledPath = `sing-sub/rulesets/compiled/${basename}.srs`;
    const compiledFile = await fetchFileContent(compiledPath, session);
    const treeItems: GitTreeItem[] = [{ path, mode: '100644', type: 'blob', sha: null }];
    if (compiledFile) treeItems.push({ path: compiledPath, mode: '100644', type: 'blob', sha: null });
    try {
      await commitMultiFiles(session, treeItems, `🤖 Sing-Sub: ruleset: delete ${basename}${compiledFile ? ' and compiled artifact' : ''}`);
    } catch (e) {
      if (e instanceof GithubApiError && e.status === 409) return errorResponse('文件已被修改，请重新加载后再试', 409);
      throw e;
    }
  } else {
    try {
      await deleteFileContent(path, session, file.sha, `🤖 Sing-Sub: asset: delete ${path.split('/').pop()}`);
    } catch (e) {
      if (e instanceof GithubApiError && e.status === 409) return errorResponse('文件已被修改，请重新加载后再试', 409);
      throw e;
    }
  }

  return jsonResponse({ success: true });
}
