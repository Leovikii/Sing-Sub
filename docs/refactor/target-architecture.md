# 目标架构

## 系统边界

```text
Browser
  -> Vue route/page
  -> feature component/composable
  -> Pinia store
  -> typed API client
  -> Worker HTTP route
  -> application command/query
  -> domain/store port
  -> R2 WorkspaceStore/ArtifactStore adapter
```

外部流程：

```text
Ruleset changed
  -> public source JSON from current R2 revision
  -> optional deterministic R2 build job
  -> short-lived job ticket + connected private repository Actions dispatcher
  -> official sing-box compiler
  -> authenticated Worker callback
  -> R2 artifact
  -> workspace revision active artifact pointer

User requests sync
  -> GitHub sync service
  -> R2 base + actual GitHub tree hash/diff gate
  -> one GitHub batch commit or one R2 workspace revision publish
```

R2 Standard 是唯一持久化真相来源。业务状态通过 immutable workspace revision 与 ETag 条件更新的 head pointer 发布；Workers Cache API 只保存可丢弃响应，签名 Cookie 承担会话。GitHub 不实现业务 repository port，只实现可选 sync/backup gateway。领域与应用层不能导入 `Request`、`Response`、Cloudflare binding 类型、GitHub DTO 或 Vue 类型。

## 完整目标目录

```text
Sing-Sub/
├─ .github/
│  └─ workflows/
│     └─ ci.yml
├─ scripts/
│  └─ deploy-cloudflare.mjs
├─ templates/
│  └─ github/
│     └─ compile-srs.yml
├─ docs/
│  ├─ README.md
│  ├─ refactor/
│  │  ├─ README.md
│  │  ├─ current-state.md
│  │  ├─ data-architecture.md
│  │  ├─ target-architecture.md
│  │  ├─ engineering-standards.md
│  │  ├─ roadmap.md
│  │  ├─ decisions.md
│  │  └─ progress.md
│  └─ operations/
│     ├─ backup-restore.md
│     ├─ deployment.md
│     ├─ github-sync.md
│     ├─ srs-compiler.md
│     └─ troubleshooting.md
├─ public/
│  └─ favicon.svg
├─ shared/
│  ├─ contracts/
│  │  ├─ api.ts
│  │  ├─ assets.ts
│  │  ├─ auth.ts
│  │  ├─ errors.ts
│  │  ├─ profiles.ts
│  │  ├─ rulesets.ts
│  │  ├─ srs-builds.ts
│  │  ├─ sync.ts
│  │  └─ workspace.ts
│  ├─ schemas/
│  │  ├─ asset.schema.ts
│  │  ├─ profile.schema.ts
│  │  ├─ request.schema.ts
│  │  ├─ ruleset.schema.ts
│  │  └─ sync-manifest.schema.ts
│  └─ index.ts
├─ src/
│  ├─ app/
│  │  ├─ App.vue
│  │  ├─ bootstrap.ts
│  │  ├─ providers.ts
│  │  └─ routes.ts
│  ├─ api/
│  │  ├─ client.ts
│  │  ├─ endpoints/
│  │  │  ├─ assets.ts
│  │  │  ├─ auth.ts
│  │  │  ├─ profiles.ts
│  │  │  ├─ rulesets.ts
│  │  │  ├─ srs-builds.ts
│  │  │  ├─ sync.ts
│  │  │  └─ workspace.ts
│  │  ├─ error-messages.ts
│  │  └─ types.ts
│  ├─ components/
│  │  ├─ app/
│  │  │  ├─ AppButton.vue
│  │  │  ├─ AppDialog.vue
│  │  │  └─ AsyncState.vue
│  │  └─ layout/
│  │     ├─ AppNavigation.vue
│  │     ├─ AppSidebar.vue
│  │     ├─ MobileNavigation.vue
│  │     ├─ AppShell.vue
│  │     └─ TopToolbar.vue
│  ├─ editors/
│  │  ├─ CodeEditor.vue
│  │  ├─ CodePreview.vue
│  │  └─ EditorToolbar.vue
│  ├─ features/
│  │  ├─ auth/
│  │  │  ├─ ConnectPage.vue
│  │  │  └─ components/
│  │  │     └─ ConnectForm.vue
│  │  ├─ resources/
│  │  │  ├─ ResourcePage.vue
│  │  │  ├─ components/
│  │  │  │  ├─ AssetCard.vue
│  │  │  │  ├─ AssetEditorDialog.vue
│  │  │  │  └─ ResourceList.vue
│  │  │  └─ composables/
│  │  │     └─ useAssetDraft.ts
│  │  ├─ profiles/
│  │  │  ├─ ProfileListPage.vue
│  │  │  ├─ components/
│  │  │  │  ├─ ProfileCard.vue
│  │  │  │  ├─ ProfileEditorDialog.vue
│  │  │  │  ├─ ProfileInbounds.vue
│  │  │  │  ├─ ProfileOutbounds.vue
│  │  │  │  └─ ProfileTemplateConfig.vue
│  │  │  └─ composables/
│  │  │     ├─ useProfileDraft.ts
│  │  │     └─ useProfilePreview.ts
│  │  ├─ rulesets/
│  │  │  ├─ RulesetPage.vue
│  │  │  ├─ components/
│  │  │  │  ├─ RuleSetEditor.vue
│  │  │  │  └─ SrsBuildStatus.vue
│  │  │  └─ composables/
│  │  │     └─ useSrsBuild.ts
│  │  ├─ settings/
│  │  │  ├─ SettingsPage.vue
│  │  │  └─ components/
│  │  │     ├─ GeneralSettings.vue
│  │  │     ├─ SubscriptionSettings.vue
│  │  │     ├─ RepositorySettings.vue
│  │  │     └─ AboutSettings.vue
│  │  └─ sync/
│  │     ├─ SyncPage.vue
│  │     ├─ components/
│  │     │  ├─ SyncConflictDialog.vue
│  │     │  ├─ SyncDiff.vue
│  │     │  └─ SyncSettings.vue
│  │     └─ composables/
│  │        └─ useSyncJob.ts
│  ├─ i18n/
│  │  ├─ index.ts
│  │  ├─ primevue.ts
│  │  └─ messages/
│  │     ├─ en-US.ts
│  │     └─ zh-CN.ts
│  ├─ stores/
│  │  ├─ assets.ts
│  │  ├─ profiles.ts
│  │  ├─ rulesets.ts
│  │  ├─ session.ts
│  │  └─ sync.ts
│  ├─ theme/
│  │  ├─ primevue-preset.ts
│  │  └─ tokens.css
│  ├─ main.ts
│  └─ style.css
├─ worker/
│  ├─ application/
│  │  ├─ commands/
│  │  │  ├─ assets/
│  │  │  │  ├─ deleteAsset.ts
│  │  │  │  └─ saveAsset.ts
│  │  │  ├─ profiles/
│  │  │  │  ├─ deleteProfile.ts
│  │  │  │  └─ saveProfile.ts
│  │  │  ├─ rulesets/
│  │  │  │  ├─ deleteRuleset.ts
│  │  │  │  ├─ retrySrsBuild.ts
│  │  │  │  └─ saveRuleset.ts
│  │  │  ├─ sync/
│  │  │  │  ├─ pullFromGithub.ts
│  │  │  │  ├─ pushToGithub.ts
│  │  │  │  └─ restoreSnapshot.ts
│  │  │  └─ updateSettings.ts
│  │  ├─ queries/
│  │  │  ├─ getAssets.ts
│  │  │  ├─ getBootstrap.ts
│  │  │  ├─ getProfiles.ts
│  │  │  ├─ getRulesets.ts
│  │  │  ├─ getStorageUsage.ts
│  │  │  └─ getSyncStatus.ts
│  │  ├─ ports/
│  │  │  ├─ artifactStore.ts
│  │  │  ├─ compilerDispatcher.ts
│  │  │  ├─ syncGateway.ts
│  │  │  └─ workspaceStore.ts
│  │  └─ services/
│  │     ├─ profileBuildService.ts
│  │     ├─ srsBuildService.ts
│  │     └─ syncService.ts
│  ├─ domain/
│  │  ├─ assets/
│  │  │  ├─ asset.ts
│  │  │  └─ assetName.ts
│  │  ├─ profiles/
│  │  │  ├─ buildProfile.ts
│  │  │  ├─ applyAdapter.ts
│  │  │  └─ profile.ts
│  │  ├─ revisions/
│  │  │  ├─ conflict.ts
│  │  │  └─ revision.ts
│  │  ├─ rulesets/
│  │  │  ├─ importRules.ts
│  │  │  ├─ ruleset.ts
│  │  │  └─ validation.ts
│  │  ├─ srs/
│  │  │  ├─ artifact.ts
│  │  │  └─ buildJob.ts
│  │  └─ sync/
│  │     ├─ diff.ts
│  │     ├─ manifest.ts
│  │     └─ syncState.ts
│  ├─ http/
│  │  ├─ middleware/
│  │  │  ├─ authenticate.ts
│  │  │  ├─ errorBoundary.ts
│  │  │  └─ securityHeaders.ts
│  │  ├─ routes/
│  │  │  ├─ assets.ts
│  │  │  ├─ auth.ts
│  │  │  ├─ internal-srs.ts
│  │  │  ├─ profiles.ts
│  │  │  ├─ public.ts
│  │  │  ├─ rulesets.ts
│  │  │  ├─ sync.ts
│  │  │  └─ workspace.ts
│  │  ├─ response.ts
│  │  └─ router.ts
│  ├─ infrastructure/
│  │  ├─ crypto/
│  │  │  └─ snapshotCrypto.ts
│  │  ├─ github/
│  │  │  ├─ actions/
│  │  │  │  └─ githubActionsDispatcher.ts
│  │  │  ├─ client/
│  │  │  │  ├─ githubClient.ts
│  │  │  │  ├─ githubError.ts
│  │  │  │  └─ retryPolicy.ts
│  │  │  └─ sync/
│  │  │     ├─ githubSyncGateway.ts
│  │  │     ├─ manifestCodec.ts
│  │  │     └─ treeCommit.ts
│  │  ├─ r2/
│  │  │  ├─ r2ArtifactStore.ts
│  │  │  ├─ r2ObjectKeys.ts
│  │  │  ├─ r2PrivateMetadataStore.ts
│  │  │  └─ r2WorkspaceStore.ts
│  │  └─ remote/
│  │     └─ publicJsonClient.ts
│  ├─ scheduled/
│  │  ├─ cleanupArtifacts.ts
│  │  ├─ cleanupRevisions.ts
│  │  └─ retryJobs.ts
│  ├─ composition/
│  │  └─ createApplication.ts
│  ├─ index.ts
│  └─ types.ts
├─ tests/
│  ├─ e2e/
│  │  ├─ assets.spec.ts
│  │  ├─ auth.spec.ts
│  │  ├─ profiles.spec.ts
│  │  ├─ rulesets.spec.ts
│  │  ├─ settings.spec.ts
│  │  └─ sync.spec.ts
│  ├─ fixtures/
│  │  ├─ assets.ts
│  │  ├─ github.ts
│  │  ├─ profiles.ts
│  │  └─ rulesets.ts
│  ├─ integration/
│  │  ├─ githubSync.test.ts
│  │  ├─ migration.test.ts
│  │  ├─ r2WorkspaceStore.test.ts
│  │  ├─ srsBuildProtocol.test.ts
│  │  └─ workerRoutes.test.ts
│  └─ unit/
│     ├─ domain/
│     ├─ frontend/
│     └─ shared/
├─ eslint.config.js
├─ index.html
├─ package.json
├─ playwright.config.ts
├─ tsconfig.app.json
├─ tsconfig.shared.json
├─ tsconfig.worker.json
├─ vite.config.ts
├─ vitest.config.ts
├─ vitest.worker.config.ts
├─ wrangler.toml
└─ package-lock.json
```

上面的目录是早期设计展开图，用于表达职责，不要求机械创建每一个文件。`v3.0.0-beta.1` 发布前的实际落地结构如下，并作为当前代码布局的事实基准：

```text
Sing-Sub/
├─ shared/                 # 浏览器与 Worker 共用 contracts/schemas
├─ src/
│  ├─ api/                 # 唯一浏览器 fetch 出口
│  ├─ app/                 # Router 配置
│  ├─ components/          # 项目级布局、编辑器和语义组件
│  ├─ features/            # workspace/settings/sync 页面
│  ├─ i18n/                # zh-CN/en-US 与 PrimeVue locale
│  ├─ stores/              # Pinia 状态
│  └─ theme/               # PrimeVue preset
├─ worker/
│  ├─ application/         # commands、auth、migration、ports、SRS、sync
│  ├─ composition/         # adapter 组装
│  ├─ domain/              # asset/revision/ruleset/sync/workspace 规则
│  ├─ http/                # 认证入口
│  ├─ infrastructure/      # cache、GitHub、legacy import、R2、security
│  ├─ lib/                 # 通用 build/response/logging/ruleset 边界
│  └─ routes/              # Worker HTTP handlers
├─ templates/github/       # 自动 provision 的 SRS workflow
├─ tests/                  # unit/integration/e2e 与 fakes
├─ docs/refactor/          # 架构、标准、决策和进度
└─ docs/operations/        # 部署、同步、编译和恢复说明
```

有意保留的差异：小型前端没有为每个 feature 再建立多层空目录；Worker routes 暂时集中在 `worker/routes`，避免只为目录纯度搬迁稳定代码；legacy 目录只承担显式旧数据导入，不参与日常 CRUD。没有实际调用方的 facade、基础 UI wrapper 和空占位目录不得保留。

## 模块职责

### `shared`

浏览器与 Worker 共用的纯 TypeScript contract、schema 和错误码。不得导入 Vue、Cloudflare、GitHub SDK 或 Node 专用模块。

### `worker/domain`

不依赖网络与存储的业务规则：JSON 拼装、revision、SRS job 状态、sync manifest 与 diff。必须可直接单元测试。

### `worker/application`

按用例组织流程，通过 ports 使用 R2、GitHub Actions 和 GitHub sync。commands 从 current workspace 产生新 revision，queries 只读取。

### `worker/infrastructure/r2`

唯一持久化 adapter。`r2WorkspaceStore` 负责 immutable revision、head ETag CAS、回滚与历史；`r2ArtifactStore` 负责 SRS；private metadata 与普通 revision 隔离。R2 key 由集中模块生成。

### `worker/infrastructure/github`

仅包含 Actions dispatch 和可选 sync/backup。它不是 Profile/Asset/Ruleset 的在线 repository。

### `worker/http`

只负责路由、认证、schema、use case 和响应映射。内部 SRS callback 使用独立认证与严格 body limit。

### `src/api`

浏览器唯一网络出口，负责 envelope、401、AbortSignal、类型化 endpoint 和错误转换，不负责 Toast 或 Router。

### `src/stores`

保存跨页面服务器状态。编辑器 draft 保留在 feature composable，避免 store 承担所有局部状态。

### `src/components` 与 `src/features`

`components` 只保留项目级语义组件与布局；`features` 按业务组织页面和局部逻辑。PrimeVue 能直接满足的基础控件不自研。
