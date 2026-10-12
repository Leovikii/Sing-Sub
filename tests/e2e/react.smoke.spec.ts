import { expect, test, type Page, type Request } from '@playwright/test';

const settings = {
  subToken: 'subscription-token',
  userLogin: 'sing-sub-user',
  userAvatar: '',
};

interface ReactApiMock {
  authenticated: boolean;
  connected: boolean;
  loginRequests: Request[];
  logoutRequests: Request[];
  settingsRequests: Request[];
  connectionRequests: Request[];
  compilerRequests: Request[];
  fileRequests: Request[];
  assets: Array<{ path: string; note: string }>;
  templates: Array<{ path: string; note: string }>;
  previewRequests: Request[];
  rulesets: Array<{ path: string; note: string }>;
  contents: Record<string, string>;
  syncRequests: Request[];
  syncStatus: 'never' | 'conflict' | 'local-ahead' | 'remote-ahead';
  stateRequests: Request[];
  profiles: Array<Record<string, unknown>>;
  revision: number;
  buildStatus: 'none' | 'failed' | 'ready';
  buildRequests: Request[];
}

async function mockReactApi(page: Page, setupRequired = true): Promise<ReactApiMock> {
  await page.addInitScript(() => {
    localStorage.setItem('sing-sub.locale', 'zh-CN');
    localStorage.setItem('sing-sub.appearance', 'light');
  });

  const state: ReactApiMock = {
    authenticated: false,
    connected: false,
    loginRequests: [],
    logoutRequests: [],
    settingsRequests: [],
    connectionRequests: [],
    compilerRequests: [],
    fileRequests: [],
    assets: [],
    templates: [],
    previewRequests: [],
    rulesets: [],
    contents: {},
    syncRequests: [],
    syncStatus: 'local-ahead',
    stateRequests: [],
    profiles: [],
    revision: 1,
    buildStatus: 'none',
    buildRequests: [],
  };

  const apiPattern = new URL('/api/**', process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').toString();
  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const respond = (data: unknown) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data }),
    });

    if (pathname === '/api/bootstrap') {
      await respond(state.authenticated
        ? { settings, state: { profiles: state.profiles }, revision: `revision-${state.revision}`, setupRequired: false }
        : { settings: null, setupRequired });
      return;
    }

    if (pathname === '/api/login' && request.method() === 'POST') {
      state.loginRequests.push(request);
      state.authenticated = true;
      await respond({ ...settings, revision: 'revision-1' });
      return;
    }

    if (pathname === '/api/logout' && request.method() === 'POST') {
      state.logoutRequests.push(request);
      state.authenticated = false;
      await respond({ ok: true });
      return;
    }

    if (pathname === '/api/settings' && request.method() === 'PUT') {
      state.settingsRequests.push(request);
      await respond({ ...settings, subToken: 'rotated-token', revision: 'revision-2' });
      return;
    }

    if (pathname === '/api/state' && request.method() === 'GET') {
      await respond({ state: { profiles: state.profiles }, revision: `revision-${state.revision}` });
      return;
    }

    if (pathname === '/api/state' && request.method() === 'PUT') {
      state.stateRequests.push(request);
      state.profiles = request.postDataJSON().state.profiles;
      state.revision += 1;
      await respond({ revision: `revision-${state.revision}` });
      return;
    }

    if (pathname === '/api/preview' && request.method() === 'POST') {
      state.previewRequests.push(request);
      const profile = request.postDataJSON();
      await respond({ content: JSON.stringify({ profile: profile.name, outbounds: [] }, null, 2) });
      return;
    }

    if (pathname === '/api/github-sync' && request.method() === 'GET') {
      await respond({
        connected: state.connected,
        repository: state.connected ? 'example/private-config' : undefined,
        defaultBranch: state.connected ? 'main' : undefined,
        status: state.connected ? state.syncStatus : 'never',
        local: {
          revision: 'revision-1',
          contentHash: 'local-hash',
          changedFromBase: false,
          changes: { added: [], modified: [], deleted: [] },
        },
        remote: state.connected ? {
          revision: 'remote-1',
          contentHash: 'remote-hash',
          changedFromBase: false,
          changes: { added: [], modified: [], deleted: [] },
        } : undefined,
        sameContent: false,
        canPush: state.connected && state.syncStatus === 'local-ahead',
        canPull: state.connected && state.syncStatus === 'remote-ahead',
        requiresResolution: state.connected && ['never', 'conflict'].includes(state.syncStatus),
      });
      return;
    }

    if (['/api/github-sync/push', '/api/github-sync/pull'].includes(pathname) && request.method() === 'POST') {
      state.syncRequests.push(request);
      if (pathname.endsWith('/pull')) {
        state.profiles = [{ name: 'Pulled profile', templateUrl: '', nodesPath: '', rules: [], inboundRules: [] }];
        state.revision = 2;
      }
      await respond({
        action: 'pushed', revision: 'revision-2', remoteRevision: 'remote-2', contentHash: 'local-hash',
        changes: { added: [], modified: [], deleted: [] },
      });
      return;
    }

    if (pathname === '/api/github-sync/connection' && request.method() === 'PUT') {
      state.connectionRequests.push(request);
      state.connected = true;
      await respond({ connected: true, repository: 'example/private-config', defaultBranch: 'main' });
      return;
    }

    if (pathname === '/api/github-sync/connection' && request.method() === 'DELETE') {
      state.connectionRequests.push(request);
      state.connected = false;
      await respond({ connected: false });
      return;
    }

    if (pathname === '/api/srs-compiler' && request.method() === 'GET') {
      await respond({
        connected: state.connected,
        repository: state.connected ? 'example/private-config' : undefined,
        defaultBranch: state.connected ? 'main' : undefined,
        enabled: false,
        status: 'disabled',
        workflowVersion: 1,
      });
      return;
    }

    if (pathname === '/api/srs-compiler' && request.method() === 'PUT') {
      state.compilerRequests.push(request);
      await respond({
        connected: true,
        repository: 'example/private-config',
        defaultBranch: 'main',
        enabled: request.postDataJSON().enabled,
        status: request.postDataJSON().enabled ? 'ready' : 'disabled',
        workflowVersion: 1,
      });
      return;
    }

    if (/^\/api\/rulesets\/[^/]+\/build$/.test(pathname) && request.method() === 'GET') {
      const rulesetId = decodeURIComponent(pathname.split('/')[3]);
      await respond({
        revision: `revision-${state.revision}`,
        rulesetId,
        status: state.buildStatus,
        compilerAvailable: true,
        formats: { source: true, binary: state.buildStatus === 'ready' },
        build: null,
      });
      return;
    }

    if (/^\/api\/rulesets\/[^/]+\/build$/.test(pathname) && request.method() === 'POST') {
      state.buildRequests.push(request);
      state.buildStatus = 'ready';
      await respond({ accepted: true, jobId: 'job-ruleset' });
      return;
    }

    if (pathname === '/api/assets' && request.method() === 'GET') {
      await respond({ nodes: state.assets, templates: state.templates, rulesets: state.rulesets });
      return;
    }

    if (pathname === '/api/template') {
      const path = new URL(request.url()).searchParams.get('source') ?? '';
      await respond({ content: JSON.parse(state.contents[path] ?? '{}') });
      return;
    }

    if (pathname === '/api/file' && request.method() === 'GET') {
      const path = new URL(request.url()).searchParams.get('path') ?? '';
      const asset = [...state.assets, ...state.rulesets].find((item) => item.path === path);
      if (!asset) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'ASSET_NOT_FOUND' } }),
        });
        return;
      }
      await respond({
        content: state.contents[path] ?? JSON.stringify({ inbounds: [], outbounds: [], note: asset.note }, null, 2),
        sha: `revision-${state.revision}`,
      });
      return;
    }

    if (pathname === '/api/file' && request.method() === 'PUT') {
      state.fileRequests.push(request);
      const payload = request.postDataJSON();
      const document = JSON.parse(payload.content);
      const isRuleset = payload.path.startsWith('sing-sub/rulesets/');
      const target = isRuleset ? state.rulesets : state.assets;
      const next = target.filter((item) => item.path !== payload.oldPath && item.path !== payload.path);
      next.push({ path: payload.path, note: isRuleset ? document._sing_sub?.note ?? '' : document.note ?? '' });
      if (isRuleset) state.rulesets = next; else state.assets = next;
      if (payload.oldPath) delete state.contents[payload.oldPath];
      state.contents[payload.path] = payload.content;
      state.revision += 1;
      await respond({ success: true, revision: `revision-${state.revision}`, content: payload.content });
      return;
    }

    if (pathname === '/api/file' && request.method() === 'DELETE') {
      state.fileRequests.push(request);
      const path = new URL(request.url()).searchParams.get('path');
      state.assets = state.assets.filter((item) => item.path !== path);
      state.rulesets = state.rulesets.filter((item) => item.path !== path);
      if (path) delete state.contents[path];
      await respond({ success: true, revision: 'revision-2' });
      return;
    }

    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'INTERNAL_ERROR' } }),
    });
  });

  return state;
}

async function login(page: Page, state: ReactApiMock) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '初始化工作区' })).toBeVisible();
  await page.getByRole('textbox', { name: '管理员口令', exact: true }).fill('test-admin-password');
  await page.getByRole('button', { name: '初始化', exact: true }).click();

  await expect.poll(() => state.loginRequests.length).toBe(1);
  expect(state.loginRequests[0].postDataJSON()).toEqual({ adminPassword: 'test-admin-password' });
  await expect(page).toHaveURL(/\/#\/profiles$/);
  await expect(page.getByRole('heading', { name: '配置', exact: true })).toBeVisible();
}

test('React entry initializes with a password-only request and guarded route', async ({ page }) => {
  const state = await mockReactApi(page);
  await login(page, state);
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeAttached();
  const brandIcon = page.getByTestId('app-brand-icon');
  await expect(brandIcon).toBeVisible();
  await expect(brandIcon).toHaveAttribute('src', '/favicon.svg');
  const brandIconBox = await brandIcon.boundingBox();
  expect(brandIconBox).not.toBeNull();
  expect(brandIconBox!.width).toBe(36);
  expect(brandIconBox!.height).toBe(36);
  await page.goto('/#/settings/about');
  await expect(page.getByText('v3.1.3', { exact: true })).toBeVisible();
});

test('React entry persists language and color scheme with native Mantine controls', async ({ page }) => {
  await mockReactApi(page, false);
  await page.goto('/#/connect');

  await page.getByRole('button', { name: '切换颜色模式', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');

  await page.getByRole('button', { name: '切换语言', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible();
});

test('React navigation separates nested active states and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockReactApi(page);
  await login(page, state);

  const navigation = page.getByRole('navigation', { name: '主导航' });
  const resourcesLink = navigation.getByRole('link', { name: '资源', exact: true });
  const nodesLink = navigation.getByRole('link', { name: '节点集', exact: true });
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await nodesLink.click();
  await expect(page.getByRole('heading', { name: '节点集', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '打开导航', exact: true }).click();

  const [parentBox, childBox, parentBackground, childBackground] = await Promise.all([
    resourcesLink.boundingBox(),
    nodesLink.boundingBox(),
    resourcesLink.evaluate((element) => getComputedStyle(element).backgroundColor),
    nodesLink.evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(parentBox).not.toBeNull();
  expect(childBox).not.toBeNull();
  expect(childBox!.y - (parentBox!.y + parentBox!.height)).toBeGreaterThanOrEqual(4);
  expect(parentBackground).not.toBe(childBackground);

  const routeSurface = page.getByTestId('route-transition');
  await expect(routeSurface).toHaveCSS('transition-property', 'opacity');
  await expect(routeSurface).toHaveCSS('transition-duration', '0.12s');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await navigation.getByRole('link', { name: '模板', exact: true }).click();
  await expect(page.getByRole('heading', { name: '模板', exact: true })).toBeVisible();
  await expect(page.getByTestId('route-transition')).toHaveCSS('transition-duration', '0s');
});

test('React entry opens mobile navigation and confirms sign out', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await mockReactApi(page);
  await login(page, state);

  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await expect(page.getByRole('link', { name: '同步', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出登录', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('只退出当前设备，不影响数据和其他设备。')).toBeVisible();
  await dialog.getByRole('button', { name: '退出登录', exact: true }).click();

  await expect.poll(() => state.logoutRequests.length).toBe(1);
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible();
  await expect(page).toHaveURL(/\/#\/connect$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('React entry stays within the viewport matrix and keeps modal actions keyboard accessible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await mockReactApi(page);
  await login(page, state);
  await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

  for (const width of [320, 390, 412, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => (
      document.documentElement.scrollWidth - document.documentElement.clientWidth
    )), { message: `viewport ${width}px should settle without horizontal overflow` }).toBeLessThanOrEqual(0);
    const viewport = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      overflow: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return style.display !== 'none' && rect.width > 0
            && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1);
        })
        .slice(0, 5)
        .map((element) => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 40) })),
    }));
    expect(viewport.scrollWidth, JSON.stringify(viewport)).toBeLessThanOrEqual(viewport.clientWidth);
  }

  const newProfile = page.getByRole('button', { name: '新建配置', exact: true }).first();
  await newProfile.focus();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('dialog');
  await expect(editor).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await editor.getByRole('button', { name: '关闭', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(editor).toBeHidden();
});

test('React settings rotate tokens and connect repository with validated Mantine forms', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mockReactApi(page);
  await login(page, state);

  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByRole('tab', { name: '订阅', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '订阅 Token', exact: true })).toHaveValue('subscription-token');

  await page.getByRole('button', { name: '重新生成', exact: true }).click();
  const rotateDialog = page.getByRole('dialog');
  await rotateDialog.getByRole('button', { name: '确认', exact: true }).click();
  await expect.poll(() => state.settingsRequests.length).toBe(1);
  expect(state.settingsRequests[0].postDataJSON()).toEqual({
    expectedRevision: 'revision-1',
    rotateSubscriptionToken: true,
  });

  await page.getByRole('tab', { name: '仓库', exact: true }).click();
  await page.getByRole('textbox', { name: '仓库', exact: true }).fill('example/private-config');
  await page.getByRole('textbox', { name: 'Fine-grained PAT', exact: true }).fill('github-pat');
  await page.getByRole('button', { name: '连接', exact: true }).click();

  await expect.poll(() => state.connectionRequests.length).toBe(1);
  expect(state.connectionRequests[0].postDataJSON()).toEqual({
    owner: 'example',
    repo: 'private-config',
    pat: 'github-pat',
  });
  await expect(page.getByText('example/private-config', { exact: true })).toBeVisible();

  await page.getByRole('switch', { name: 'SRS 编译', exact: true }).press('Space');
  await expect.poll(() => state.compilerRequests.length).toBe(1);
  expect(state.compilerRequests[0].postDataJSON()).toEqual({ enabled: true });
});

test('React resources edit validated JSON with lazy CodeMirror search and replace', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mockReactApi(page);
  const noNotePath = 'sing-sub/nodes/client.json';
  state.assets = [{ path: noNotePath, note: '' }];
  state.contents[noNotePath] = JSON.stringify({ inbounds: [], outbounds: [] }, null, 2);
  await login(page, state);

  await page.getByRole('link', { name: '资源', exact: true }).click();
  await expect(page.getByRole('heading', { name: '节点集' })).toBeVisible();
  await expect(page.getByTestId('code-editor-shell')).toHaveCount(0);
  const noNoteCard = page.getByRole('article', { name: 'client', exact: true });
  await noNoteCard.getByRole('button', { name: '预览 client', exact: true }).click();
  const noNoteDialog = page.getByRole('dialog');
  const noNoteHeader = noNoteDialog.getByTestId('entity-editor-header');
  await expect(noNoteDialog).toHaveAccessibleName('节点集 client');
  await expect(noNoteHeader.getByText('节点集', { exact: true })).toBeVisible();
  await expect(noNoteHeader.getByText('client', { exact: true })).toBeVisible();
  await expect(noNoteHeader.getByRole('button', { name: '关闭', exact: true })).toBeVisible();
  await expect(noNoteDialog.getByText('client', { exact: true })).toHaveCount(1);
  await expect(noNoteDialog.getByText('名称', { exact: true })).toHaveCount(0);
  await expect(noNoteDialog.getByText('备注', { exact: true })).toHaveCount(0);
  await expect(noNoteDialog.getByText('无备注', { exact: true })).toHaveCount(0);
  await expect(noNoteDialog.getByTestId('code-editor-shell')).toHaveCount(0);
  await noNoteDialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(noNoteDialog).toBeHidden();
  await page.getByRole('button', { name: '新建', exact: true }).click();

  const dialog = page.getByRole('dialog');
  const jsonEditor = dialog.getByRole('textbox', { name: 'JSON 编辑器', exact: true });
  const editorShell = dialog.getByTestId('code-editor-shell');
  const editorToolbar = dialog.getByTestId('code-editor-toolbar');
  const nameEditor = dialog.getByRole('textbox', { name: '名称', exact: true });
  const saveButton = dialog.getByRole('button', { name: '保存', exact: true });
  const replaceEditorContent = async (content: string) => {
    await jsonEditor.click();
    await jsonEditor.press('Control+a');
    await jsonEditor.press('Backspace');
    await page.keyboard.insertText(content);
  };
  await expect(editorShell).toBeVisible();
  await expect(editorToolbar).toBeVisible();
  await expect(jsonEditor).toHaveAttribute('contenteditable', 'true');
  await expect(editorShell.getByText('1', { exact: true }).first()).toBeVisible();
  await replaceEditorContent('{');
  await nameEditor.click();
  await expect(saveButton).toBeDisabled();
  await replaceEditorContent('{"inbounds":[],"outbounds":[],"label":"edge-label edge-label"}');
  await nameEditor.fill('edge-nodes');
  await expect.poll(() => jsonEditor.evaluate((element) => (element as HTMLElement).innerText)).toBe(
    '{\n  "inbounds": [],\n  "outbounds": [],\n  "label": "edge-label edge-label"\n}',
  );
  await expect(dialog.getByRole('button', { name: '格式化 JSON', exact: true })).toBeVisible();
  await jsonEditor.press('Control+f');
  const findInput = page.getByRole('textbox', { name: '查找', exact: true });
  await expect(findInput).toBeVisible();
  await findInput.fill('edge-label');
  await page.getByRole('button', { name: '下一个匹配项', exact: true }).click();
  await expect(editorShell.locator('[aria-live="polite"]')).toContainText('edge-label');
  await jsonEditor.press('Control+h');
  const replaceInput = page.getByRole('textbox', { name: '替换为', exact: true });
  await expect(replaceInput).toBeVisible();
  await replaceInput.fill('node-label');
  await page.setViewportSize({ width: 320, height: 900 });
  const [findBox, replaceAllBox] = await Promise.all([
    findInput.boundingBox(), page.getByRole('button', { name: '全部替换', exact: true }).boundingBox(),
  ]);
  expect(findBox).not.toBeNull();
  expect(replaceAllBox).not.toBeNull();
  for (const box of [findBox!, replaceAllBox!]) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  for (const control of await editorToolbar.getByRole('button').all()) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(43.9);
    expect(box!.height).toBeGreaterThanOrEqual(43.9);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '替换当前项', exact: true }).click();
  await expect(jsonEditor).toContainText('"label": "node-label edge-label"');
  await page.getByRole('button', { name: '全部替换', exact: true }).click();
  await expect(jsonEditor).toContainText('"label": "node-label node-label"');
  await dialog.getByRole('textbox', { name: '备注', exact: true }).fill('Edge nodes');
  await saveButton.click();

  await expect.poll(() => state.fileRequests.length).toBe(1);
  const payload = state.fileRequests[0].postDataJSON();
  expect(payload).toMatchObject({
    path: 'sing-sub/nodes/edge-nodes.json',
    expectedRevision: 'revision-1',
    sha: null,
  });
  expect(JSON.parse(payload.content)).toMatchObject({ note: 'Edge nodes', inbounds: [], outbounds: [] });
  await expect(dialog).toBeHidden();
  await expect(page.getByText('edge-nodes', { exact: true })).toBeVisible();

  const assetCard = page.getByRole('article', { name: 'edge-nodes', exact: true });
  await expect(assetCard.getByText('NODE', { exact: true })).toHaveCount(0);
  await assetCard.getByRole('button', { name: '预览 edge-nodes', exact: true }).press('Enter');
  const previewDialog = page.getByRole('dialog');
  const previewHeader = previewDialog.getByTestId('entity-editor-header');
  await expect(previewDialog).toHaveAccessibleName('节点集 edge-nodes');
  await expect(previewHeader.getByText('节点集', { exact: true })).toBeVisible();
  await expect(previewHeader.getByText('edge-nodes', { exact: true })).toBeVisible();
  await expect(previewHeader.getByText('Edge nodes', { exact: true })).toBeVisible();
  await expect(previewHeader.getByRole('button', { name: '关闭', exact: true })).toBeVisible();
  const [previewNameBox, previewNoteBox] = await Promise.all([
    previewHeader.getByTestId('entity-editor-name').boundingBox(),
    previewHeader.getByTestId('entity-editor-note').boundingBox(),
  ]);
  expect(previewNameBox).not.toBeNull();
  expect(previewNoteBox).not.toBeNull();
  expect(previewNoteBox!.x - (previewNameBox!.x + previewNameBox!.width)).toBeGreaterThanOrEqual(0);
  expect(previewNoteBox!.x - (previewNameBox!.x + previewNameBox!.width)).toBeLessThanOrEqual(16);
  await expect(previewDialog.getByText('edge-nodes', { exact: true })).toHaveCount(1);
  await expect(previewDialog.getByText('名称', { exact: true })).toHaveCount(0);
  await expect(previewDialog.getByText('备注', { exact: true })).toHaveCount(0);
  await expect(previewDialog.getByText('Edge nodes', { exact: true })).toBeVisible();
  await expect(previewDialog.getByRole('textbox', { name: '名称', exact: true })).toHaveCount(0);
  await expect(previewDialog.getByRole('textbox', { name: '备注', exact: true })).toHaveCount(0);
  await expect(previewDialog.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
  await expect(previewDialog.getByText('"inbounds": []', { exact: false })).toBeVisible();
  const modeGeometry = await page.getByTestId('resource-mode-control').evaluate((root) => {
    const checked = root.querySelector<HTMLInputElement>('input[type="radio"]:checked');
    const label = checked ? root.querySelector<HTMLLabelElement>(`label[for="${checked.id}"]`) : null;
    const indicator = [...root.children].find((child) => getComputedStyle(child).position === 'absolute');
    if (!label || !indicator) return null;
    const labelRect = label.getBoundingClientRect();
    const indicatorRect = indicator.getBoundingClientRect();
    return {
      labelX: labelRect.x,
      labelWidth: labelRect.width,
      indicatorX: indicatorRect.x,
      indicatorWidth: indicatorRect.width,
    };
  });
  expect(modeGeometry).not.toBeNull();
  expect(Math.abs(modeGeometry!.indicatorX - modeGeometry!.labelX)).toBeLessThanOrEqual(1);
  expect(Math.abs(modeGeometry!.indicatorWidth - modeGeometry!.labelWidth)).toBeLessThanOrEqual(1);
  const [previewHeaderBox, previewDialogBox] = await Promise.all([
    previewHeader.boundingBox(), previewDialog.boundingBox(),
  ]);
  await previewDialog.getByText('编辑', { exact: true }).click();
  const transitionDialogBoxes = await page.evaluate(async () => {
    const samples: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (let index = 0; index < 12; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const rect = document.querySelector<HTMLElement>('[role="dialog"]')?.getBoundingClientRect();
      if (rect) samples.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    }
    return samples;
  });
  await expect(previewHeader.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('edge-nodes');
  await expect(previewHeader.getByRole('textbox', { name: '备注', exact: true })).toHaveValue('Edge nodes');
  await expect(previewDialog.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  const [editHeaderBox, editDialogBox] = await Promise.all([
    previewHeader.boundingBox(), previewDialog.boundingBox(),
  ]);
  expect(previewHeaderBox).not.toBeNull();
  expect(previewDialogBox).not.toBeNull();
  expect(editHeaderBox).not.toBeNull();
  expect(editDialogBox).not.toBeNull();
  expect(Math.abs(previewHeaderBox!.height - editHeaderBox!.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(previewDialogBox!.height - editDialogBox!.height)).toBeLessThanOrEqual(1);
  for (const sample of transitionDialogBoxes) {
    expect(Math.abs(sample.x - previewDialogBox!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.y - previewDialogBox!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.width - previewDialogBox!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(sample.height - previewDialogBox!.height)).toBeLessThanOrEqual(1);
  }
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();

  await page.setViewportSize({ width: 320, height: 900 });
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(0);
  for (const control of [
    assetCard.getByRole('button', { name: '编辑', exact: true }),
    assetCard.getByRole('button', { name: '更多操作', exact: true }),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await assetCard.getByRole('button', { name: '预览 edge-nodes', exact: true }).press('Enter');
  const mobilePreviewDialog = page.getByRole('dialog');
  await expect(mobilePreviewDialog.getByText('"inbounds": []', { exact: false })).toBeVisible();
  expect(await mobilePreviewDialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  await mobilePreviewDialog.getByRole('button', { name: '关闭', exact: true }).click();

  await assetCard.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除文件', exact: true }).click();
  await expect(dialog.getByText('确定删除 edge-nodes 吗？引用该文件的配置可能会被更新。', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
});

test('React profiles create, preview, copy, duplicate, and delete through Mantine dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const state = await mockReactApi(page);
  await login(page, state);

  await page.getByRole('button', { name: '新建配置', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('smoke-profile');
  await dialog.getByRole('textbox', { name: '备注', exact: true }).fill('Primary subscription');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();

  await expect.poll(() => state.stateRequests.length).toBe(1);
  expect(state.stateRequests[0].postDataJSON()).toMatchObject({
    expectedRevision: 'revision-1',
    profileName: 'smoke-profile',
    state: { profiles: [{ name: 'smoke-profile', note: 'Primary subscription', order: 0 }] },
  });
  await expect(page.getByText('smoke-profile', { exact: true })).toBeVisible();

  const profileCard = page.getByRole('article', { name: 'smoke-profile', exact: true });
  await page.setViewportSize({ width: 320, height: 900 });
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(0);
  const [dragBox, titleBox, editBox, moreBox] = await Promise.all([
    profileCard.getByRole('button', { name: '调整配置顺序', exact: true }).boundingBox(),
    profileCard.getByText('smoke-profile', { exact: true }).boundingBox(),
    profileCard.getByRole('button', { name: '编辑', exact: true }).boundingBox(),
    profileCard.getByRole('button', { name: '更多操作', exact: true }).boundingBox(),
  ]);
  expect(dragBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(editBox).not.toBeNull();
  expect(moreBox).not.toBeNull();
  expect(dragBox!.x).toBeLessThan(titleBox!.x);
  expect(editBox!.x).toBeGreaterThan(titleBox!.x);
  for (const box of [dragBox!, editBox!, moreBox!]) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await profileCard.getByRole('button', { name: '预览 smoke-profile', exact: true }).press('Enter');
  dialog = page.getByRole('dialog');
  const profileHeader = dialog.getByTestId('entity-editor-header');
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  await expect(dialog).toHaveAccessibleName('配置 smoke-profile');
  await expect(profileHeader.getByText('配置', { exact: true })).toBeVisible();
  await expect(profileHeader.getByText('smoke-profile', { exact: true })).toBeVisible();
  await expect(profileHeader.getByText('Primary subscription', { exact: true })).toBeVisible();
  await expect(profileHeader.getByRole('button', { name: '关闭', exact: true })).toBeVisible();
  const [profilePreviewNameBox, profilePreviewNoteBox] = await Promise.all([
    profileHeader.getByTestId('entity-editor-name').boundingBox(),
    profileHeader.getByTestId('entity-editor-note').boundingBox(),
  ]);
  expect(profilePreviewNameBox).not.toBeNull();
  expect(profilePreviewNoteBox).not.toBeNull();
  expect(profilePreviewNoteBox!.x - (profilePreviewNameBox!.x + profilePreviewNameBox!.width)).toBeGreaterThanOrEqual(0);
  expect(profilePreviewNoteBox!.x - (profilePreviewNameBox!.x + profilePreviewNameBox!.width)).toBeLessThanOrEqual(16);
  await expect(dialog.getByText('smoke-profile', { exact: true })).toHaveCount(1);
  await expect(dialog.getByText('名称', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('备注', { exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Primary subscription', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: '名称', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: '备注', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '保存', exact: true })).toHaveCount(0);
  await expect(dialog.getByText('"profile": "smoke-profile"', { exact: false })).toBeVisible();
  await dialog.getByText('编辑', { exact: true }).click();
  const profileNameInput = profileHeader.getByRole('textbox', { name: '名称', exact: true });
  const profileNoteInput = profileHeader.getByRole('textbox', { name: '备注', exact: true });
  await expect(profileNameInput).toHaveValue('smoke-profile');
  await expect(profileNoteInput).toHaveValue('Primary subscription');
  const [headerBox, nameInputBox, noteInputBox, closeBox] = await Promise.all([
    profileHeader.boundingBox(),
    profileNameInput.boundingBox(),
    profileNoteInput.boundingBox(),
    profileHeader.getByRole('button', { name: '关闭', exact: true }).boundingBox(),
  ]);
  expect(headerBox).not.toBeNull();
  expect(nameInputBox).not.toBeNull();
  expect(noteInputBox).not.toBeNull();
  expect(closeBox).not.toBeNull();
  expect(nameInputBox!.x).toBeLessThan(noteInputBox!.x);
  expect(noteInputBox!.x).toBeLessThan(closeBox!.x);
  expect(Math.abs(nameInputBox!.y - noteInputBox!.y)).toBeLessThanOrEqual(1);
  expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width + 1);
  expect(await profileHeader.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  const profileEditorViewport = dialog.getByLabel('配置编辑内容', { exact: true });
  const profileEditorActions = dialog.getByTestId('profile-editor-actions');
  const profileSave = dialog.getByRole('button', { name: '保存', exact: true });
  await expect(profileEditorViewport).toBeVisible();
  await expect(profileSave).toBeVisible();
  expect(await profileSave.evaluate((button) => !button.closest('[aria-label="配置编辑内容"]'))).toBe(true);
  const [dialogBox, editorViewportBox, editorActionsBox] = await Promise.all([
    dialog.boundingBox(), profileEditorViewport.boundingBox(), profileEditorActions.boundingBox(),
  ]);
  expect(dialogBox).not.toBeNull();
  expect(editorViewportBox).not.toBeNull();
  expect(editorActionsBox).not.toBeNull();
  expect(editorActionsBox!.y - (editorViewportBox!.y + editorViewportBox!.height)).toBeLessThanOrEqual(24);
  expect(dialogBox!.y + dialogBox!.height - (editorActionsBox!.y + editorActionsBox!.height)).toBeLessThanOrEqual(32);
  const tallEditorHeight = editorViewportBox!.height;
  await page.setViewportSize({ width: 320, height: 700 });
  const [shortDialogBox, shortEditorViewportBox, shortEditorActionsBox] = await Promise.all([
    dialog.boundingBox(), profileEditorViewport.boundingBox(), profileEditorActions.boundingBox(),
  ]);
  expect(shortDialogBox).not.toBeNull();
  expect(shortEditorViewportBox).not.toBeNull();
  expect(shortEditorActionsBox).not.toBeNull();
  expect(tallEditorHeight - shortEditorViewportBox!.height).toBeGreaterThanOrEqual(190);
  expect(shortEditorActionsBox!.y - (shortEditorViewportBox!.y + shortEditorViewportBox!.height)).toBeLessThanOrEqual(24);
  expect(shortDialogBox!.y + shortDialogBox!.height - (shortEditorActionsBox!.y + shortEditorActionsBox!.height)).toBeLessThanOrEqual(32);
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();

  await page.getByRole('button', { name: '订阅', exact: true }).click();
  await expect(page.getByRole('button', { name: '已复制', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制配置', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('smoke-profile_copy');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect.poll(() => state.stateRequests.length).toBe(2);
  await expect(page.getByText('smoke-profile_copy', { exact: true })).toBeVisible();

  await profileCard.getByRole('button', { name: '预览 smoke-profile', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByText('"profile": "smoke-profile"', { exact: false })).toBeVisible();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();

  const copyCard = page.getByRole('article', { name: 'smoke-profile_copy' });
  await copyCard.getByRole('button', { name: '更多操作', exact: true }).click();
  await page.getByRole('menuitem', { name: '删除配置', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '删除', exact: true }).click();
  await expect.poll(() => state.stateRequests.length).toBe(3);
  await expect(page.getByText('smoke-profile_copy', { exact: true })).toBeHidden();
});

test('React profile filters preserve protocol semantics without overflowing mobile layouts', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const state = await mockReactApi(page);
  const nodesPath = 'sing-sub/nodes/filter-nodes.json';
  state.assets = [{ path: nodesPath, note: 'Filter nodes' }];
  state.contents[nodesPath] = JSON.stringify({
    inbounds: [
      { type: 'vless', tag: 'home-vr-in' },
      { type: 'trojan', tag: 'very-long-mobile-node-name-that-must-not-overflow-the-profile-editor-in' },
      { type: 'custom', tag: 'unknown-in' },
    ],
    outbounds: [],
  });
  await login(page, state);

  await page.getByRole('button', { name: '新建配置', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: '节点集', exact: true }).click();
  await page.getByRole('option', { name: 'filter-nodes', exact: true }).click();
  await dialog.getByRole('textbox', { name: '关键词', exact: true }).fill('in');

  const matches = dialog.getByLabel('匹配的节点', { exact: true });
  const preferred = matches.getByLabel('VLESS，优先，home-vr-in', { exact: true });
  const discouraged = matches.getByLabel(
    'TROJAN，不推荐，very-long-mobile-node-name-that-must-not-overflow-the-profile-editor-in',
    { exact: true },
  );
  const unknown = matches.getByLabel('CUSTOM，未分级，unknown-in', { exact: true });
  await expect(preferred).toBeVisible();
  await expect(discouraged).toBeVisible();
  await expect(unknown).toBeVisible();

  const [preferredColor, discouragedColor] = await Promise.all([
    preferred.evaluate((element) => getComputedStyle(element).color),
    discouraged.evaluate((element) => getComputedStyle(element).color),
  ]);
  expect(preferredColor).not.toBe(discouragedColor);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ))).toBeLessThanOrEqual(0);

  const matchesBox = await matches.boundingBox();
  expect(matchesBox).not.toBeNull();
  for (const badge of [preferred, discouraged, unknown]) {
    const box = await badge.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(matchesBox!.x + matchesBox!.width + 1);
  }
});

test('React rulesets edit structured sources and manual rules, retry builds, and expose the SRS link', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const state = await mockReactApi(page);
  const path = 'sing-sub/rulesets/smoke-rules.json';
  state.rulesets = [{ path, note: 'Smoke rules' }];
  state.contents[path] = JSON.stringify({
    version: 2,
    rules: [],
    _sing_sub: {
      note: 'Smoke rules',
      sources: [{
        url: 'https://example.com/rules.json',
        interval_hours: 168,
        last_updated: '2026-07-30T12:34:00.000Z',
      }],
    },
  }, null, 2);
  state.buildStatus = 'failed';
  await login(page, state);

  await page.getByRole('link', { name: '规则集', exact: true }).click();
  const card = page.getByRole('article', { name: 'smoke-rules' });
  await expect(card.getByText('编译失败', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: '重新编译', exact: true }).click();
  await expect.poll(() => state.buildRequests.length).toBe(1);
  await expect(card.getByRole('button', { name: '复制 SRS 链接', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '新建', exact: true }).click();
  const newDialog = page.getByRole('dialog');
  for (const sectionName of [
    'SOURCE 每行一个 HTTPS URL。',
    'DOMAIN 每行一个完整域名。',
    'DOMAIN_SUFFIX 每行一个域名后缀。',
    'DOMAIN_KEYWORD 每行一个域名关键字。',
    'DOMAIN_REGEX 每行一个 RE2 域名正则表达式。',
  ]) {
    await expect(newDialog.getByRole('button', { name: sectionName, exact: true })).toHaveAttribute('aria-expanded', 'false');
  }
  await newDialog.getByRole('button', { name: '取消', exact: true }).click();

  await card.getByRole('button', { name: '编辑', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('SOURCE', { exact: true })).toHaveCount(1);
  await expect(dialog.getByText('DOMAIN', { exact: true })).toHaveCount(1);
  await expect(dialog.getByText('更新周期', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'SOURCE 每行一个 HTTPS URL。', exact: true })).toHaveAttribute('aria-expanded', 'true');
  const domainSection = dialog.getByRole('button', { name: 'DOMAIN 每行一个完整域名。', exact: true });
  await expect(domainSection).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByRole('textbox', { name: 'SOURCE', exact: true })).toHaveValue('https://example.com/rules.json');
  const sourceControls = dialog.getByTestId('ruleset-source-controls');
  const intervalSelect = dialog.getByRole('combobox', { name: '更新周期', exact: true });
  const sourceDelete = dialog.getByRole('button', { name: '删除 SOURCE', exact: true });
  await expect(sourceControls.getByText('最近更新', { exact: false })).toContainText('2026');
  expect(await intervalSelect.evaluate((element) => Boolean(element.closest('[data-testid="ruleset-source-controls"]')))).toBe(true);
  expect(await sourceDelete.evaluate((element) => Boolean(element.closest('[data-testid="ruleset-source-controls"]')))).toBe(true);
  await intervalSelect.click();
  await page.getByRole('option', { name: '每天', exact: true }).click();
  await domainSection.click();
  await dialog.getByRole('textbox', { name: 'DOMAIN', exact: true }).fill('example.com\nwww.example.com');
  await page.setViewportSize({ width: 320, height: 900 });
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  const [dialogBox, sourceControlsBox, intervalBox, sourceDeleteBox] = await Promise.all([
    dialog.boundingBox(), sourceControls.boundingBox(), intervalSelect.boundingBox(), sourceDelete.boundingBox(),
  ]);
  expect(dialogBox).not.toBeNull();
  expect(sourceControlsBox).not.toBeNull();
  expect(intervalBox).not.toBeNull();
  expect(sourceDeleteBox).not.toBeNull();
  for (const box of [sourceControlsBox!, intervalBox!, sourceDeleteBox!]) {
    expect(box.x).toBeGreaterThanOrEqual(dialogBox!.x);
    expect(box.x + box.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1);
  }
  await dialog.getByRole('button', { name: '保存', exact: true }).click();

  await expect.poll(() => state.fileRequests.length).toBe(1);
  const payload = state.fileRequests[0].postDataJSON();
  expect(payload.path).toBe(path);
  expect(JSON.parse(payload.content)).toMatchObject({
    version: 2,
    _sing_sub: {
      note: 'Smoke rules',
      sources: [{
        url: 'https://example.com/rules.json',
        interval_hours: 24,
        last_updated: '2026-07-30T12:34:00.000Z',
      }],
      manual: { domain: ['example.com', 'www.example.com'] },
    },
  });
});

test('React sync pushes with the current revision after status preflight', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const state = await mockReactApi(page);
  await login(page, state);
  state.connected = true;

  await page.getByRole('link', { name: '同步', exact: true }).click();
  await expect(page.getByText('R2 有新修改', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '推送到 GitHub', exact: true }).click();

  await expect.poll(() => state.syncRequests.length).toBe(1);
  expect(state.syncRequests[0].postDataJSON()).toEqual({ expectedRevision: 'revision-1', resolution: 'safe' });
});


test('React filter modes respond to clicks and keyboard before and after entering keywords', async ({ page }) => {
  const state = await mockReactApi(page);
  const templatePath = 'sing-sub/templates/filters.json';
  state.templates = [{ path: templatePath, note: '' }];
  state.contents[templatePath] = JSON.stringify({ outbounds: [{ type: 'selector', tag: 'proxy', outbounds: [] }] });
  await login(page, state);
  await page.getByRole('button', { name: '新建配置', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: '适配器', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '适配器', exact: true })).toHaveCount(0);
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('filter-check');
  await dialog.getByRole('combobox', { name: '模板', exact: true }).click();
  await page.getByRole('option', { name: 'filters', exact: true }).click();
  const modes = dialog.getByRole('combobox', { name: /筛选方式/ });
  await expect(modes).toHaveCount(2);
  const keywords = dialog.getByRole('textbox', { name: '关键词', exact: true });
  for (let index = 0; index < 2; index += 1) {
    const mode = modes.nth(index);
    await mode.click();
    await page.getByRole('option', { name: '排除', exact: true }).click();
    await expect(mode).toHaveValue('排除');
    await keywords.nth(index).fill('HK');
    await expect(mode).toHaveValue('排除');
    await keywords.nth(index).fill('');
    await expect(mode).toHaveValue('排除');
    await mode.focus();
    await mode.press('ArrowDown');
    await mode.press('ArrowUp');
    await mode.press('Enter');
    await expect(mode).toHaveValue('包含');
    await mode.click();
    await page.getByRole('option', { name: '排除', exact: true }).click();
    await expect(mode).toHaveValue('排除');
  }
  await dialog.getByText('预览', { exact: true }).click();
  await expect.poll(() => state.previewRequests.length).toBeGreaterThan(0);
  expect(state.previewRequests.at(-1)!.postDataJSON()).toMatchObject({ rules: [], inboundRules: [] });
  await dialog.getByText('编辑', { exact: true }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(modes.nth(index)).toHaveValue('排除');
    await keywords.nth(index).fill('HK');
  }
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(state.profiles[0]).toMatchObject({
    rules: [{ group: 'proxy', filters: [{ action: 'exclude', keyword: 'HK' }] }],
    inboundRules: [{ tag: 'global-inbounds', filters: [{ action: 'exclude', keyword: 'HK' }] }],
  });
  await page.getByRole('article', { name: 'filter-check', exact: true }).getByRole('button', { name: '编辑', exact: true }).click();
  await expect(modes.nth(0)).toHaveValue('排除');
  await expect(modes.nth(1)).toHaveValue('排除');
  await page.screenshot({ path: test.info().outputPath('filter-modes.png'), fullPage: true });
});

for (const syncStatus of ['never', 'conflict', 'local-ahead', 'remote-ahead'] as const) {
  for (const direction of ['push', 'pull'] as const) {
    test('React sync confirms manual ' + direction + ' from ' + syncStatus, async ({ page }) => {
      const state = await mockReactApi(page);
      state.authenticated = true;
      state.connected = true;
      state.syncStatus = syncStatus;
      await page.goto('/#/sync');
      const button = page.getByRole('button', { name: direction === 'push' ? '推送到 GitHub' : '从 GitHub 拉取', exact: true });
      await expect(button).toBeEnabled();
      await button.click();
      const safe = direction === 'push' ? syncStatus === 'local-ahead' : syncStatus === 'remote-ahead';
      if (!safe) {
        const dialog = page.getByRole('dialog', { name: '确认覆盖数据' });
        await expect(dialog.getByText(direction === 'push' ? '用当前 R2 数据覆盖 GitHub 受管文件。' : '用 GitHub 内容覆盖当前 R2 数据。')).toBeVisible();
        expect(state.syncRequests).toHaveLength(0);
        await dialog.getByRole('button', { name: '取消', exact: true }).click();
        await expect(dialog).toBeHidden();
        expect(state.syncRequests).toHaveLength(0);
        await button.click();
        await dialog.getByRole('button', { name: '确认', exact: true }).click();
      }
      await expect.poll(() => state.syncRequests.length).toBe(1);
      expect(new URL(state.syncRequests[0].url()).pathname).toBe('/api/github-sync/' + direction);
      expect(state.syncRequests[0].postDataJSON()).toEqual({ expectedRevision: 'revision-1', resolution: safe ? 'safe' : 'overwrite' });
      if (direction === 'pull') {
        await expect(page.getByRole('button', { name: '从 GitHub 拉取', exact: true })).toBeEnabled();
        const menu = page.getByRole('button', { name: '打开导航', exact: true });
        if (await menu.isVisible()) await menu.click();
        await page.getByRole('link', { name: '配置', exact: true }).click();
        await expect(page.getByText('Pulled profile', { exact: true })).toBeVisible();
      }
    });
  }
}
