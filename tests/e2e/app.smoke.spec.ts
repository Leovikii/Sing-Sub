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
  syncDelayMs: number;
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === 'mobile-chromium'
    ? { width: 412, height: 915 }
    : { width: 1440, height: 900 });
});

async function mockApi(page: Page, setupRequired = true): Promise<ApiMockState> {
  await page.addInitScript(() => {
    localStorage.setItem('sing-sub.locale', 'zh-CN');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as typeof window & { __copiedText?: string }).__copiedText = value;
        },
      },
    });
  });
  const mockState: ApiMockState = {
    authenticated: false,
    revision: 1,
    stateRequests: [],
    fileRequests: [],
    syncRequests: [],
    syncDelayMs: 0,
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
      if (mockState.syncDelayMs) await new Promise(resolve => setTimeout(resolve, mockState.syncDelayMs));
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
      if (mockState.syncDelayMs) await new Promise(resolve => setTimeout(resolve, mockState.syncDelayMs));
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
  await page.getByLabel('管理员口令', { exact: true }).fill('test-admin-password');

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
  await dialog.getByLabel('名称', { exact: true }).fill('smoke-profile');

  const saveButton = dialog.getByRole('button', { name: '保存' });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect.poll(() => mockState.stateRequests.length).toBe(1);
  const payload = mockState.stateRequests[0].postDataJSON();
  expect(payload.profileName).toBe('smoke-profile');
  expect(payload.state.profiles).toHaveLength(1);
  expect(payload.state.profiles[0]).toMatchObject({ name: 'smoke-profile', order: 0 });
  await expect(dialog).toBeHidden();

  const subscriptionButton = page.getByRole('button', { name: '订阅', exact: true });
  const widthBefore = (await subscriptionButton.boundingBox())?.width;
  await subscriptionButton.click();
  const copiedButton = page.getByRole('button', { name: '已复制', exact: true });
  await expect(copiedButton).toBeVisible();
  const widthAfter = (await copiedButton.boundingBox())?.width;
  expect(widthBefore).toBeDefined();
  expect(widthAfter).toBeDefined();
  expect(Math.abs(widthAfter! - widthBefore!)).toBeLessThan(1);
});

test('uses a compact and stable desktop editor header', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mockState = await mockApi(page);
  await login(page, mockState);

  await page.getByRole('button', { name: '新建' }).click();
  const dialog = page.getByRole('dialog');
  const header = dialog.locator('.p-dialog-header');
  const nameInput = dialog.getByLabel('名称', { exact: true });
  const noteInput = dialog.getByLabel('备注', { exact: true });
  const modeControl = dialog.locator('.p-selectbutton');
  const previewButton = dialog.getByRole('button', { name: '预览', exact: true });
  const saveButton = dialog.getByRole('button', { name: '保存', exact: true });

  await noteInput.fill('compact note');
  await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).transform))
    .toBe('matrix(1, 0, 0, 1, 0, 0)');
  const nameBox = (await nameInput.boundingBox())!;
  const noteBox = (await noteInput.boundingBox())!;
  const modeBox = (await modeControl.boundingBox())!;
  const saveBox = (await saveButton.boundingBox())!;
  expect(Math.abs(
    (nameBox.y + nameBox.height / 2) - (noteBox.y + noteBox.height / 2),
  )).toBeLessThan(2);
  expect(nameBox.width).toBeGreaterThanOrEqual(160);
  expect(nameBox.width).toBeLessThanOrEqual(225);
  expect(noteBox.width).toBeGreaterThanOrEqual(224);
  expect(noteBox.width).toBeLessThanOrEqual(321);
  expect(noteBox.x).toBeGreaterThan(nameBox.x + nameBox.width);
  expect(modeBox.x).toBeGreaterThan(noteBox.x + noteBox.width);
  expect(saveBox.x).toBeGreaterThan(modeBox.x + modeBox.width);
  expect((await header.boundingBox())!.height).toBeLessThan(140);

  const modeX = modeBox.x;
  const saveX = saveBox.x;
  await previewButton.click();
  await expect(saveButton).toBeVisible();
  const previewTitle = dialog.locator('.editor-preview-title');
  const previewNote = dialog.locator('.editor-preview-note');
  const previewTitleBox = (await previewTitle.boundingBox())!;
  const previewNoteBox = (await previewNote.boundingBox())!;
  expect(previewTitleBox.x).toBeCloseTo(nameBox.x, 0);
  expect(previewNoteBox.x - (previewTitleBox.x + previewTitleBox.width)).toBeGreaterThanOrEqual(15);
  expect(previewNoteBox.x - (previewTitleBox.x + previewTitleBox.width)).toBeLessThanOrEqual(17);
  expect((await modeControl.boundingBox())?.x).toBe(modeX);
  expect((await saveButton.boundingBox())?.x).toBe(saveX);
});

test('shows the repository MIT license in About settings', async ({ page }) => {
  const mockState = await mockApi(page);
  await login(page, mockState);
  await navigateTo(page, '关于');

  const licenseLink = page.getByRole('link', { name: 'MIT' });
  await expect(licenseLink).toHaveAttribute('href', 'https://github.com/Leovikii/Sing-Sub/blob/main/LICENSE');
  await expect(page.getByText('GPL-3.0')).toHaveCount(0);
});

test('keeps editor metadata and actions stable at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const mockState = await mockApi(page);
  await login(page, mockState);

  await page.getByRole('button', { name: '新建' }).click();
  const dialog = page.getByRole('dialog');
  const nameInput = dialog.getByLabel('名称', { exact: true });
  const noteInput = dialog.getByLabel('备注', { exact: true });
  await expect(nameInput).toBeVisible();
  await expect(noteInput).toBeVisible();
  expect((await nameInput.boundingBox())?.width).toBeGreaterThan(250);
  expect((await noteInput.boundingBox())?.width).toBeGreaterThan(250);
  expect(await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    return [...dialog.querySelectorAll('*')].every((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) return true;
      return rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1;
    });
  })).toBe(true);

  const previewButton = dialog.getByRole('button', { name: '预览', exact: true });
  const saveButton = dialog.getByRole('button', { name: '保存', exact: true });
  const modeControl = dialog.locator('.p-selectbutton');
  await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).transform))
    .toBe('matrix(1, 0, 0, 1, 0, 0)');
  const modeX = (await modeControl.boundingBox())?.x;
  const saveX = (await saveButton.boundingBox())?.x;
  await previewButton.click();
  await expect(saveButton).toBeVisible();
  expect((await modeControl.boundingBox())?.x).toBe(modeX);
  expect((await saveButton.boundingBox())?.x).toBe(saveX);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('keeps asset editor tools inside a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const mockState = await mockApi(page);
  await login(page, mockState);

  await navigateTo(page, '适配器');
  await page.getByRole('button', { name: '新建' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '查找 / 替换' }).click();
  const searchPanel = dialog.locator('.cm-search');
  await expect(searchPanel).toBeVisible();
  const searchBox = await searchPanel.boundingBox();
  expect(searchBox?.x).toBeGreaterThanOrEqual(0);
  expect((searchBox?.x || 0) + (searchBox?.width || 0)).toBeLessThanOrEqual(320);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();

  await navigateTo(page, '规则集');
  await page.getByRole('button', { name: '新建' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '新增 SOURCE' }).click();
  expect(await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return false;
    return [...dialog.querySelectorAll('*')].every((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0) return true;
      return rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1;
    });
  })).toBe(true);
});

test('creates node, adapter, and ruleset assets', async ({ page }) => {
  const mockState = await mockApi(page);
  await login(page, mockState);

  await navigateTo(page, '节点集');
  await expect(page.getByRole('heading', { name: '节点集' })).toBeVisible();
  await expect(page.getByText('暂无节点集')).toBeVisible();

  await page.getByRole('button', { name: '新建' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称', { exact: true }).fill('smoke-nodes');
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
  await expect(page.getByText('暂无适配器')).toBeVisible();
  await page.getByRole('button', { name: '新建' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称', { exact: true }).fill('smoke-adapter');
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
  await expect(page.getByText('暂无规则集')).toBeVisible();
  await page.getByRole('button', { name: '新建' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('名称', { exact: true }).fill('smoke-rules');
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
  const jsonLink = page.getByRole('button', { name: '复制 JSON 链接' });
  await expect(jsonLink).toBeVisible();
  await expect(jsonLink).toHaveClass(/p-button-danger/);
  await expect(page.getByRole('button', { name: '复制 SRS 链接' })).toHaveCount(0);
  await page.getByRole('button', { name: '重新编译' }).click();
  const srsLink = page.getByRole('button', { name: '复制 SRS 链接' });
  await expect(srsLink).toBeVisible();
  await expect(srsLink).toHaveClass(/p-button-success/);
  await expect(page.getByRole('button', { name: '复制 JSON 链接' })).toHaveCount(0);
});

test('keeps the active navigation emphasis while another item is hovered', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mockState = await mockApi(page);
  await login(page, mockState);

  const navigation = page.getByRole('navigation', { name: '主导航' });
  const activeLink = navigation.getByRole('link', { name: '配置', exact: true });
  const syncLink = navigation.getByRole('link', { name: '同步', exact: true });
  await expect(activeLink).toHaveClass(/nav-link-active/);
  const activeBefore = await activeLink.evaluate(element => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
    fontWeight: getComputedStyle(element).fontWeight,
  }));
  expect(activeBefore.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  expect(Number(activeBefore.fontWeight)).toBeGreaterThanOrEqual(600);

  await syncLink.hover();
  const activeAfter = await activeLink.evaluate(element => ({
    backgroundColor: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element).color,
    fontWeight: getComputedStyle(element).fontWeight,
  }));
  const hoverBackground = await syncLink.evaluate(element => getComputedStyle(element).backgroundColor);
  expect(activeAfter).toEqual(activeBefore);
  expect(hoverBackground).not.toBe(activeBefore.backgroundColor);
});

test('applies the saved dark theme before the application mounts', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => localStorage.setItem('sing-sub.appearance', 'dark'));
  await page.goto('/');

  const theme = await page.evaluate(() => ({
    darkClass: document.documentElement.classList.contains('app-dark'),
    theme: document.documentElement.dataset.theme,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    themeColor: document.querySelector<HTMLMetaElement>('#theme-color')?.content,
  }));
  expect(theme).toEqual({
    darkClass: true,
    theme: 'dark',
    colorScheme: 'dark',
    htmlBackground: 'rgb(18, 18, 18)',
    bodyBackground: 'rgb(18, 18, 18)',
    themeColor: '#121212',
  });
});

test('switches workspace tabs without waiting for a page transition', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const mockState = await mockApi(page);
  await login(page, mockState);
  await navigateTo(page, '节点集');
  await expect(page.getByText('暂无节点集')).toBeVisible();

  await page.evaluate(() => {
    const state = window as typeof window & { __routeSwitchDuration?: number | null };
    state.__routeSwitchDuration = null;
    const start = performance.now();
    const observer = new MutationObserver(() => {
      if (document.querySelector('main')?.textContent?.includes('暂无模板')) {
        state.__routeSwitchDuration = performance.now() - start;
        observer.disconnect();
      }
    });
    observer.observe(document.querySelector('main')!, { childList: true, subtree: true, characterData: true });
  });
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '模板', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __routeSwitchDuration?: number | null }
  ).__routeSwitchDuration)).not.toBeNull();
  const duration = await page.evaluate(() => (
    window as typeof window & { __routeSwitchDuration?: number | null }
  ).__routeSwitchDuration!);
  expect(duration).toBeLessThan(130);
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
  await expect(page.getByText('New changes in R2')).toBeVisible();
  mockState.syncDelayMs = 250;
  const syncSection = page.locator('section[aria-busy]');
  const refreshButton = syncSection.getByRole('button').nth(0);
  const pullButton = syncSection.getByRole('button').nth(1);
  const pushButton = syncSection.getByRole('button').nth(2);

  await pushButton.click();
  await expect(pushButton).toContainText('Pushing');
  await expect(refreshButton).toBeDisabled();
  await expect(pullButton).toBeDisabled();
  await expect(pushButton).toBeDisabled();
  await pushButton.click({ force: true });
  await expect.poll(() => mockState.syncRequests.length).toBe(1);
  await expect(pushButton).toBeEnabled();
  expect(mockState.syncRequests).toHaveLength(1);
  expect(mockState.syncRequests[0].postDataJSON()).toEqual({
    expectedRevision: 'revision-1',
    resolution: 'safe',
  });

  await refreshButton.click();
  await expect(refreshButton).toContainText('Refreshing');
  await expect(refreshButton).toBeDisabled();
  await expect(pullButton).toBeDisabled();
  await expect(pushButton).toBeDisabled();
  await expect(refreshButton).toBeEnabled();
});
