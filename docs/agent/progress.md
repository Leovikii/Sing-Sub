# v3.1.x 进度

更新日期：2026-10-12
回滚基线：`3.0.0`
当前稳定版：`3.1.2`（用户确认生产迁移并验收通过）
当前候选：`3.1.3`（本地实现与 Chromium 验证完成，Firefox 待 CI）
状态：3.1.2 已完成生产验证；3.1.3 迁移清理、手动同步方向及拉取后刷新已完成。交付分支 codex/3.1.3-sync-cleanup，用户手动创建 PR 到 main 并触发自动部署；本轮未合并或部署，Firefox 本机启动仍失败。

## 任务台账

| ID | 状态 | 内容 |
|---|---|---|
| FE-3190 | DONE | 3.1.3 一次性迁移清理 |
| FE-3191 | DONE | 手动同步方向、覆盖确认和回归验证 |
| FE-3180 | DONE | 3.1.2 元数据产物隔离、筛选器点击修复、适配器完整移除与离线升级工具 |
| FE-3182 | DONE | v2→v3 一次性自动迁移、不可变备份、CAS 并发保护与失败重试 |
| FE-3181 | BLOCKED | Firefox 环境验收：官方 Firefox 150/151/153 均因 Windows mozglue SideBySide 故障无法启动 |
| FE-3100 | DONE | Agent 文档入口、ADR、计划与历史压缩 |
| FE-3101 | DONE | 许可证和 bundle 基线检查 |
| FE-3102 | DONE | E2E 去 PrimeVue 私有选择器 |
| FE-3103 | DONE | React 独立入口、tsconfig 与构建脚本 |
| FE-3110 | DONE | Mantine Provider、主题与首帧颜色模式 |
| FE-3111 | DONE | react-i18next、双语迁移与 key parity test |
| FE-3112–FE-3114 | DONE | Router session guard、stores、API |
| FE-3120–FE-3123 | DONE | Shell、认证、设置、全局反馈 |
| FE-3130–FE-3133 | DONE | 资源、CodeMirror、Ruleset 编辑与构建状态 |
| FE-3140–FE-3144 | DONE | Profile 与 GitHub Sync |
| FE-3150 | DONE | 完整桌面、移动端、双语、Firefox 与键盘回归 |
| FE-3151 | DONE | 包体积、首帧与性能验收 |
| FE-3154 | DONE | 卡片整面预览交互、Profile 拖曳层级与资源移动端布局优化 |
| FE-3155 | DONE | 资源预览切换控件首帧修复与 AppShell 品牌图标 |
| FE-3156 | DONE | Profile 筛选节点协议标签与移动端排版 |
| FE-3157 | DONE | 资源/Profile 编辑器标题、只读预览元数据与固定操作区统一 |
| FE-3158 | DONE | 编辑器标题行元数据收敛与预览/编辑原位切换 |
| FE-3159 | DONE | 编辑器预览标题紧凑排列与移动端弹性滚动区 |
| FE-3160 | DONE | Beta.2 性能门禁、规则集来源控件与编辑器尺寸稳定性 |
| FE-3161 | DONE | 空规则集区块默认折叠、轻量 JSON 查找/替换与 Chrome DevTools 性能审计 |
| FE-3162 | DONE | 删除公开发布说明与版本入口，收敛 README/Wiki 文档边界 |
| FE-3163 | DONE | 精简 CodeMirror 6、编辑器功能恢复与真实浏览器性能验收 |
| FE-3164 | DONE | `3.1.0` 正式版发布审计、版本收束与遗留清理 |
| FE-3170 | DONE | `3.1.1` GitHub 双向同步 JSON 内容顺序保真 |
| FE-3171 | DONE | `3.1.1` 版本元数据与生产更新测试准备 |
| FE-3152 | DONE | 默认入口切换 React 与 Vue 迁移栈清理 |
| FE-3153 | DONE | `3.1.0-beta.1` 版本、公开文档与发布说明收束 |

状态只能使用 `TODO`、`IN_PROGRESS`、`DONE`、`BLOCKED`。只有验收条件全部满足时标记 `DONE`。

## 当前验证基线

- 生产前端：`index.html` 唯一入口挂载 React；Vue、PrimeVue、Pinia、Vue Router、Vue I18n、Tailwind、vuedraggable、旧 `.vue` 与迁移期 `react.html` 已清理。
- 专业依赖：Lucide React 与 dnd-kit 分别保留图标和 Profile 排序能力；通用 JSON 编辑使用编辑态二级懒加载的官方 CodeMirror 6，Mantine 负责工具栏、加载态和 Modal 外框。
- E2E：React 单入口共 11 个 Playwright 场景；Chromium 桌面/移动共 22 次执行通过，另有 Firefox 2 次专项通过。布局测试使用 role/label 或稳定 test id，不依赖 Mantine 私有 class。
- Worker/shared/backend 不在 3.1 迁移范围。

## 会话记录

### 2026-07-30：3.1 计划启动

- 用户确认不继续使用 Vue，选择 React + Mantine。
- PrimeVue 5 因自定义许可、资格门槛、年度确认和许可证密钥要求被排除。
- 建立短期双构建、单生产入口策略；不实现 Vue/React 运行时桥接。
- 将 3.0 逐会话历史压缩为摘要，用户文档与 Agent 开发入口分离。
- 后续状态：FE-3100、FE-3101、FE-3103 与 FE-3110 已在本次工作中完成。

### 2026-07-30：FE-3100 文档入口与历史压缩

- 完成内容：建立根目录 Agent 入口和 3.1 计划/ADR/进度台账；公开 README 只保留用户与运维文档入口。
- 文件/模块：`AGENTS.md`、`docs/agent`、`docs/README.md`、中英文 README。
- 验证：旧工程文档链接已清零；3.0 详细过程压缩为一份历史摘要，完整历史由 Git 保留。
- 遗留风险：公开 Wiki 在生产入口切换前仍描述 3.0，符合当前稳定版状态。
- 下一任务：FE-3103 React 独立入口。

### 2026-07-30：FE-3101/FE-3103/FE-3110 迁移基础

- 完成内容：锁定 React/Mantine 依赖并建立许可证门禁；新增 `react.html` 双构建入口、React tsconfig、ESLint 规则、Mantine Provider、颜色模式与迁移期 AppShell。
- 文件/模块：`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig.react.json`、`src-react`、`react.html`、`scripts/check-ui-licenses.mjs`。
- 验证：lint、全量 typecheck、173 个 unit/integration tests、双入口 production build 通过；本地浏览器验证中英文/明暗切换、390 px 无横向滚动和移动导航，无 console error/warning。
- 遗留风险：React 入口 gzip JS 为 171.09 kB，尚未达到最终切换门槛；npm 安装报告 7 个 high severity 项，外发审计未获许可，尚待归因。
- 下一任务：FE-3111 i18n parity test，然后实现 session guard 与 Zustand store。

### 2026-07-30：FE-3111–FE-3123 React 平台、认证与设置

- 完成内容：共享中英文词条、parity test、Zustand session/workspace/assets/sync stores、401 会话清理、Bootstrap 去重、路由守卫、Mantine AppShell、认证与四个设置页。
- 文件/模块：`src-react/app`、`src-react/stores`、`src-react/i18n`、`src-react/features/auth`、`src-react/features/settings`。
- 验证：React 类型检查、i18n/store/API 单测及桌面/移动认证、主题、语言、导航、退出和设置 E2E 通过。
- 遗留风险：Vue 仍为生产入口；真实会话与浏览器凭据尚未人工验证。
- 下一任务：资源、Profile、Ruleset 与 Sync 迁移。

### 2026-07-30：FE-3130–FE-3144 业务页面迁移

- 完成内容：通用 JSON 资源 CRUD、lazy CodeMirror、结构化 Ruleset 来源/手工规则编辑、build retry 与 JSON/SRS 链接；Profile 创建/预览/复制/删除、Mantine form 引用选择、筛选、dnd-kit 排序、revision conflict；GitHub sync preflight/push/pull/conflict。
- 文件/模块：`src-react/features/resources`、`src-react/features/profiles`、`src-react/features/sync`、`tests/e2e/react.smoke.spec.ts`。
- 验证：React 9 个场景在 desktop Chromium 与 mobile Chromium 共 18 次执行通过；Profile 与 Ruleset 的保存请求、revision、预览、复制和构建行为均由 mock API 断言，并覆盖 320/390/412/768/1440 viewport、键盘 Modal 与 reduced-motion 偏好。
- 遗留风险：规则来源保存会触发真实 Worker 外部抓取，必须在登录后的人工环境验证；生产入口仍未切换。
- 下一任务：FE-3150/FE-3151 完整回归和性能验收。

### 2026-07-30：FE-3102/FE-3151 测试解耦与路由拆包

- 完成内容：旧 Vue 布局测试以 `data-testid` 表达稳定布局契约，移除 `.p-dialog-*`/`.p-selectbutton` 选择器；React Profile、资源、Sync 和设置页面改为路由级 lazy chunk，CodeMirror 继续二级 lazy。
- 验证：lint、shared/web/react/worker typecheck、113 unit、66 integration、双入口 production build 通过；Chromium 双入口 44 次 E2E 通过。React 主入口从 850.70 kB/256.35 kB gzip 降至 292.13 kB/90.69 kB gzip，Profile 与资源分别拆为 21.11 kB 和 8.43 kB gzip feature chunk。
- 遗留风险：本机 Playwright Firefox 151 在空项目 `browser.newPage()` 即触发内部 `_page` 异常，两次专项重跑均失败；浏览器重新安装下载无响应后已终止。该问题独立于应用代码，FE-3150 暂不标记完成。
- 下一任务：修复/更换 Firefox 自动化运行时，补齐键盘、reduced-motion、完整 viewport 与真实登录人工测试，再评估生产入口切换。

### 2026-07-30：FE-3150 本地真实 Worker 与跨浏览器回归

- 完成内容：使用 `.dev.vars` 管理员口令登录本地 Wrangler Worker 与本地 R2，完成退出、重新登录、资源创建/删除和会话保持验证；修复 React i18next 未兼容共享 Vue I18n 单花括号占位符的问题，并增加删除确认文案 E2E。
- 文件/模块：`src-react/i18n/index.ts`、`tests/e2e/react.smoke.spec.ts`。
- 验证：`npm run verify` 全量通过，包括 lint、许可证门禁、四套 typecheck、113 unit、66 integration、production build、桌面/移动 Chromium 44 次及 Firefox 2 次 E2E；本地生产构建浏览器控制台无 error/warning，测试 R2 对象已删除。
- 遗留风险：Firefox 在受限执行环境中无法派生 tab 子进程，脱离该限制后可稳定通过；`worker:dry-run` 的构建阶段通过，但 `wrangler deploy --dry-run` 因环境策略要求用户显式授权而未执行；当前未配置 Chrome DevTools MCP，无法完成 LCP/CLS 与首屏网络依赖链审计。真实部署的会话 Cookie、外部规则来源抓取和 GitHub/SRS 集成仍需用户授权登录实际后端验证。生产入口仍未切换。
- 下一任务：完成 FE-3151 首屏网络/性能验收和 Worker dry-run，再决定是否进入 FE-3152。

### 2026-07-30：真实后端只读预览入口

- 完成内容：新增固定上游的本地 React/Vite 入口，将认证与只读 typed API 请求代理到 `https://ss.vkio.org`；用户可直接在本地迁移前端登录真实后端，无需部署 React。
- 文件/模块：`scripts/run-real-backend-preview.mjs`、`tests/unit/real-backend-preview.test.ts`、`package.json`、`docs/agent/real-backend-preview.md`。
- 验证：lint、全量 typecheck、2 项代理策略单测通过；真实 bootstrap 成功返回登录页；运行时 PUT `/api/settings` 被 403 拦截，浏览器无 error/warning。
- 遗留风险：该入口刻意不覆盖真实写操作；保存、删除、GitHub push/pull、SRS build 等必须使用隔离 staging 或获得用户对具体真实数据操作的明确授权。
- 下一任务：用户完成真实后端登录后，继续只读检查 React 页面和真实状态。

### 2026-07-30：FE-3151 导航边界与原生动效

- 完成内容：分层导航改用 Mantine `Stack` 建立安全间距，并以 `subtle` 父级和 `light` 当前子级区分层次；路由内容增加 120 ms Mantine `Transition` 淡入，资源/Profile 操作菜单启用 120 ms 原生 `pop`，不等待离场动画。
- 文件/模块：`src-react/app/shell/AppShell.tsx`、`src-react/features/resources/ResourcesPage.tsx`、`src-react/features/profiles/ProfilesPage.tsx`、`tests/e2e/react.smoke.spec.ts`、`docs/agent/engineering-standards.md`。
- 验证：`npm run verify` 全量通过，包括 115 unit、66 integration、桌面/移动 Chromium 46 次和 Firefox 2 次 E2E；390 px 导航父子项实际间距 8 px、无横向溢出，普通模式路由为 opacity 120 ms、菜单为 transform/opacity 120 ms，reduced-motion 下为 0 ms。真实后端只读页面切换及控制台验证通过。
- 包体积：React 主入口由 90.72 kB gzip 增至 90.86 kB，约增加 0.14 kB；资源与 Profile feature 各约增加 0.01 kB gzip，未引入新依赖或自定义动画代码。
- 遗留风险：FE-3151 仍等待 Chrome DevTools MCP 的 LCP/CLS/网络依赖链审计和获得明确授权后的 Worker dry-run；生产入口仍未切换。
- 下一任务：完成剩余性能与 dry-run 门槛，再评估 FE-3152。

### 2026-07-30：FE-3154 卡片交互与移动端边界

- 完成内容：资源与 Profile 卡片恢复整面预览入口，并以 Mantine `UnstyledButton` 保持键盘按钮语义；独立编辑、菜单、订阅和拖曳操作保持各自命中层。Profile 拖曳把手移到内容前导侧，管理操作保留在右侧；卡片 ActionIcon 与订阅操作统一为至少 44×44 px。
- 视觉取舍：移除同类资源页内重复的 `NODE`/`TEMPLATE`/`ADAPTER`/`RULESET` 类型 Badge；Ruleset 构建状态 Badge 继续保留。资源 `SimpleGrid` 改用 Mantine 原生响应式列数，修复 320 px 下由 300 px 最小列宽造成的 12 px 横向溢出。
- 真实后端：确认 `POST /api/preview` 只读取认证快照并临时生成内容后，将其加入本地只读代理的精确白名单；保存、删除、GitHub sync 与 SRS build 仍返回 403。真实 `vr` Profile 预览成功，未出现 `Forbidden` 或预览失败。
- 验证：lint、许可证门禁、四套 typecheck、115 unit、66 integration、production build 通过；Chromium 桌面/移动 46 项及受限环境外 Firefox 2 项 E2E 通过。新增 320 px 资源/Profile 无横向溢出、44 px 命中区、拖曳前导位置、冗余 Badge 缺失及键盘整面预览断言。
- 包体积：React 主入口 90.87 kB gzip，较前一基线增加约 0.01 kB；未增加依赖或自定义动画。
- 遗留风险：Firefox 在受限执行环境内仍会在 `browserContext.newPage()` 命中已知 `_page` 启动错误，脱离该限制后两项均通过；FE-3151 的 DevTools 性能审计与 Worker dry-run 仍未完成。
- 下一任务：继续 FE-3151 性能与 dry-run 门槛，或按用户反馈继续 UI 边界审查。

### 2026-07-30：FE-3155 资源切换控件与品牌图标

- 完成内容：资源编辑器的 `SegmentedControl` 显式启用 `fullWidth`；资源 Modal 统一改用 Mantine 原生 120 ms `fade`，避免桌面 `pop` 缩放首帧导致 FloatingIndicator 保留错误测量。AppShell 标题左侧使用 Mantine `Image` 嵌入仓库现有 `/favicon.svg`，固定为 36×36 px。
- 设计确认：移动端资源与 Profile 编辑器继续使用 Mantine `fullScreen` Modal。两者都包含长表单、代码/预览滚动区并可在预览和编辑间切换，全屏可避免软键盘与嵌套滚动压缩内容，当前无需改为普通弹窗。
- 验证：真实后端资源预览中，活动指示器与已选“预览”标签的 x 坐标和宽度误差均为 0 px；品牌图标实际尺寸为 36×36 px。lint、许可证门禁、四套 typecheck、115 unit、66 integration、production build、Chromium 桌面/移动 46 项及受限环境外 Firefox 2 项 E2E 通过。
- 回归测试：新增品牌图标来源/尺寸断言，以及桌面 Modal 稳定后 FloatingIndicator 与 checked radio label 的位置、宽度误差不超过 1 px 的布局契约。
- 包体积：React 主入口为 91.11 kB gzip，较 FE-3154 基线增加约 0.24 kB；未新增依赖、自定义动画或图像资产。
- 遗留风险：Firefox 受限环境启动问题及 FE-3151 的 DevTools 性能审计、Worker dry-run 状态不变。
- 下一任务：继续按用户反馈做 UI 边界审查，或完成 FE-3151 剩余门槛。

### 2026-07-30：FE-3156 Profile 节点协议标签

- 完成内容：Profile 筛选结果恢复“协议类型 + 节点名称”的信息层级，并沿用旧版协议等级语义；改用 Mantine 原生 `Badge` 与 `Tooltip`，通过优先、推荐、可用、标准、不推荐、结构、未分级七档文字和颜色表达等级。不推荐档使用琥珀色，红色继续只用于错误与危险状态。
- 移动端：标签允许在 flex 容器内收缩，最长宽度不超过匹配结果区；节点名称使用 Badge 原生单行省略，Tooltip 与 `aria-label` 保留协议、等级和完整节点名。新增 320 px 长节点名边界断言，同时覆盖优先、不推荐和未知协议。
- 文件/模块：`src-react/features/profiles/ProfilesPage.tsx`、`tests/e2e/react.smoke.spec.ts`、`docs/agent/engineering-standards.md`。
- 验证：lint、许可证门禁、四套 typecheck、115 unit、66 integration、production build 通过；Chromium 桌面/移动 48 项及受限环境外 Firefox 2 项 E2E 通过。新增场景断言页面无横向溢出、每个标签不越过结果容器、协议等级颜色不同且完整可访问名称可定位。
- 包体积：React 主入口保持 91.11 kB gzip；Profile feature chunk 为 21.64 kB gzip。未新增依赖、通用包装组件或自定义标签动画。
- 遗留风险：真实后端节点名称取决于用户数据，浏览器的 localhost URL 安全策略阻止了本轮连接失败后的可视化复核；响应式布局与真实 Chromium 渲染已由 Playwright 覆盖。Firefox 受限环境启动问题及 FE-3151 的 DevTools 性能审计、Worker dry-run 状态不变。
- 下一任务：继续按用户反馈检查真实数据下的视觉密度，或完成 FE-3151 剩余门槛。

### 2026-07-30：FE-3152/FE-3153 3.1 Beta 单入口收束

- 完成内容：版本更新为 `3.1.0-beta.1`，`index.html` 改为唯一 React 入口；删除迁移期 `react.html`、旧 Vue 源码、旧 Vue E2E、未引用的 MigrationPage 和 Vue tsconfig。package/lockfile 移除 Vue、PrimeVue、PrimeUI、Pinia、Vue Router、Vue I18n、Tailwind、vuedraggable、Lucide Vue 与对应 Vite/ESLint 工具。
- 文档：README、Wiki、部署恢复说明、Agent 架构/ADR/计划/依赖基线均已同步；新增中英文 Beta 发布说明，明确测试版身份、`v3.0.0` 回滚基线、无数据迁移及不轮换 Secret。
- 验证：干净 `npm ci`、lint、许可证门禁、shared/web/worker typecheck、115 unit、66 integration、production build 通过；React Chromium 桌面/移动各 11 项、Firefox 2 项 E2E 通过。`npm run worker:dry-run` 在受限环境外成功读取 55 个静态文件，上传预览 750.02 KiB / gzip 122.23 KiB，识别 `WORKSPACE_BUCKET` 后以 dry-run 退出。
- 依赖审计：生产依赖 audit 的 2 个 high 均为 React Router RSC Mode CSRF 同一通告；项目没有 RSC/server action，攻击路径不可达且上游暂无修复。包含开发工具的 audit 共 24 个 high，已在依赖基线记录来源，不执行强制 audit fix。
- 性能：Beta 首屏静态 JS 为 219.72 kB gzip，较 `v3.0.0` 的 248.53 kB 下降 11.6%；全部 feature 与 CodeMirror 均加载时为 394.46 kB，较 3.0 增加 58.7%，未达到正式版总 JS 预算。因此 FE-3151 保持 `IN_PROGRESS`，Beta 依据 ADR-053 作为有限例外测试。
- 遗留风险：尚未执行 git push、tag、GitHub Release 或生产部署。用户部署后仍需在真实生产入口复核登录、写操作、订阅、GitHub sync 与 SRS；正式 `3.1.0` 前需继续收束全量 JS 体积或明确修订预算。
- 下一任务：用户推送 Beta 后进行实际生产冒烟测试；随后完成 FE-3151 并决定正式版门槛。

### 2026-07-30：FE-3157 编辑器信息层级与操作区统一

- 生产反馈：用户已将 `3.1.0-beta.1` 与 FE-3157 部署生产并完成实际验证，未发现功能异常。
- 完成内容：资源与 Profile 弹窗统一以实体名称为主标题，并以资源类型或“配置”Mantine Badge 提供辅助上下文；新建实体保留“新建…”标题。预览态将名称和备注改为只读文本并隐藏保存，切回编辑态后恢复输入与保存。
- 交互层级：Profile 长表单改由 Mantine `ScrollArea` 独立滚动，底部取消/保存位于滚动区之外；预览态底部使用“完成”，与 Modal 右上角“关闭”保持不同的可访问名称。移动端继续使用全屏 Modal，标题、元数据与代码区无横向溢出。
- 文件/模块：`src-react/components/EntityEditorMetadata.tsx`、资源/Profile 页面、双语词条和 React E2E；ADR-054 与工程标准同步固化该规则。
- 验证：lint、许可证门禁、shared/web/worker typecheck、115 unit、66 integration、production build 通过；Chromium 桌面/移动共 22 项 E2E 通过，受限环境外 Firefox 2 项专项通过。新增断言覆盖标题语义、预览只读、编辑恢复、保存按钮滚动层级和 320 px 弹窗边界。
- 包体积：全部客户端 JS 为 395.58 KiB gzip，较 Beta 收束基线 394.46 KiB 增加 1.12 KiB（约 0.28%）；未新增依赖、自定义动画、overlay 或滚动锁。
- 遗留风险：FE-3151 的正式版总 JS 预算仍未完成。
- 下一任务：继续根据实际视觉反馈压缩编辑器信息层级；随后完成 FE-3151 体积收束。

### 2026-07-30：FE-3158 编辑器标题行收敛

- 生产反馈：FE-3157 功能正常，但预览窗口将名称同时显示在标题和只读元数据区，空备注也占据独立区域，形成三层顶部结构。
- 完成内容：资源与 Profile 编辑器改用 Mantine compound `Modal.Root/Header/Content/Body`；类型 Badge、名称、备注和关闭按钮统一进入标题行。预览态直接显示名称与非空备注，编辑态在同一位置原位切换为两个紧凑输入框，Modal Body 直接从模式切换开始。
- 响应式：共享 `EntityEditorHeader` 通过 Mantine `Group` 与弹性 style props 保持单行布局；320×900 下两个输入各约 99 px，关闭按钮位于最右侧，标题栏与弹窗横向溢出均为 0。
- 文件/模块：`src-react/components/EntityEditorChrome.tsx`、资源/Profile 页面、React E2E、ADR-054、工程标准和 3.1 计划。
- 验证：lint、许可证门禁、shared/web/worker typecheck、115 unit、66 integration、production build 通过；Chromium 桌面/移动共 22 项 E2E 通过，受限环境外 Firefox 2 项专项通过。真实后端只读浏览器测试覆盖 Profile 与模板的预览/编辑切换，控制台无 error/warn，未保存或写入生产数据。
- 包体积：全部客户端 JS 为 395.59 KiB gzip，较 FE-3157 的 395.58 KiB 增加约 0.01 KiB；未新增依赖、自定义 overlay、滚动锁或动画。
- 测试交接：`npm run dev:real-backend` 保持运行，浏览器保留 `http://127.0.0.1:8787/#/resources/templates` 的 `client` 模板编辑窗口供用户直接验收。
- 遗留风险：FE-3158 尚未部署生产；FE-3151 的正式版总 JS 预算仍未完成。
- 下一任务：用户完成视觉验收后部署 FE-3158，随后继续 FE-3151 体积收束。

### 2026-07-31：FE-3159 标题紧凑排列与移动端弹性滚动区

- 视觉反馈：预览态短名称与备注因平均分配标题栏空间而距离过远；Profile 全屏 Modal 的内容区仍固定为 `50dvh`，导致操作栏下方出现大块留白。
- 完成内容：预览名称改为按内容占宽并允许收缩，备注紧随名称、保持左对齐并吸收剩余空间；Profile 移动端表单、Modal Body、业务 `ScrollArea` 改用 Mantine 弹性布局，中间滚动区自动填满标题栏与固定操作栏之间的可用高度。桌面端继续使用 `50dvh` 内容高度。
- 回归保护：资源桌面与 Profile 320 px 预览断言名称/备注间距不超过 16 px；Profile 编辑态同时在 320×900 和 320×700 下断言滚动区随视口缩短约 200 px、操作栏距底部不超过 32 px且无横向溢出。
- 验证：完整 `npm run verify` 通过，包括许可证、shared/web/worker typecheck、115 unit、66 integration、production build、Chromium 桌面/移动 22 项和 Firefox 2 项 E2E。真实后端只读测试中，标题名称/备注实际间距 10 px；320×700 与 320×900 的滚动区分别约 504 px、704 px，操作栏始终距底部 16 px，横向溢出为 0。
- 包体积：全部客户端 JS 为 395.71 KiB gzip，较 FE-3158 增加约 0.12 KiB；未新增依赖、CSS Module、自定义滚动或动画实现。
- 测试交接：`npm run dev:real-backend` 保持运行，浏览器保留 `http://127.0.0.1:8787/#/profiles` 的 `zio` Profile 编辑窗口供用户验收；测试未修改字段或保存生产数据。
- 遗留风险：FE-3158/FE-3159 尚未部署生产；FE-3151 的正式版总 JS 预算仍未完成。
- 下一任务：用户完成视觉验收后部署本批 UI 修复，随后继续 FE-3151 体积收束。

### 2026-07-31：FE-3151/FE-3160 Beta.2 性能与规则集 UI 收束

- 完成内容：通用 JSON 编辑器改用 Mantine `JsonInput`，移除 16 个 CodeMirror/Lezer 生产依赖；新增全客户端 JS gzip 自动预算门禁。规则集来源区只保留 Accordion 顶部类型 Badge，将最近更新时间、更新周期和删除操作合并到底部控件区，并在修改周期时保留 `last_updated`。共享编辑器标题行增加稳定最小高度，预览/编辑切换不再改变 Modal 外框尺寸。
- 文件/模块：`src-react/features/resources`、`src-react/components/EntityEditorChrome.tsx`、`scripts/check-bundle-budget.mjs`、React E2E、双语词条、版本与 Beta.2 公开文档。
- 性能：全部客户端 JS 为 281.87 KiB gzip，较 `v3.0.0` 的 248.53 KiB 增加约 13.4%，低于 15% 上限 285.81 KiB；`npm run verify` 已包含该门禁。
- 验证：完整 `npm run verify` 通过，包括 lint、许可证、shared/web/worker typecheck、115 项 unit、66 项 integration、production build、Chromium 桌面/移动 22 项和 Firefox 2 项 E2E。`npm run worker:dry-run` 读取 48 个静态文件，上传预览 750.02 KiB / gzip 122.23 KiB，识别 `WORKSPACE_BUCKET` 后以 dry-run 退出。
- 真实后端只读验收：About 显示 `v3.1.0-beta.2`；规则集桌面预览/编辑 Dialog 高度差为 0 px；`SOURCE`/`DOMAIN` 各只有一个可见标题；最近更新时间恢复显示；更新周期与 44 px 删除按钮处于同一控件区。320×700 下 Dialog 为 320×700、页面横向溢出为 0，控件区未越界；控制台无 error/warn，未保存或修改生产数据。
- 性能工具：Chrome DevTools MCP 已安装到本地 Codex 配置；当前进程不能热加载新 MCP，Core Web Vitals 与网络 trace 需重启 Codex 后作为补充测量执行，不记录未采集的指标，也不影响已经量化并自动门禁的总 JS 结论。
- 遗留风险：`3.1.0-beta.2` 尚未部署、推送、打 tag 或发布；真实保存、Ruleset 外部抓取、GitHub sync 与 SRS 仍由用户在实际部署后验证。
- 下一任务：用户验收保留的本地规则集编辑窗口，并决定是否部署 Beta.2。

### 2026-07-31：FE-3161 JSON 编辑体验与渲染性能复核

- 完成内容：规则集只默认展开具有内容的类型区块，空区块和新建规则集保持折叠；Mantine `JsonInput` 增加显式格式化、`Ctrl/Cmd+F` 查找和 `Ctrl/Cmd+H` 替换，并使用 Mantine Popover 提供上一个、下一个、替换当前项和全部替换操作。未恢复 CodeMirror或新增运行时依赖。
- 性能结论：Wrangler production build 的本地已登录资源页测得 LCP 554 ms、INP 13 ms、CLS 0.00，最大关键请求链 212 ms；CSS 与 `theme-init.js` 虽被识别为 render-blocking，但预计 FCP/LCP 收益均为 0 ms，不继续优化。Vite + 真实后端仅作为开发环境对照，LCP 1553 ms、CLS 0.0001，约 1.1 秒的 `/api/bootstrap` 是主要差异。
- 切换审计：资源弹窗从预览切到 JSON 编辑时，连续 12 个 animation frame 的外框 `x/y/width/height` 与切换前误差均不超过 1 px，标题栏和最终 Dialog 高度误差也不超过 1 px。肉眼变化来自 Mantine `SegmentedControl` 原生指示动画和内容替换，不是 Modal 重排抖动，因此不禁用该提示动画。
- 验证：lint、shared/web/worker typecheck、115 项 unit、66 项 integration、production build、全客户端 JS gzip 门禁、Chromium 桌面/移动 22 项和 Firefox 2 项专项均通过；最终全客户端 JS 为 283.30 KiB gzip，低于 285.81 KiB 上限。受限环境内完整 verify 的 Firefox 启动曾命中已知 `_page` 错误，同两项在受限环境外重跑通过。
- 遗留风险：性能数据来自 CPU 1×、无网络限速的 localhost，且无 CrUX 实际用户数据；`3.1.0-beta.2` 尚未部署、推送、打 tag 或发布，真实保存、外部规则抓取、GitHub sync 与 SRS 仍由用户在实际部署后验证。
- 下一任务：用户验收 Beta.2 的规则集折叠、JSON 查找/替换和切换视觉，再决定是否部署测试版。

### 2026-07-31：FE-3162 公开文档边界收束

- 完成内容：删除 Beta.1/Beta.2 中英文发布说明及 README、Wiki 首页、侧栏和用户文档索引中的版本入口；根目录中英文 README 同时移除技术栈和开发命令，只保留产品能力、部署使用入口与许可证。
- 当时约束：ADR-057 锁定根 README 与 `docs/wiki` 不维护版本入口、发布说明、更新日志或开发记录；FE-3164 后允许根 README 展示当前稳定版本徽章和面向用户的技术栈，其他边界不变。
- 验证：公开 README、`docs/README.md` 与 `docs/wiki` 已无 `Release-3.1`、当前测试版、发布说明或 changelog 引用；`git diff --check` 通过。
- 遗留风险：GitHub Wiki 若已发布旧版本页面，需要在后续同步 Wiki 内容时从远端单独删除；本任务只修改仓库中的 Wiki 源文件，不执行远端发布或部署。
- 下一任务：用户验收当前 Beta.2 前端后决定是否部署。

### 2026-07-31：FE-3163 精简 CodeMirror 6 与隔离性能验收

- 完成内容：通用 JSON 编辑器改为直接使用官方 CodeMirror 6 模块，不使用第三方 React wrapper、`codemirror` 聚合包或 `basicSetup`；恢复行号、JSON 高亮、活动行、括号匹配、history、lint、显式/失焦格式化以及原生查找替换。Mantine 继续提供 44 px 撤销、重做、格式化、查找工具栏，工具栏固定在编辑器滚动区外；`Ctrl/Cmd+F` 与 `Ctrl/Cmd+H` 均可打开原生面板。
- 加载与生命周期：资源列表和预览态不加载编辑器；仅非规则集资源进入编辑态时通过 `lazy`/`Suspense` 二级加载。Modal 关闭后销毁 `EditorView`；真实浏览器连续三次关闭重开时实例数始终为 1。新增 `preview:real-backend`，以与开发代理相同的只读守卫服务 production `dist`，只允许读取、登录、退出和临时 preview。
- 包体积：普通应用 JS 为 283.20/285.81 KiB gzip，CodeEditor 专用 chunk 为 113.60/120.00 KiB gzip，全部客户端 JS 为 396.80/405.81 KiB gzip。`check:bundle` 要求恰好一个编辑器 chunk 并分别执行三项门禁；许可证扫描接受 68 个 MIT 包及既有宽松许可证，没有密钥或资格门槛。
- 自动化验证：最终 `npm run verify` 在非受限环境完整通过，包括 lint、许可证、shared/web/worker typecheck、115 项 unit、66 项 integration、production build、三段 bundle 门禁、Chromium 桌面/移动 22 项与 Firefox 2 项 E2E。资源 E2E 覆盖行号、格式化、无效 JSON 禁止保存、原生查找替换、320 px 搜索/工具栏边界、44 px 控件、保存 payload、预览不加载编辑器及 12 帧 Dialog 几何稳定；移动资源场景额外连续执行两次通过。
- Worker：`npm run worker:dry-run` 在非受限环境成功读取 57 个静态文件，上传预览 750.02 KiB / gzip 122.23 KiB，识别 `WORKSPACE_BUCKET` 后以 dry-run 退出；没有部署、发布、修改 R2 或轮换 Secret。
- DevTools：production build + 真实后端只读代理下，资源列表和预览均无 CodeEditor 请求；冷缓存切换编辑时 JS/CSS 传输分别为 116,917/1,226 bytes，耗时约 12.0/3.3 ms。真实大型节点 JSON 场景 LCP 1647 ms、INP 40 ms、CLS 0.00，Dialog 与标题栏切换前后尺寸不变；320×900 下页面、Modal、编辑器与搜索面板横向溢出均为 0，控制台无 error/warn/issue。
- 遗留风险：CodeMirror 首次创建视口仍有约 120 ms 的内部强制布局，但发生在懒加载后固定高度加载区内，没有阻塞模式切换的下一帧或造成 CLS；本地无 CrUX 数据，部署后仍应观察真实低端设备。当前改动尚未提交、推送、部署或发布。
- 测试交接：production build 只读预览继续运行于 `http://127.0.0.1:8787/#/resources/nodes`，供用户检查 CodeMirror 编辑窗口。
- 下一任务：用户完成视觉与键盘交互验收后，再决定是否提交或部署。

### 2026-07-31：FE-3164 3.1.0 正式版发布准备

- 发布判断：用户已确认 Beta 生产环境与最终 CodeMirror 测试页均未发现功能、布局或待优化问题；ADR-059 批准在保持 `3.0.0` 回滚基线和数据语义不变的前提下准备 `3.1.0` 稳定版。package 与 lockfile 已更新为 `3.1.0`，应用导航栏和关于页从 package metadata 构建时注入版本，避免多处手工版本漂移。
- 清理：删除 CodeEditor 从未被调用的只读模式、相关 Compartment 与条件工具栏分支，删除旧 Mantine JsonInput 遗留的双语 `invalidJson` 词条；复核仓库无 `.vue`、PrimeVue/PrimeUI、Pinia、Tailwind、`react.html`、旧 JsonEditor 或公开 Release 文档残留。没有删除仍承担运维、数据迁移或历史决策职责的文件。
- 公开文档：根中英文 README 新增 `3.1.0` 版本徽章与面向用户的 React/Mantine/CodeMirror/Cloudflare 技术栈；ADR-057 明确允许这两类当前信息，但 README/Wiki 仍不得包含更新日志、发布说明、包体积、测试记录或开发过程。运维文档改为适用 `v3.1.0`，不增加公开 changelog。
- 干净验证：`npm ci --cache .npm-cache` 成功安装 275 个包；随后非受限环境完整 `npm run verify` 通过，包括 lint、许可证、shared/web/worker typecheck、115 项 unit、66 项 integration、production build、三段 bundle 门禁、Chromium 桌面/移动 22 项与 Firefox 2 项 E2E。Worker dry-run 读取 57 个静态文件，上传预览 750.02 KiB / gzip 122.23 KiB，识别 `WORKSPACE_BUCKET` 后退出，没有部署。
- 依赖与安全：React Router 7.18.2、Mantine 9.5.0、CodeMirror View 6.43.7 均为 npm 当前稳定版本；许可证门禁通过。生产 audit 的 2 个 high 都来自 React Router RSC Mode CSRF，本 SPA 没有 RSC、Server Action 或 action endpoint，攻击路径不可达且上游无修复版本。完整工具链 audit 的 24 个 high 来自同一 React Router 通告及 ESLint/minimatch、Vite/PostCSS、Wrangler/Miniflare/Sharp；均不进入 Worker 静态运行时，保持记录并禁止 `audit fix --force`。
- 包体积：清理后的普通应用 JS 为 283.16/285.81 KiB gzip，CodeEditor 为 113.53/120.00 KiB gzip，总量为 396.69/405.81 KiB gzip，三项均通过 ADR-058 门禁。
- 浏览器复核：production build + 真实后端只读代理中，导航栏与关于页均显示 `v3.1.0`，控制台无 error、warn 或 issue；没有执行保存、同步或其他生产写入。
- 遗留风险：CodeMirror 首次视口布局与无 CrUX 数据的风险维持 FE-3163 结论；Wrangler 4.116.0 虽可用，但最新 Miniflare 仍依赖受通告影响的 Sharp 0.35.2，临发布不做无收益工具链升级。仓库改动仍未提交、推送、打 tag、发布或部署。
- 测试交接：`http://127.0.0.1:8787/#/resources/nodes` 保留 `3.1.0` production build 编辑窗口，代理继续阻止持久化写入。
- 下一任务：由用户审阅工作区后决定提交、推送、打 `v3.1.0` tag 和部署的具体顺序。

### 2026-08-06：FE-3170 GitHub 双向同步 JSON 内容顺序保真

- 完成内容：业务 Profile、节点、模板、Adapter 与 Ruleset 的 GitHub 输出改为保留对象字段和数组顺序的两空格、LF、末尾换行 JSON；GitHub 拉取通过 Zod 完整校验后保留原始已验证对象，R2 revision 校验不再用 schema 输出重建字段顺序。
- 同步兼容：既有递归排序哈希继续作为顺序无关语义摘要，因此 `3.1.0` 的 `baseContentHash` 无需迁移；新增标准化输出表示指纹。语义相同但字段顺序不同时不产生业务冲突，显式 push/pull 分别以 R2/GitHub 一侧顺序执行，不再错误返回 noop。Manifest 文件摘要继续对应实际输出字节。
- 测试：先新增并确认导出、导入和 order-only 同步方向测试在旧实现失败；最终完整 `npm run verify` 在非受限环境通过，包括 lint、许可证、shared/web/worker typecheck、116 项 unit、67 项 integration、production build、三段 bundle 门禁、Chromium 桌面/移动 22 项与 Firefox 2 项 E2E。
- 边界：不新增依赖、不修改 workspace schema、revision、SRS、认证或 GitHub 覆盖安全语义；不保存原始空白文本。`3.1.1` 仍在开发中，package 与公开稳定版本保持 `3.1.0`，本任务未提交、推送、部署或写入真实 R2/GitHub。
- 下一任务：继续收集 `3.1.1` 修复项；准备发布时再统一更新 package、应用与 README 稳定版本号并执行发布审计。

### 2026-08-06：FE-3171 3.1.1 生产更新测试准备

- 完成内容：package、lockfile、构建时应用版本、中英文 README 徽章、版本 E2E 和部署恢复文档统一更新为 `3.1.1`；公开文档只展示当前项目版本，不增加更新日志或发布说明。
- 验证：package 三处版本一致性检查为 `3.1.1 / 3.1.1 / 3.1.1`；完整 shared/web/worker typecheck 与 production build 通过，桌面和移动 Chromium 版本显示专项 2 项通过。版本更新前同一代码状态的完整 `npm run verify` 已通过 116 项 unit、67 项 integration、Chromium 22 项及 Firefox 2 项。
- 发布边界：当前工作区已准备供用户推送生产更新测试，但本任务未执行 commit、push、tag、GitHub Release、Cloudflare 部署、Secret 变更或 R2/GitHub 数据操作。生产测试确认后再把 `3.1.1` 从候选状态收束为已发布稳定版。
- 下一任务：用户在生产验证 GitHub push/pull 后反馈结果，随后决定是否继续收集修复或完成 `3.1.1` 发布审计。

### 2026-10-12：FE-3180 3.1.2 修复与适配器退场

- 根因复现：builder 单测确认模板 note 泄漏；Chromium 真实点击排除后仍显示包含，复现空关键词导致受控 Select 状态被丢弃。
- 实现：共同 builder 出口清理配置根及入站/出站 note、_sing_sub，保留源数据、对象/数组顺序和 headers 同名业务键；预览 GET/POST、订阅与缓存命中均有集成覆盖，旧产物缓存命名空间升级为 profile-v3。筛选器保留草稿模式，预览/保存才过滤空关键词。
- 移除：前端导航/路由/选择器/资源类型、shared schema、Momo 预设、Worker CRUD/builder/sync 支持及用户文档全部清理；运行时不保留 adapterUrl、assets.adapters 或旧格式 reader。workspace schema v3，Profile configs 与模板/节点/规则集源数据仍分立。package/lockfile 项目版本统一为 3.1.2，不改依赖版本。
- 升级：独立本地工具校验 v2 备份与 head 哈希，删除适配器及依赖 Profile，生成 v3 previous/current 两个快照、候选 head、报告与 GitHub 树。验证新运行时读取和 retention dry-run；不修改输入或历史快照，不连接远端。部署前操作见 docs/operations/workspace-upgrade.md。
- 通过：lint、许可证、shared/web/worker typecheck（含离线转换模块）、116 unit、69 integration、生产构建与三段预算、Chromium 桌面/移动 24 项 E2E、Worker dry-run。JS gzip：普通应用 282.62 KiB、编辑器 113.54 KiB、合计 396.16 KiB。离线 CLI 用合成数据成功生成文件，未输出私有生产数据。
- FE-3181：完整 verify 执行到 Firefox 阶段失败，3 项均在 browser launch 前失败。Windows SideBySide 日志显示缺少 mozglue dependent assembly；官方 151.0 (1532)、153.0 (1538)、150.0.2 (1522) 包均无法启动。没有修改项目浏览器依赖或跳过原 Firefox gate，需可用 Windows Firefox 环境补验。
- 边界：未 commit、push、tag、发布或部署，未写生产 R2/GitHub，未轮换 Secret；真实数据仍需按维护窗口流程应用离线输出。

### 2026-10-12：用户交互验收与 GitHub 交付

- 用户确认本地 3.1.2 前端连接正式后端的交互测试通过；该入口只允许读取、认证与临时预览，人工验收不包含生产保存、删除、同步或新版 Worker 的产物生成。
- 新版 Worker 产物隔离与写入行为由本地单元/集成测试覆盖；Firefox 环境问题仍保留 FE-3181，PR CI 在 Linux 安装浏览器后执行完整 verify。
- 按用户授权停止本轮预览，清理仓库内测试报告、合成升级样例、dry-run 输出与构建/Vite 缓存；保留依赖、凭据和已有本地 Worker 数据。
- 代码与文档提交到 codex/3.1.2-fixes 分支，用户稍后手动 PR 到 main。合并可能触发自动部署，须先完成 workspace v2→v3 升级维护准备；本轮不创建 PR、不合并、不部署、不写生产数据。

## 完成记录模板

```text
### YYYY-MM-DD：FE-NNNN 标题
- 完成内容：
- 文件/模块：
- 验证：
- 遗留风险：
- 下一任务：
```

### 2026-10-12：FE-3182 一次性自动升级

- DONE：R2 current 读取入口检测 v2，独立转换模块校验并备份原 head/snapshot，发布 v3 previous/current 后 CAS 切换；冲突重读、失败可重试，历史读取和业务 schema 仍只支持 v3。备份不受 revision retention 清理。
- 验证：191 项 unit/integration 全部通过，覆盖首次访问 bootstrap/login、重复读取不写入、并发首次访问、并发旧版保存、部分失败重试、损坏数据拒绝和 retention。lint、shared/web/worker 类型、生产构建及 Worker dry-run 通过；本轮 Chromium 桌面/移动 24 项 E2E 再次通过，Firefox 因已记录的本机启动问题待 PR CI。
- 文档：取消必须手工迁移的操作要求；明确首次访问自动转换、删除范围及 GitHub 显式覆盖推送。未修改生产数据或部署。

### 2026-10-12：FE-3190 3.1.3 一次性迁移退场

- 删除 v2→v3 转换模块、current 读取钩子、备份 key 生成器、离线工具及迁移专用测试；保留严格 v3 校验，不修改现有 R2 备份或数据。
- 184 项 unit/integration 通过，包含旧 current/readRevision 拒绝且零写入回归；shared/web/worker 类型、lint、构建和 Worker dry-run 通过。
- 升级文档明确旧 v2 安装先经过 3.1.2；项目版本准备为 3.1.3，公开稳定徽章保留已验证的 3.1.2。

### 2026-10-12：FE-3191 手动同步与拉取刷新

- 修复 UI 把 canPush/canPull 当作覆盖权限导致冲突双按钮禁用的问题；已连接且空闲时可选择方向，安全方向发送 safe，其他方向经确认发送 overwrite，取消零请求。Worker 同步协议不变。
- 拉取成功通过 typed API 重读工作区，重置资源缓存，避免新 revision 搭配旧配置；回归先复现旧列表未更新再验证修复。
- Chromium 桌面/移动完整 40 项通过，含 18 项同步测试（首次、双端冲突、单端双向、取消确认、拉取后显示新配置）。lint、全部类型、184 项 unit/integration、生产构建、许可证、包预算和 Worker dry-run 通过。最终 gzip：普通应用 282.67 KiB、编辑器 113.54 KiB、合计 396.21 KiB。
- Firefox 3 项均在 browserType.launch 阶段 spawn UNKNOWN，未进入应用；FE-3181 继续 BLOCKED，需 CI/可用 Firefox 环境验证，不能声称完整 verify 通过。所有同步测试均使用 mock/fake，无真实 R2/GitHub 写入。
