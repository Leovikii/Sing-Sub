# 重构路线图

## 总体策略

最终存储方向锁定为：R2 Standard 唯一持久化、Workers Cache API 可丢弃缓存、签名 Cookie 会话、Actions SRS compiler、GitHub optional sync/backup。

执行顺序：

1. 建立类型、测试和 CI 安全网。
2. 固定 shared contract、API error 和 workspace revision 语义。
3. 建立 R2 WorkspaceStore、head ETag CAS、signed auth 与 retention。
4. 一次性导入现有 GitHub/KV 数据并切换 R2 主读写；新部署默认创建空 workspace，GitHub 导入可选。
5. 接入 Actions 编译回调与 R2 artifact 发布。
6. 实现可选 GitHub backup/editable sync。
7. 在稳定 API 上迁移 PrimeVue、i18n、Pinia、Router 和 feature。
8. 删除旧 GitHub CRUD、KV、旧 UI 和兼容层，完成安全与运维收尾。

禁止在同一个 PR 中同时切换主存储和大面积更换 UI。

## Phase 0：基线与安全网

目标：让现有 GitHub-first 行为可验证，为数据迁移提供回归基准。

任务：

- 新增 Worker typecheck、ESLint、Vitest、Playwright 和统一 verify。
- 对 profile build、ruleset parse、asset path、当前 GitHub CRUD 添加 characterization tests。
- 为登录、profile save、asset update、ruleset save 添加 desktop/mobile smoke。
- CI 执行与本地一致的 required checks。

验收：`npm run verify` 可重复通过，Worker 源码纳入类型检查，关键旧行为有回归测试。

## Phase 1：共享契约、API 与 revision

目标：先固定前后端语言和未来 R2 head 并发语义。

任务：

- 创建 `shared/contracts`、`shared/schemas`。
- 合并 Profile、State、Asset、Ruleset、Settings 重复类型。
- 定义 API envelope、`ApiErrorCode`、workspace revision、build/sync status。
- 建立 HTTP error boundary 与 typed `src/api/client.ts`/endpoints。
- 移除 feature 直接 fetch，先迁移 AssetManager。
- 定义 `WorkspaceStore`、`ArtifactStore`、`SyncGateway`、`CompilerDispatcher` ports 与 fake adapters。
- application command 只依赖 ports，不直接依赖 GitHub、R2 或旧 KV。

验收：

- 浏览器只有 `src/api/client.ts` 调用 fetch。
- 公共 API 不返回 `any`，错误使用稳定 code。
- workspace update contract 携带 expected revision。
- application 可用 fake ports 测试。

## Phase 2：R2 workspace 数据面

目标：建立 R2-only 最终存储能力，但暂不切换生产读写。

任务：

- 用户启用 R2 Standard，创建 private bucket 并记录 binding。
- 定义 canonical `WorkspaceSnapshot`、head、revision、private metadata 和 job schema。
- 实现集中 `r2ObjectKeys.ts`，禁止 route 直接构造 key。
- 实现 `R2WorkspaceStore.read/readRevision/publish/list/restore`。
- publish 使用 immutable revision + head ETag conditional put；冲突返回判别错误。
- 实现 `R2ArtifactStore`、private credential store 与 deterministic job store。
- 实现 signed Cookie、HMAC subscription token 和 auth version。
- 实现 Cache API revisioned response cache。
- 实现 revision/artifact retention、orphan grace period、usage soft budget。
- 使用 local R2 fake/miniflare 做 integration tests。

验收：

- 从空 bucket 可创建首个 workspace/head。
- CRUD command、rename、ETag conflict、restore 与 head recovery 有测试。
- head 失败不会暴露 orphan revision。
- Cookie/token 篡改、到期和 auth version 有测试。
- Wrangler dry-run 只识别 R2，不新增 D1/KV binding。

## Phase 3：现有数据迁移与主存储切换

目标：把在线读写从 GitHub + KV snapshot 切换到 R2 WorkspaceStore。

任务：

- 实现 legacy GitHub source reader 与旧 KV settings reader，仅用于迁移。
- 实现 dry-run：下载、schema 校验、名称冲突、容量和摘要。
- 将 repo 文件转换为 canonical WorkspaceSnapshot。
- 写入首个 immutable revision、private credential 和 migration metadata，再 conditional create head。
- 将 Bootstrap/Profile/Asset/Ruleset/Settings routes 切换 WorkspaceStore。
- subscription builder 从 current revision 读取，Cache API 只缓存结果。
- 删除 dashboard profile/asset snapshot 主读取路径。
- 切换完成后删除 KV binding、KV key helpers 与实时 GitHub CRUD imports。
- 空 R2 默认支持密码-only 初始化；GitHub 仓库与 PAT 只在用户选择导入时要求。
- 完成迁移前导出、失败回滚和恢复说明。

迁移策略：

```text
freeze writes -> export GitHub/KV -> dry-run -> write immutable revision
-> conditional create head -> switch routes -> verify -> remove KV -> unfreeze
```

验收：

- 现有 GitHub/KV 数据可完整导入 R2。
- 导入失败不创建 head，不产生半迁移可见状态。
- 日常 CRUD 零 GitHub API、零 KV 调用。
- Profile/Asset/Ruleset CRUD、预览和订阅 E2E 在 R2 上通过。
- GitHub commit 与旧 KV 代码只剩 migration/sync 明确调用方。

## Phase 4：SRS Actions 编译与 R2 发布

目标：规则集 JSON 始终从 R2 公开分发；连接私有仓库并启用可选编译配置时，由该仓库的无状态 Actions 编译 SRS 并写回同一 R2 bucket。

任务：

- 将固定版本/checksum 的 `compile-srs.yml` 作为可安装模板维护，不让 Sing-Sub 源码仓库承担用户编译服务。
- 已连接私有仓库与可 provision/dispatch 的 PAT 是 SRS 可选能力，不进入普通用户初始化；SRS enable command 自动安装/升级 workflow 并扫描待编译 ruleset。
- 将 callback static secret 替换为由 deployment signing secret 派生的短期 job ticket；workflow 不再依赖 GitHub Actions Secret/Variable。
- 实现 `/rules/{ruleset}.json`，从 current revision 返回去除 `_sing_sub` 的 source format ruleset。
- ruleset save 生成 deterministic job descriptor 与 pending build summary。
- 实现 GitHub Actions dispatcher，input 只含 opaque IDs。
- 实现 `/internal/srs-jobs/*` source/complete/failed endpoints。
- 实现 job ticket auth、body limit、SHA-256 和 sourceHash 校验。
- 编译成功写 immutable artifact，再基于最新 head 合并 active pointer。
- 实现 callback CAS retry、superseded、idempotent、管理员显式 dispatch retry 与 retention cleanup；默认不增加 Cron。
- 实现 compiler enable/disable/status API、workflow hash/upsert、permission/visibility validation、有限并发的 pending ruleset reconcile 与 ticket security tests。
- SRS endpoint 从 current revision pointer 读取 private R2 object，并以 `/rules/{ruleset}.srs` 公开分发；JSON/SRS 均不复用私有配置订阅 Token。
- UI/API 暴露 pending/compiling/ready/failed/superseded。

验收：

- 日常 ruleset save 不 commit GitHub 文件。
- 未配置 compiler 时 ruleset source 保存、WebUI、R2 CRUD、私有配置订阅和 `/rules/{ruleset}.json` 正常工作，不产生永久 pending job。
- GitHub Actions 不持有 Cloudflare 存储凭据。
- callback 不会覆盖并发 workspace 修改。
- stale result 不能激活，新构建失败时旧 SRS 继续可用。
- SRS link 正确返回 ETag/Cache-Control。
- 任何包含额外 path segment 的 ruleset URL 返回 404；公开 JSON/SRS router 不导入或复用私有配置凭据。

## Phase 5：GitHub backup 与 editable sync

目标：GitHub 变为可关闭的站外备份和人工双向同步介质。

任务：

- 定义 sync manifest schema、路径 codec、稳定 pretty JSON、完整 file hash 集与整体业务内容摘要。
- 实现 WorkspaceSnapshot -> GitHub canonical 文件树 export，以及 GitHub -> snapshot 的完整 download/validate/dry-run/import。
- R2 保存上次成功同步的 base workspace revision、base GitHub commit 与 base content hash；GitHub manifest 只描述最近一次 Worker 导出，不作为远端当前状态真相。
- 每次预检读取 GitHub 实际受管文件树，以 base/local/remote 整体摘要判断 `synced`、`local-ahead`、`remote-ahead` 或 `conflict`，同时生成文件级新增/修改/删除摘要供 UI 展示。
- 第一版不自动执行逐文件或 JSON 字段级合并。双方均变化时阻止普通同步，只接受用户明确选择的“R2 覆盖 GitHub”或“GitHub 覆盖 R2”。
- push 使用一次 Git tree/commit 提交全部变化，不 force push、不修改受管目录外文件；pull 将确认后的远端状态发布为一个新 workspace revision。
- 支持 no-op/内容已一致、首次同步显式选边、private repo 检查、fine-grained PAT、远端 head 与 R2 expected revision 乐观锁。
- private credential 不进入 export；SRS artifact 不进入同步树。
- 增加 repository connect/disconnect 与 sync status/diff/push/pull API；PrimeVue 页面在 Phase 6/7 接入。
- 独立加密时间快照不进入本阶段；R2 revision 与 Git commit 已提供版本历史，未来只有出现明确保留需求时再通过新 ADR 增加。

验收：

- 关闭 GitHub sync 不影响 CRUD、订阅或 SRS。
- never、local-only、remote-only、same、both-changed、delete 与显式整侧覆盖均有测试。
- 一次主动 push 最多一个 commit。
- pull/push 前可查看 diff；GitHub head 或 R2 head 并发变化不会自动覆盖。
- GitHub 可用于 bucket/account 级站外恢复。

## Phase 6：前端平台基础

目标：在稳定 R2 API 上引入成熟前端基础设施。

任务：

- 安装实施时最新稳定 PrimeVue；禁止 RC。
- 创建品牌粉色与中性 surface theme preset。
- 引入 Vue I18n，建立 `zh-CN`、`en-US` 与 key parity test。
- 同步 PrimeVue locale、document lang 和 localStorage。
- 引入 Pinia：session/profiles/assets/rulesets/sync stores；Toast 保持短期 UI 状态，不建立历史通知中心。
- 引入 Vue Router：connect/profiles/resources/:kind/sync/settings/:section。
- App shell 接入 RouterView，使用一份侧栏 DOM 实现桌面常驻与窄屏 off-canvas，清空 `App.vue` 业务状态。
- 导航固定为配置、资源（节点集/模板/补丁/规则集）、同步、设置（通用/订阅/仓库/关于）；规则集属于资源但使用专属子路由和页面。
- 建立少量项目语义组件，不复制 PrimeVue primitives。
- 删除旧全局刷新按钮、`/api/rebuild`、`?refresh=1` 与“从 GitHub 同步组件”文案；多设备冲突改为明确 reload/discard 流程。

验收：PrimeVue、i18n、Pinia、Router 可共同构建运行，locale 切换刷新保持，App.vue 只保留入口。

## Phase 7：UI 与 feature 迁移

目标：删除自研基础交互，按 feature 拆分 WebUI。

迁移顺序：

1. Connect/settings：验证表单、Button、Input、Select、i18n；设置按通用/订阅/仓库/关于分类。
2. Toast/Confirm/Dialog/Popover：替换高风险基础交互。
3. Asset feature：workspace revision、draft、conflict、CRUD。
4. Profile feature：store、draft、preview、nested editors。
5. Ruleset feature：作为资源子路由实现独立 save/build status、retry、JSON/SRS link 与规则来源更新。
6. Sync feature：独立操作页实现 push/pull/diff/conflict/status；仓库连接与 SRS 全局开关留在设置/仓库。
7. Editor toolbar 与侧栏 navigation/layout；同一侧栏桌面常驻、窄屏展开，标题只出现一次。

补充约束：Profile 编辑器模板只允许引用 workspace 模板资产；自定义外部 URL 不属于当前 UI 范围。响应式侧栏保持单一 DOM 并通过状态动画展开/收回。

每个 feature 同时完成 i18n、typed endpoint/store、本地 draft、完整状态和 desktop/mobile E2E，并删除对应旧组件。

验收：自研 Button/Input/Select/Dialog/Popover/Toast 已删除；相同动作图标和样式一致；保存、构建、同步状态独立；中英文关键流程可操作。

## Phase 8：安全、预算、清理与发布

目标：落实基本安全、资源预算并删除所有旧路径。

任务：

- 接受 workspace/session scope ADR，隔离 SRS ticket 派生域、sync PAT 和 backup key。
- 增加 request ID、安全日志、error redaction、Cookie/CSP/callback 审计，并评估公开域名下登录滥用的 Cloudflare rate limit/Turnstile 边界。
- 配置 R2 usage、revision/artifact retention、orphan cleanup 和 1 GiB 软提示。
- 删除旧实时 GitHub CRUD、compile workflow string、KV binding、dashboard snapshot 和兼容 facade。
- 删除旧 UI primitives、重复 types、unused CSS 和 dead code。
- 强化 boundary lint，更新 README/Wiki/operations 文档。
- 运行完整 verify、Worker dry-run、desktop/mobile E2E。
- 演练 head/revision restore、SRS artifact restore 和 GitHub 站外恢复。

验收：

- 实际 imports 与 `target-architecture.md` 一致。
- 日常 CRUD 零 GitHub、零 KV、零 D1 调用。
- R2 revision、Actions 和 sync 可独立失败且不会静默覆盖 current workspace。
- 日志/API 不泄露私钥、PAT、Cookie 或 token。
- `progress.md` 无未完成必需任务，恢复演练通过。

## Phase 9：独立 Release 分发与受控升级（低优先级）

目标：核心重构稳定后，让普通用户无需 fork 或维护源码仓库即可完成首次部署和后续升级，同时禁止发现新版本后自动覆盖生产。

任务：

- 提供随 Release 分发的幂等 setup 命令，检查 Wrangler 登录、创建或选择 R2 bucket、配置 binding 和部署目标。
- 交互输入管理员口令；自动生成并上传两个独立 signing secret，不把值写入仓库或日志。
- 明确配置 workers.dev、自定义域名或 Route，部署后执行 bootstrap health check。
- 区分 `setup`、`update`、`rollback`；update 先执行 verify/dry-run，再由用户确认发布。
- 新 Release 只生成更新提示，不自动部署；维护仓库和用户本地的 deploy 均保持显式触发。
- 增加 Release CI：tag 后验证并发布源码归档、release manifest、checksum、兼容范围和升级说明，不接触用户 Cloudflare 账户。
- 提供 Windows 部署助手，输入必要信息后调用 Wrangler 完成首次部署；可检查、下载并校验稳定 Release，再经用户确认发布更新。
- 记录新旧 Worker version ID，支持代码版本回滚；R2 schema migration 与代码回滚保持独立。
- 编写独立 Release 从零部署 smoke test、失败恢复和 secret 轮换文档。

详细设想与安全边界见 `deployment-automation-backlog.md`。

验收：普通用户下载 Release 后不需要 fork、Git 或源码合并，也不需要理解 Worker ID、R2 binding 或 signing secret 生成细节即可完成部署；任何生产更新都有显式确认、发布物校验、健康检查和可见版本 ID。

## PR 切分规则

- 一个 PR 只解决一个可陈述架构目标。
- 测试基线、机械移动、行为修改、存储切换尽量分开。
- R2 主存储切换与 UI migration 不在同一个 PR。
- 数据语义变化必须包含 integration test。
- 兼容层在最后调用方迁移后立即删除，不长期双实现。
- 每个阶段保持可运行、可部署、可回滚。
