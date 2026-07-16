import { expect, test, type Page, type Request } from '@playwright/test';

const settings = {
  owner: 'example',
  repo: 'private-config',
  pat: '',
  subToken: 'subscription-token',
  userLogin: 'sing-sub-user',
  userAvatar: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
  defaultBranch: 'main',
};

interface ApiMockState {
  authenticated: boolean;
  revision: number;
  stateRequests: Request[];
  fileRequests: Request[];
  syncRequests: Request[];
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === 'mobile-chromium'
    ? { width: 412, height: 915 }
    : { width: 1440, height: 900 });
});

async function mockApi(page: Page, setupRequired = true): Promise<ApiMockState> {
  await page.addInitScript(() => {
    localStorage.setItem('sing-sub.locale', 'zh-CN');
  });
  const mockState: ApiMockState = {
    authenticated: false,
    revision: 1,
    stateRequests: [],
    fileRequests: [],
    syncRequests: [],
  };

  const apiPattern = new URL('/api/**', process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173').toString();
  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = async (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ data: body }),
    });

    if (url.pathname === '/api/bootstrap') {
      await json(mockState.authenticated
        ? { settings, state: { profiles: [] }, revision: `revision-${mockState.revision}`, setupRequired: false }
        : { settings: null, setupRequired });
      return;
    }
    if (url.pathname === '/api/login' && request.method() === 'POST') {
      mockState.authenticated = true;
      await json({ ...settings, revision: `revision-${mockState.revision}` });
      return;
    }
    if (url.pathname === '/api/state' && request.method() === 'PUT') {
      mockState.stateRequests.push(request);
      mockState.revision += 1;
      await json({ revision: `revision-${mockState.revision}` });
      return;
    }
    if (url.pathname === '/api/assets') {
      await json({ nodes: [], templates: [], adapters: [], rulesets: [] });
      return;
    }
    if (url.pathname === '/api/file' && request.method() === 'PUT') {
      mockState.fileRequests.push(request);
      mockState.revision += 1;
      await json({ success: true, revision: `revision-${mockState.revision}` });
      return;
    }
    if (url.pathname === '/api/github-sync' && request.method() === 'GET') {
      await json({
        connected: true,
        repository: 'example/private-config',
        defaultBranch: 'main',
        status: 'local-ahead',
        local: {
          revision: `revision-${mockState.revision}`,
          contentHash: 'local-hash',
          changedFromBase: true,
          changes: { added: ['sing-sub/configs/new.json'], modified: [], deleted: [] },
        },
        remote: {
          revision: 'remote-1',
          contentHash: 'remote-hash',
          changedFromBase: false,
          changes: { added: [], modified: [], deleted: [] },
        },
        sameContent: false,
        canPush: true,
        canPull: false,
        requiresResolution: false,
      });
      return;
    }
    if (url.pathname === '/api/github-sync/push' && request.method() === 'POST') {
      mockState.syncRequests.push(request);
      await json({
        action: 'pushed',
        revision: `revision-${mockState.revision}`,
        remoteRevision: 'remote-2',
        contentHash: 'local-hash',
        changes: { added: ['sing-sub/configs/new.json'], modified: [], deleted: [] },
      });
      return;
    }
    if (url.pathname === '/api/srs-compiler' && request.method() === 'GET') {
      await json({ connected: true, repository: 'example/private-config', defaultBranch: 'main', enabled: false, status: 'disabled', workflowVersion: 1 });
      return;
    }
    if (/^\/api\/rulesets\/[^/]+\/build$/.test(url.pathname) && request.method() === 'GET') {
      const rulesetId = decodeURIComponent(url.pathname.split('/')[3]);
      await json({
        revision: `revision-${mockState.revision}`,
        rulesetId,
        status: 'none',
        compilerAvailable: false,
        formats: { source: true, binary: false },
        build: null,
      });
      return;
    }
    await json({ error: `Unhandled mock route: ${request.method()} ${url.pathname}` }, 500);
  });

  return mockState;
}

async function expectNavigation(page: Page): Promise<void> {
  const desktopNavigation = page.getByRole('navigation', { name: /主导航|Main navigation/ });
  const desktopViewport = await page.evaluate(() => window.matchMedia('(min-width: 1024px)').matches);
  if (!desktopViewport) {
    await page.getByRole('button', { name: /打开导航|Open navigation/ }).click();
    const mobileNavigation = page.getByRole('navigation', { name: /移动导航|Mobile navigation/ });
    await expect(mobileNavigation).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(mobileNavigation).toBeHidden();
    return;
  }
  await expect(desktopNavigation).toBeVisible();
}

async function navigateTo(page: Page, name: string): Promise<void> {
  const desktopNavigation = page.getByRole('navigation', { name: /主导航|Main navigation/ });
  const desktopViewport = await page.evaluate(() => window.matchMedia('(min-width: 1024px)').matches);
  if (!desktopViewport) {
    await page.getByRole('button', { name: /打开导航|Open navigation/ }).click();
    await page.getByRole('navigation', { name: /移动导航|Mobile navigation/ }).getByRole('link', { name }).click();
    return;
  }
  await desktopNavigation.getByRole('link', { name }).click();
}

test('logs in to an existing workspace on mobile with a password-only request', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mockState = await mockApi(page, false);

  await page.goto('/');
  await page.locator('input[type="password"]').fill('test-admin-password');
  const loginRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname === '/api/login' && request.method() === 'POST');
  await page.locator('form button[type="submit"]').click();
  const request = await loginRequest;

  expect(request.postDataJSON()).toEqual({ adminPassword: 'test-admin-password' });
  expect(mockState.authenticated).toBe(true);
  await expectNavigation(page);
});

test('initializes an empty workspace without GitHub credentials', async ({ page }) => {
  const mockState = await mockApi(page);

  await page.goto('/');
  await page.locator('input[type="password"]').first().fill('test-admin-password');
  const loginRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname === '/api/login' && request.method() === 'POST');
  await page.locator('form button[type="submit"]').click();
  const request = await loginRequest;

  expect(request.postDataJSON()).toEqual({ adminPassword: 'test-admin-password' });
  expect(mockState.authenticated).toBe(true);
  await expectNavigation(page);
});

async function login(page: Page, mockState: ApiMockState): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '初始化工作区' })).toBeVisible();
  await page.getByPlaceholder('管理员口令').fill('test-admin-password');

  const loginRequest = page.waitForRequest(request =>
    new URL(request.url()).pathname === '/api/login' && request.method() === 'POST');
  await page.locator('form button[type="submit"]').click();
  const request = await loginRequest;

  expect(request.postDataJSON()).toEqual({ adminPassword: 'test-admin-password' });
  expect(mockState.authenticated).toBe(true);
  await expectNavigation(page);
  await expect(page.getByRole('heading', { name: '配置' })).toBeVisible();
}

test('logs in and creates a profile', async ({ page }) => {
  const mockState = await mockApi(page);
  await login(page, mockState);

  await page.getByRole('button', { name: '新建' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('输入配置名称').fill('smoke-profile');

  const saveButton = dialog.getByRole('button', { name: '保存' });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect.poll(() => mockState.stateRequests.length).toBe(1);
  const payload = mockState.stateRequests[0].postDataJSON();
  expect(payload.profileName).toBe('smoke-profile');
  expect(payload.state.profiles).toHaveLength(1);
  expect(payload.state.profiles[0]).toMatchObject({ name: 'smoke-profile', order: 0 });
  await expect(dialog).toBeHidden();
});

test('creates node, adapter, and ruleset assets', async ({ page }) => {
  const mockState = await mockApi(page);
  await login(page, mockState);

  await navigateTo(page, '节点集');
  await expect(page.getByRole('heading', { name: '节点集' })).toBeVisible();
  await expect(page.getByText('暂无节点集。')).toBeVisible();

  await page.getByRole('button', { name: '新建' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('输入文件名称').fill('smoke-nodes');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect.poll(() => mockState.fileRequests.length).toBe(1);

  const nodePayload = mockState.fileRequests[0].postDataJSON();
  expect(nodePayload).toMatchObject({
    path: 'sing-sub/nodes/smoke-nodes.json',
    sha: null,
    message: 'Create smoke-nodes.json',
  });
  expect(JSON.parse(nodePayload.content)).toEqual({ inbounds: [], outbounds: [] });

  await navigateTo(page, '适配器');
  await expect(page.getByText('暂无适配器。')).toBeVisible();
  await page.getByRole('button', { name: '新建' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('输入文件名').fill('smoke-adapter');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect.poll(() => mockState.fileRequests.length).toBe(2);
  const adapterPayload = mockState.fileRequests[1].postDataJSON();
  expect(adapterPayload.path).toBe('sing-sub/adapters/smoke-adapter.json');
  expect(JSON.parse(adapterPayload.content)).toEqual({
    schemaVersion: 1,
    name: 'smoke-adapter',
    replacements: [{ path: ['inbounds'], value: [] }],
  });

  await navigateTo(page, '规则集');
  await expect(page.getByText('暂无规则集。')).toBeVisible();
  await page.getByRole('button', { name: '新建' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('输入文件名称').fill('smoke-rules');
  await dialog.getByRole('button', { name: '保存' }).click();
  await expect.poll(() => mockState.fileRequests.length).toBe(3);

  const rulesetPayload = mockState.fileRequests[2].postDataJSON();
  expect(rulesetPayload.path).toBe('sing-sub/rulesets/smoke-rules.json');
  expect(JSON.parse(rulesetPayload.content)).toEqual({
    version: 2,
    rules: [],
    _sing_sub: { sources: [] },
  });
  await expect(page.getByRole('button', { name: '复制 JSON 链接' })).toBeVisible();
});

test('retries a failed ruleset build and exposes the SRS link when ready', async ({ page }) => {
  const mockState = await mockApi(page);
  let buildStatus: 'failed' | 'ready' = 'failed';

  await page.route('**/api/assets', async route => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          nodes: [],
          templates: [],
          adapters: [],
          rulesets: [{ path: 'sing-sub/rulesets/smoke-rules.json', note: '' }],
        },
      }),
    });
  });
  await page.route('**/api/rulesets/smoke-rules/build', async route => {
    if (route.request().method() === 'POST') {
      buildStatus = 'ready';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { accepted: true, jobId: 'job-smoke-rules' } }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          revision: `revision-${mockState.revision}`,
          rulesetId: 'smoke-rules',
          status: buildStatus,
          compilerAvailable: true,
          formats: { source: true, binary: buildStatus === 'ready' },
          build: null,
        },
      }),
    });
  });

  await login(page, mockState);
  await navigateTo(page, '规则集');
  await expect(page.getByText('编译失败', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重新编译' }).click();
  await expect(page.getByText('SRS 可用', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '复制 SRS 链接' })).toBeVisible();
});

test('persists language and runs a safe GitHub push', async ({ page }) => {
  const mockState = await mockApi(page);
  await login(page, mockState);

  await navigateTo(page, '通用');
  await expect(page.getByRole('heading', { name: '通用' })).toBeVisible();
  await page.getByRole('button', { name: '亮色' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('app-dark'))).toBe(false);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sing-sub.appearance'))).toBe('light');
  await page.getByRole('combobox', { name: '语言' }).click();
  await page.getByRole('option', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sing-sub.locale'))).toBe('en-US');

  await navigateTo(page, 'Sync');
  await expect(page.getByRole('heading', { name: 'Sync' })).toBeVisible();
  await expect(page.getByText('R2 has changes that are not on GitHub')).toBeVisible();
  await page.getByRole('button', { name: 'Push to GitHub' }).click();
  await expect.poll(() => mockState.syncRequests.length).toBe(1);
  expect(mockState.syncRequests[0].postDataJSON()).toEqual({
    expectedRevision: 'revision-1',
    resolution: 'safe',
  });
});
