# 重构进度

最后更新：2026-07-17。

状态：`TODO`、`IN_PROGRESS`、`BLOCKED`、`DONE`、`SKIPPED`。

## 当前状态

- 当前阶段：Phase 0-9 已完成，进入 `3.0.0` 稳定维护阶段。
- 当前版本：`3.0.0`。
- 当前任务：无；`3.0.0` 源码与文档已满足发布门禁，tag、GitHub Release 和生产部署由维护者另行执行。
- 延期验证：缺少独立 Cloudflare 账户，fresh-account 从零部署、普通用户 `Sync fork` 和实际 Worker rollback 延期到首次外部部署、获得第二账户或真实故障时执行。Turnstile 与 Workers observability 按决策暂不启用。
- 当前生产已运行 Beta 版本；Worker 仅绑定 R2，不再绑定 KV；官方仓库 `main` 更新会由 Cloudflare Workers Builds 自动拉取并部署。
- 空 R2 默认只用管理员口令创建空 workspace；已有 workspace 的所有设备只用管理员口令登录。
- 规则集基础分发确定为 `/rules/{ruleset}.json`；SRS 优化分发为 `/rules/{ruleset}.srs`，两者均与私有配置订阅 Token 隔离。
- SRS compiler 只在连接私有数据仓库后显式启用，维护者与其他用户使用同一机制；网站部署使用源码 fork，初始化不要求数据仓库或 compiler 配置。
- 私有配置订阅按 current revision 动态构建；Cache API 只做 revision-aware 加速，前端不保留通用刷新/重建机制。

## 总进度

| Phase | 状态 | 完成条件摘要 |
|---|---|---|
| 0 基线与安全网 | DONE | Worker typecheck、lint、tests、verify、CI |
| 1 契约、API 与 revision | DONE | shared contracts、typed API、ports、无 feature fetch |
| 2 R2 workspace 数据面 | DONE | schemas、WorkspaceStore、ETag CAS、signed auth、retention |
| 3 主存储迁移 | DONE | 生产迁移验证、R2-only 部署、删除 KV binding/reader |
| 4 SRS 编译与 R2 发布 | DONE | Actions callback、artifact pointer、failure safety |
| 5 GitHub backup/sync | DONE | 安全方向同步、单 commit push、单 revision pull、恢复基准 |
| 6 前端平台 | DONE | PrimeVue、i18n、Pinia、Router、侧栏应用骨架 |
| 7 UI 与 feature 迁移 | DONE | 删除自研 primitives、双语与状态完整 |
| 8 安全、预算与发布 | DONE | secrets、retention、dead code、恢复演练 |
| 9 Beta 稳定与产品化 | DONE | 部署方案、目标适配器、前端优化、Beta 验收与正式版门禁 |

## 任务台账

### Phase 0

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-000 | DONE | 创建 Worker tsconfig 并纳入类型检查 | `npm run typecheck:worker` |
| RF-001 | DONE | 修复当前 Worker 类型错误 | Web/Worker typecheck |
| RF-002 | DONE | 添加 ESLint 和边界规则 | `npm run lint` |
| RF-003 | DONE | 引入 Vitest 和基础 fixtures | unit test |
| RF-004 | DONE | 为 builder/ruleset/path 添加 characterization tests | unit test |
| RF-005 | DONE | 为当前 GitHub CRUD/commit 添加 characterization tests | integration test |
| RF-006 | DONE | 引入 Playwright 和登录/CRUD smoke | desktop/mobile smoke |
| RF-007 | DONE | 建立 `npm run verify` 和 CI required checks | CI green |

### Phase 1

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-100 | DONE | 创建 shared contracts/schemas | typecheck + schema tests |
| RF-101 | DONE | 合并前后端重复类型 | import scan |
| RF-102 | DONE | 定义 API envelope/error codes | response tests |
| RF-103 | DONE | 定义 workspace revision/build/sync contracts | unit/typecheck |
| RF-104 | DONE | 建立 HTTP error boundary | error matrix tests |
| RF-105 | DONE | 建立 typed API client/endpoints | frontend tests |
| RF-106 | DONE | 移除 AssetManager 直接 fetch | `rg "fetch\\(" src` |
| RF-107 | DONE | 建立 R2-oriented application ports 与 fake adapters | use case tests |
| RF-108 | DONE | 消除公共 API `any` | typecheck + scan |

### Phase 2

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-200 | DONE | 启用/记录 R2 Standard private bucket `sing-sub-data` | binding documented |
| RF-201 | DONE | 添加 Wrangler `WORKSPACE_BUCKET` binding 与本地配置 | dry-run |
| RF-202 | DONE | 定义 workspace/head/revision/private/job schemas 与 key codec | schema tests |
| RF-203 | DONE | 实现 R2WorkspaceStore create/read/readRevision | integration |
| RF-204 | DONE | 实现 immutable publish 与 head ETag CAS | conflict matrix |
| RF-205 | DONE | 实现 list/restore/head recovery | restore tests |
| RF-206 | DONE | 实现 artifact/private credential/deterministic job stores | integration |
| RF-207 | DONE | 实现 signed Cookie、HMAC subscription token、auth version | security tests |
| RF-208 | DONE | 实现 Cache API revisioned response cache | cache tests |
| RF-209 | DONE | 实现 revision/artifact/orphan retention | retention tests |
| RF-210 | DONE | 实现 R2 usage/soft budget 配置 | budget tests |

### Phase 3

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-300 | DONE | 实现 legacy GitHub source reader | fixture integration |
| RF-301 | DONE | 实现 legacy KV settings reader 与迁移 export | migration tests |
| RF-302 | DONE | 实现 dry-run schema/name/size/conflict report | invalid fixtures |
| RF-303 | DONE | 写入首个 R2 revision/private metadata/head 与 migration record | rollback tests |
| RF-304 | DONE | Profile routes 切换 WorkspaceStore | route/E2E |
| RF-305 | DONE | Asset routes 切换 WorkspaceStore | route/E2E |
| RF-306 | DONE | Ruleset/Settings routes 切换 WorkspaceStore | route/E2E |
| RF-307 | DONE | Subscription builder 从 revision 读取、Cache API 缓存 | build/cache tests |
| RF-308 | DONE | 删除 dashboard snapshot 与实时 GitHub CRUD 主路径 | import/behavior scan |
| RF-309 | DONE | 删除 KV binding/helpers，完成迁移和回滚演练 | verify/dry-run/smoke + production deploy |

### Phase 4

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-400 | DONE | workflow 改为可安装到连接私有仓库的无状态模板 | YAML/action test |
| RF-401 | DONE | 固定 sing-box version/checksum | workflow review |
| RF-402 | DONE | ruleset save 创建 deterministic job 与 pending revision | R2 integration |
| RF-403 | DONE | 实现连接私有仓库的可选 GitHub Actions dispatcher | API fake tests |
| RF-404 | DONE | 实现 internal source endpoint/auth | route/security tests |
| RF-405 | DONE | 实现 complete/failed callback | callback matrix |
| RF-406 | DONE | 实现 R2 immutable artifact 与 workspace active pointer | atomic publish tests |
| RF-407 | DONE | 实现 superseded/idempotent/failure behavior | job state tests |
| RF-408 | SKIPPED | 不增加默认 Cron；复用 retention cleanup，失败改为显式 retry | ADR-028 |
| RF-409 | DONE | SRS endpoint 从 workspace pointer + R2 公开分发 | public/no-token/legacy-404 tests |
| RF-410 | DONE | 暴露 build status/retry API | route/integration；UI 归 Phase 7 |
| RF-411 | DONE | 公开分发 current revision source JSON ruleset | route/cache/security tests |
| RF-412 | DONE | 短期 job ticket 取代 static callback secret | unit/security matrix |
| RF-413 | DONE | GitHub workflow template hash/upsert 与 PAT 权限/visibility validation | GitHub API fake integration |
| RF-414 | DONE | SRS enable/disable/status command 与 private metadata state | route/application tests |
| RF-415 | DONE | 扫描待编译 ruleset、有限并发 dispatch 与幂等 reconcile | R2/GitHub fake integration |
| RF-416 | DONE | 自动 provision 后的真实 GitHub callback smoke | WebUI/workflow/3 Actions/callback/R2/public URL PASS |

### Phase 5

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-500 | DONE | 定义 sync manifest/schema/path codec 与整体内容摘要 | unit/schema |
| RF-501 | DONE | 实现稳定 pretty JSON workspace export 和 file/content hash | unit |
| RF-502 | DONE | 实现 GitHub sync client、限制、retry 与判别错误 | integration |
| RF-503 | DONE | 实现一次 Git tree/commit push，不修改非受管文件 | commit tests |
| RF-504 | DONE | 实现 GitHub download/validate/dry-run/import | import tests |
| RF-505 | DONE | 实现 base/local/remote 整体摘要状态矩阵 | diff matrix |
| RF-506 | DONE | 实现文件级变更摘要与显式整侧覆盖门禁 | conflict tests |
| RF-507 | DONE | 实现 expected-head 单 revision pull publish | rollback/conflict tests |
| RF-508 | DONE | 实现 connect/disconnect、private repo/PAT 权限检查 | security tests |
| RF-509 | DONE | 实现站外恢复、sync base revision 与 GitHub commit retention | integration |
| RF-510 | SKIPPED | 不实现独立 AES-GCM 时间快照；R2 revision + Git history 已覆盖当前恢复需求 | ADR-038 |
| RF-511 | DONE | 暴露 connect/status/diff/push/pull API；PrimeVue 页面延后 Phase 6/7 | route/client tests |

### Phase 6

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-600 | DONE | 安装最新稳定 PrimeVue 4.5.5 并确认 MIT 许可证 | build + ADR update |
| RF-601 | DONE | 配置 theme preset/tokens | desktop/mobile visual smoke |
| RF-602 | DONE | 引入 Vue I18n 与双语 catalog | key parity test |
| RF-603 | DONE | 同步 PrimeVue locale 与持久化 | locale E2E |
| RF-604 | DONE | 引入 Pinia stores | typecheck + feature E2E |
| RF-605 | DONE | 引入 Vue Router/pages/guards | navigation E2E |
| RF-606 | DONE | App.vue 缩减为应用入口 | responsibility review |
| RF-607 | DONE | 定稿侧栏、资源/设置子导航、同步边界与 Profile 编辑交互 | ADR-039 + doc review |

### Phase 7

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-700 | DONE | 迁移 Connect/settings 控件与文案 | bilingual E2E |
| RF-701 | DONE | 迁移 Toast/Confirm/Dialog/Popover | accessibility E2E |
| RF-702 | DONE | 迁移 Asset feature | CRUD/revision/conflict tests |
| RF-703 | DONE | 迁移 Profile feature | draft/CRUD/preview E2E |
| RF-704 | DONE | 迁移 Ruleset/build status feature | failed/retry/ready E2E |
| RF-705 | DONE | 实现 Sync feature diff/conflict UI | safe push + backend conflict matrix |
| RF-706 | DONE | 迁移 EditorToolbar，保留 CodeMirror | lint/typecheck/editor build |
| RF-707 | DONE | 迁移 navigation/layout | desktop/mobile E2E |
| RF-708 | DONE | 删除旧 UI primitives 和重复 CSS | import/CSS scan |
| RF-709 | DONE | 清除用户可见硬编码文案 | i18n scan + key parity |
| RF-710 | DONE | 修复单侧栏移动端进出场动画与宽屏可访问性边界 | desktop/mobile E2E + reduced-motion review |
| RF-711 | DONE | 删除 Profile 自定义模板直链入口，统一头像到仓库设置 | i18n/import scan + build |
| RF-712 | DONE | 统一编辑弹窗头部工具栏并移除 Profile 可视 `.json` 后缀 | build + desktop/mobile E2E |

### Phase 8

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-800 | DONE | 确认 ADR-010 workspace/session scope | ADR accepted |
| RF-801 | DONE | 审计 SRS ticket 派生域、sync PAT 与 backup key 隔离 | security tests |
| RF-802 | DONE | 增加 request ID、redaction 和结构化日志 | log review + unit |
| RF-803 | DONE | 审计 Cookie/CSP/R2/callback limits 与公开域名登录滥用 | security checklist |
| RF-804 | DONE | 配置 R2 retention、软预算和用量提示 | budget tests |
| RF-805 | DONE | 删除旧实时 GitHub CRUD/workflow string/facades | import scan |
| RF-806 | DONE | 删除旧 snapshot/helper/types/dead code | scan + tests |
| RF-807 | DONE | 强化最终 boundary lint | lint + import scan |
| RF-808 | DONE | 更新 README/Wiki/operations docs | doc review |
| RF-809 | DONE | 完整 verify/dry-run/desktop/mobile E2E | all green |
| RF-810 | DONE | 执行 R2 head/revision、artifact、GitHub backup 恢复演练 | fixture rehearsal |
| RF-811 | DONE | 发布说明、迁移和回滚步骤 | release review |

### Phase 9：Beta 稳定与产品化

| ID | 状态 | 任务 | 验证 |
|---|---|---|---|
| RF-900 | DONE | 实现 fork + Cloudflare Workers Builds 从零部署 | unit + production path；独立账户 smoke 延期 |
| RF-901 | DONE | 自动上传管理员 Build Secret 并生成缺失 signing secrets | secret lifecycle/redaction tests |
| RF-902 | DONE | 网站部署移出 GitHub Action，维护者与用户统一跟踪各自 `main` | production automatic build smoke |
| RF-903 | SKIPPED | 不实现独立 Release CI/manifest/checksum 分发 | ADR-047 |
| RF-904 | DONE | 自动创建/复用 R2、启用 workers.dev 并验证 bootstrap | unit + existing production；fresh-account smoke 延期 |
| RF-905 | DONE | 使用 Sync fork 更新与 Cloudflare Worker version rollback | operations review + Wrangler version check；实际路径延期 |
| RF-906 | SKIPPED | 不建立 Release stable/preview channel | ADR-047 |
| RF-907 | DONE | 编写 Workers Builds 从零部署、更新和故障恢复文档 | operations review |
| RF-908 | DONE | 设计可编辑 replacement adapter 与 Momo 初始化预设 | ADR-043 + sample config |
| RF-909 | DONE | 实现 adapter schema/builder/UI/sync，删除 patch/overrides/旧 DSL | builder/schema/UI tests |
| RF-910 | DONE | 完成 Beta 前端交互、移动端、i18n、可访问性和性能收束 | frontend-beta-optimization + desktop/mobile E2E |
| RF-911 | DONE | 建立 Beta 反馈、P0/P1 修复和生产回归矩阵 | Beta feedback + verify + production smoke |
| RF-912 | DONE | 正式版 `3.0.0` 发布门禁、Release smoke 和回滚复核 | full verify + dry-run + docs/license review |
| RF-913 | DONE | 私有订阅切换为 `s2` 25 字符短 Token，不兼容旧格式 | unit/integration/security review |
| RF-914 | DONE | 增加生产切换期一次性 R2 workspace schema v1→v2 登录迁移器 | auth/migration/CAS integration tests |
| RF-915 | DONE | 确认生产/GitHub v2 后删除一次性迁移器 | production smoke + runtime source scan |

## 每次任务完成检查

```text
[ ] 状态已从 IN_PROGRESS 更新为 DONE/BLOCKED
[ ] 新行为有测试或记录不可测试原因
[ ] 局部测试和 npm run verify 通过
[ ] UI 任务完成 desktop/mobile 验证
[ ] 新文案同时提供 zh-CN/en-US
[ ] 没有越层 import、feature fetch、route 直接存储访问或直接 storage key
[ ] 没有把 GitHub 恢复成在线主存储
[ ] 没有让 Action 获得 Cloudflare 存储凭据
[ ] 没有留下未登记的兼容代码或 TODO
[ ] decisions.md 已记录新的长期决策
[ ] 会话日志已更新
```

## 验证记录

| 日期 | Commit/工作区 | 命令 | 结果 | 备注 |
|---|---|---|---|---|
| 2026-07-14 | 重构前基线 | `npm run build` | PASS | Web typecheck + Vite build |
| 2026-07-14 | 重构前基线 | Wrangler dry-run | PASS | 当前 Worker 可打包 |
| 2026-07-14 | 重构前基线 | 独立 Worker tsc | FAIL | RF-000/RF-001 处理 |
| 2026-07-14 | RF-000/RF-001 | `npm run typecheck` | PASS | Web 与 Worker 独立类型检查 |
| 2026-07-14 | RF-002 | `npm run lint` | PASS | 0 error；24 个 legacy warning 已登记 |
| 2026-07-14 | RF-003/RF-004 | `npm run test:unit` | PASS | 3 files、22 tests |
| 2026-07-14 | RF-005 | `npm run test:integration` | PASS | 1 file、6 tests；mock GitHub API |
| 2026-07-14 | RF-007 | `npm run verify` | PASS | lint、双 typecheck、28 tests、Vite build |
| 2026-07-14 | RF-007 | `npm run worker:dry-run` | PASS | Worker bundle 与现有 KV binding 可识别；未部署 |
| 2026-07-14 | RF-006 | `npm run test:e2e` | PASS | desktop/mobile Chromium；登录、Profile、节点、规则集 smoke，4 tests |
| 2026-07-14 | Phase 0 完成 | `npm run verify` | PASS | 含 28 个 Vitest tests 与 4 个 Playwright tests |
| 2026-07-14 | RF-100/RF-101 | `npm run typecheck` + schema tests | PASS | shared/Web/Worker；Profile/Auth/Ruleset/Asset 单一契约 |
| 2026-07-14 | RF-102 至 RF-106/RF-108 | `npm run verify` | PASS | 39 unit、6 integration、4 desktop/mobile E2E |
| 2026-07-14 | Phase 1 当前工作区 | `npm run worker:dry-run` | PASS | envelope/Zod 可打包；仍识别 legacy KV，未部署 |
| 2026-07-14 | RF-107/Phase 1 完成 | `npm run verify` | PASS | 42 unit、6 integration、4 E2E；ports/fake/CAS tests |
| 2026-07-14 | RF-201/RF-202 | `npm run worker:dry-run` + unit tests | PASS | `WORKSPACE_BUCKET` 识别；9 个 schema/key tests；未部署 |
| 2026-07-14 | RF-203 至 RF-205 | `npm run test:integration` | PASS | R2 revision/head CAS、冲突、恢复与 orphan 行为 |
| 2026-07-14 | RF-206 | typecheck/unit/integration/lint | PASS | 51 unit、26 integration；0 error、24 legacy warnings |
| 2026-07-14 | RF-207 | `npm run test:unit` + typecheck | PASS | 59 unit；HMAC/Cookie/version/tamper/expiry；明文 subToken 不进入 revision |
| 2026-07-14 | RF-208 | `npm run test:integration` + typecheck | PASS | 31 integration；revision key、资源隔离、TTL 与 eviction miss |
| 2026-07-14 | RF-209 | `npm run test:integration` + typecheck | PASS | 35 integration；retention/dry-run/sync-base/head race |
| 2026-07-14 | RF-210/Phase 2 完成 | `npm run verify` | PASS | 59 unit、39 integration、4 desktop/mobile E2E；0 lint errors |
| 2026-07-14 | Phase 2 Worker bundle | `npm run worker:dry-run` | PASS | 识别 legacy KV 与 `sing-sub-data` R2 binding；未部署 |
| 2026-07-14 | RF-300 | `npm run test:integration` + typecheck | PASS | 42 integration；pinned commit/tree/blob limits |
| 2026-07-14 | RF-301 | `npm run test:integration` + typecheck | PASS | 47 integration；settings/token mapping/invalid credentials |
| 2026-07-14 | RF-302 | `npm run test:integration` + typecheck | PASS | 52 integration；normalize/invalid/ref/collision/source report |
| 2026-07-14 | RF-303 | `npm run verify` | PASS | 59 unit、55 integration、4 E2E；首 revision/private/migration conflict |
| 2026-07-14 | RF-304 | integration + desktop/mobile E2E | PASS | 62 unit、59 integration、4 E2E；admin session/Profile CAS |
| 2026-07-14 | RF-305/RF-306 | integration + desktop/mobile E2E | PASS | 62 unit、60 integration、4 E2E；Asset/Ruleset/Settings CAS |
| 2026-07-14 | RF-307/RF-308 | typecheck/unit/integration/lint | PASS | 62 unit、55 integration；订阅 cache/token；实时 GitHub/KV import scan clean |
| 2026-07-14 | Phase 3 过渡版本 | `npm run verify` | PASS | 62 unit、55 integration、4 desktop/mobile E2E；0 lint errors、20 legacy warnings |
| 2026-07-14 | Phase 3 过渡 bundle | `npm run worker:dry-run` | PASS | 识别迁移期 KV 与 `sing-sub-data` R2；未部署 |
| 2026-07-14 | Phase 3 生产迁移 | desktop/mobile manual smoke | PASS | Profile、Asset、订阅、保存与多设备登录正常；移动 payload bug 已修复 |
| 2026-07-14 | RF-309/Phase 3 完成 | `npm run verify` | PASS | 63 unit、52 integration、8 desktop/mobile E2E；0 error、20 legacy warnings |
| 2026-07-14 | RF-309 R2-only bundle | `npm run worker:dry-run` | PASS | 仅识别 `WORKSPACE_BUCKET` R2 binding；无 KV/D1；未部署 |
| 2026-07-15 | RF-309 production deploy | manual `npm run deploy` | PASS | version `ce409756-2bc5-4fb3-a98f-8be94c5e2653`；仅 R2 binding |
| 2026-07-15 | RF-409 public SRS | typecheck + integration + lint | PASS | 53 integration；公开 router 无 token parser、额外 path segment 404、0 lint error |
| 2026-07-15 | ADR-032/ADR-033 完整验证 | `npm run verify` | PASS | 63 unit、53 integration、8 desktop/mobile E2E；20 已登记 warnings |
| 2026-07-15 | public SRS Worker bundle | `npm run worker:dry-run` | PASS | 仅 `WORKSPACE_BUCKET` R2 binding；未部署 |
| 2026-07-15 | Phase 4 local pipeline | `npm run verify` | PASS | 71 unit、59 integration、8 desktop/mobile E2E；20 已登记 warnings |
| 2026-07-15 | Phase 4 Worker bundle | `npm run worker:dry-run` | PASS | 仅 `WORKSPACE_BUCKET` R2 binding；673.83 KiB / gzip 106.58 KiB；未部署 |
| 2026-07-15 | Phase 5 safe sync | `npm run verify` | PASS | 89 unit、76 integration、8 desktop/mobile E2E；0 error、20 个既有前端 warning |
| 2026-07-15 | Phase 5 Worker bundle | `npm run worker:dry-run` | PASS | 仅 `WORKSPACE_BUCKET` R2 binding；758.09 KiB / gzip 123.95 KiB；未部署 |
| 2026-07-15 | Phase 6/7 完成 | `npm run verify` | PASS | 90 unit、76 integration、12 desktop/mobile E2E；0 lint error |
| 2026-07-15 | Phase 6/7 Worker bundle | `npm run worker:dry-run` | PASS | Wrangler 4.110.0；仅 `WORKSPACE_BUCKET` R2 binding；757.59 KiB / gzip 123.88 KiB；未部署 |

## 外部资源状态

| 资源 | 状态 | 备注 |
|---|---|---|
| Cloudflare Worker | 已启用 | 当前部署目标 |
| Cloudflare KV | namespace 暂留/未绑定 | 生产 Worker 不再访问；仅作短期旧数据回滚材料 |
| Cloudflare D1 | 不采用 | 不创建 database、migration 或 binding |
| Cloudflare R2 | 已启用/主存储 | private Standard bucket `sing-sub-data`；公共 URL/CORS/数据目录均关闭 |
| SRS compiler workflow | 本地实现完成/待真实 smoke | 显式 enable 自动 upsert 到已连接私有仓库；ticket 不使用 GitHub Secret/Variable |
| GitHub sync repository | 可选/现有 | safe connect/status/push/pull 已实现；生产尚未部署 Phase 5 |

## 阻塞项

RF-412 至 RF-415 已通过本地 fake、完整 verify 与 Worker dry-run。当前只剩 RF-416：部署当前版本后，通过 authenticated API（Phase 6/7 再接 WebUI 开关）对现有私有仓库执行一次真实 enable/callback smoke；不需要在 GitHub 网页手工配置 workflow、Secret 或 Variable。

## 会话日志

### 2026-07-14：初始审计与规划

- 完成仓库、UI、GitHub 写入、缓存、认证和 CI 审计。
- 决定保留 Vue 3，采用 PrimeVue 最新稳定版与 Vue I18n。
- 创建首版目标架构、标准、路线、ADR 和台账。

### 2026-07-14：旧版 D1/R2/KV 数据架构（已被后续决策取代）

- D1 锁定为唯一业务主数据库。
- R2 Standard 锁定为 SRS、artifact 和 snapshot 存储。
- KV 限定为 session 与可重建缓存。
- GitHub Actions 锁定为无状态官方 sing-box 编译器，通过 Worker callback 发布 R2。
- GitHub private 锁定为可选 backup/editable sync，日常 CRUD 零 GitHub 交互。
- 安全采用平台保护 + 整包快照 AES-GCM，不做逐字段加密。
- 不使用付费 Cloudflare Containers；记录 D1/R2 Free plan 额度和 R2 计费风险。
- 重排 Phase 0-8 和任务台账，开发从 RF-000 开始。

### 2026-07-14：R2-only 最终存储决策

- 开始状态：原计划同时使用 D1 主数据、R2 artifact/snapshot 和 KV session/cache，跨存储职责与开发成本过高。
- 评估依据：workspace 约 2-3 MiB、SRS 通常小于 1 MiB、单管理员低频写入、没有复杂查询；现有业务天然以完整 JSON workspace 导入导出。
- 最终决策：R2 Standard 是唯一持久化存储；immutable revision + ETag head 替代 Git commit/D1 transaction；签名 Cookie 与 HMAC token 替代 KV session/index；Cache API 只做可丢弃缓存。
- GitHub 边界：日常 CRUD 和 SRS 编译零 commit；commit 代码只存在于可选 `GithubSyncGateway`。
- 迁移边界：D1 不创建；现有 KV 只保留到 Phase 3 切换完成，之后删除 binding 和 helpers。
- 文档影响：重写 data architecture、roadmap、target architecture、engineering standards、ADR 与 Phase 2-5 台账。
- 下一任务：继续 Phase 1 API contract/typed client；R2 远程资源直到 RF-200 才需要用户操作。

### 2026-07-14：RF-000 至 RF-005、RF-007 Phase 0 质量基线

- 开始状态：Web build 可通过，但 Worker 未纳入独立 typecheck，仓库没有 lint、自动测试或统一 CI 验证链。
- 完成内容：增加 Worker tsconfig、ESLint flat config、Web/Worker import 边界、Vitest unit/integration 分层、统一 `verify` 与 CI check。
- 文件/模块：`tsconfig.worker.json`、`eslint.config.js`、`vitest.config.ts`、`tests/unit`、`tests/integration`、`package.json`、`.github/workflows/ci.yml`。
- 验证：Web/Worker typecheck、22 个 unit tests、6 个 integration tests、Vite build 和 Wrangler dry-run 全部通过。
- 遗留风险：lint 保留 24 个 legacy warning，主要是 Profile 子组件修改 prop；在 RF-700 至 RF-708 迁移本地 draft 和 PrimeVue 时清零。
- 下一任务：RF-006，引入 Playwright 并锁定当前登录与关键 CRUD 的最小 desktop/mobile smoke。

### 2026-07-14：RF-006 浏览器回归基线

- 开始状态：关键 WebUI 流程没有浏览器自动化，桌面与移动回归依赖人工操作。
- 完成内容：引入 Playwright，使用 API mock 锁定登录、Profile 保存、节点创建与规则集创建/SRS 状态提示。
- 文件/模块：`playwright.config.ts`、`tests/e2e/app.smoke.spec.ts`、`.github/workflows/ci.yml`。
- 验证：desktop Chromium 与 Pixel 7 viewport 共 4 个 tests 全部通过，并已纳入 `npm run verify` 和 CI。
- 遗留风险：测试锁定现有 GitHub-first API 契约；Phase 1/3 变更 API 或 R2 主存储时应同步迁移 mock，不得删除流程断言。
- 下一任务：RF-100/RF-101，建立 shared contracts/schemas 并合并重复类型。

### 2026-07-14：RF-100 至 RF-106、RF-108 契约与 API 边界

- 开始状态：前后端重复定义 Profile/State/Ruleset/Asset 类型，API 返回裸 JSON 和自由文本错误，AssetManager 直接 fetch。
- 完成内容：引入 Zod shared schemas、统一 envelope/error codes、R2 workspace revision/status contracts、HTTP error boundary、typed API client/endpoints。
- 网络边界：`src/api/client.ts` 成为浏览器唯一 fetch；AssetManager 通过 endpoint 读取/保存并使用判别错误处理 404/409。
- 测试：新增 schema、API client、HTTP response/error matrix；完整 verify 为 39 unit、6 integration、4 E2E。
- 工具修复：E2E runner 通过 Vite API 使用随机端口并主动 close，避免 Windows 遗留 dev server；mock 只拦截真实 `/api/**`，不再误拦截 `src/api` 模块。
- 性能：客户端改为直接导入错误码 contract，避免 shared barrel 把 Zod 带入主包；入口恢复为约 371 KiB（gzip 132.6 KiB）。
- 下一任务：RF-107，定义 WorkspaceStore/ArtifactStore/SyncGateway/CompilerDispatcher ports 与 fake use case tests，不创建远程 R2。

### 2026-07-14：RF-107 application ports 与 Phase 1 完成

- 完成内容：建立 storage-neutral WorkspaceStore、ArtifactStore、SyncGateway、CompilerDispatcher ports，以及统一 workspace command/conflict error。
- Fake：新增 InMemoryWorkspaceStore，使用 opaque string revision，模拟 future R2 head CAS，不暴露 R2 binding 或 ETag。
- 测试：验证正常 immutable publish、陈旧 expected revision 在 update 前拒绝、读后竞态由 store 再次拒绝。
- 边界：ESLint 禁止 application/domain 导入 infrastructure/http；`src` 唯一 fetch 保持在 `src/api/client.ts`。
- 验证：`npm run verify` PASS，42 unit、6 integration、4 desktop/mobile E2E；Worker dry-run PASS，未部署。
- 下一任务：RF-200/RF-201，需要用户启用 R2 Standard private bucket 后添加 binding；D1 不创建，legacy KV 暂不删除。

### 2026-07-14：RF-200 至 RF-206 R2 数据模型与适配器

- 外部资源：创建 private R2 Standard bucket `sing-sub-data`，以 `WORKSPACE_BUCKET` 绑定；Wrangler dry-run 可识别，未部署且未写入生产对象。
- 完成内容：建立 workspace/head/revision/private/job schemas、受限 object key codec、canonical JSON/SHA-256、immutable revision 与 ETag head CAS。
- 恢复能力：支持 revision metadata 列表、旧 revision 恢复为新 revision、显式缺失 head 恢复；竞态失败只留下不可见 orphan。
- Supporting stores：实现 immutable/idempotent SRS artifact、private credential ETag CAS、deterministic job create/status CAS，并校验完整 job identity。
- 验证：51 unit 与 26 integration tests 通过；typecheck 与 lint 通过，保留 24 个已登记 legacy warnings。
- 迁移边界：适配器尚未接入生产 routes；GitHub + KV 主路径保持不变，Phase 3 前不切流或删除 legacy KV。
- 下一任务：RF-207，建立不依赖 KV 的 signed Cookie、HMAC subscription token 与 auth version 安全模块。

### 2026-07-14：RF-207 无状态认证与订阅令牌

- 完成内容：建立 `AuthTokenService` port 与 Web Crypto HMAC-SHA-256 adapter，会话和订阅使用独立 secret 与严格 claims。
- 会话：签名 payload 携带 workspace ID、过期时间、auth version；Cookie 使用 `__Host-` 前缀、HttpOnly、Secure、SameSite=Lax。
- 订阅（当时实现，已由 RF-913 替换）：签名 payload 携带 workspace ID、token version 与 subscription 用途，版本递增即可失效，不建立 KV index。
- 数据边界：新 workspace revision schema 移除旧明文 `subToken`；legacy API 字段保留到 Phase 3 route 切流。
- 验证：59 unit、26 integration 与完整 typecheck 通过；覆盖篡改、过期、版本失效、用途/secret 隔离和最小 secret 长度。
- 下一任务：RF-208，封装 revision-keyed Workers Cache API adapter，缓存驱逐必须只导致重建。

### 2026-07-14：RF-208 可丢弃响应缓存

- 完成内容：建立 storage-neutral `ResponseCache` port 与 Workers Cache API adapter，application 只传递 revision identity、字节和 content type。
- Key：缓存 identity 包含 workspace、revision、资源类型和实体 ID；新 revision 自然 miss，不执行全局失效或 KV key 扫描。
- 安全边界：内部固定 cache origin，所有 path segment 校验，TTL 限制为 1 秒至 24 小时。
- 验证：31 integration tests 通过；覆盖 JSON roundtrip、revision/资源隔离、驱逐 miss、非法 key 与 TTL。
- 下一任务：RF-209，实现保守的 R2 revision/artifact/job orphan retention 与 head 竞态保护。

### 2026-07-14：RF-209 R2 保留与孤儿清理

- 完成内容：实现分页扫描与 dry-run retention service，清理超龄且未引用的 revision、SRS artifact 和 deterministic job。
- 保护集合：始终保留 current、previous、本地 sync base；artifact 保留 current/previous 引用及最近历史，job 保留 current build 引用。
- 并发保护：制定计划后重新读取 head ETag，发生变化则零删除；所有对象至少经过 24 小时 grace period。
- 保守失败：未知 artifact/job metadata 计入 skipped，不自动删除；protected revision 缺失或 schema 损坏直接失败。
- 验证：35 integration tests 通过，覆盖实际清理、sync base、dry-run 和 head race。
- 下一任务：RF-210，增加分页用量汇总、软预算等级和可配置阈值，不阻断业务 revision 发布。

### 2026-07-14：RF-210 软预算与 Phase 2 完成

- 完成内容：实现分页 R2 逻辑用量汇总，按 head、revision、artifact、job、private metadata 分类。
- 默认阈值：1 GiB 进入 warning，8 GiB 进入 history-paused；环境覆盖必须为正整数且 pause 高于 warning。
- 行为边界：软预算只返回 `allowNonessentialHistory=false`，不接入或阻断 `WorkspaceStore.publish()`。
- 验证：完整 verify 通过，包含 59 unit、39 integration、4 desktop/mobile E2E；Worker dry-run 识别 `sing-sub-data`，未部署。
- Phase 2 结果：R2 schema、ports/adapters、CAS、auth token、Cache API、retention 与 budget 已完成，生产 routes 仍保持 legacy 主路径。
- 下一任务：Phase 3 RF-300，先用 fixture 实现只读 legacy GitHub source reader，不访问真实仓库。

### 2026-07-14：RF-300 固定 GitHub 快照读取

- 完成内容：实现只读 `LegacySourceReader` port 与 GitHub adapter，先固定 branch commit，再读取 recursive tree 与 blob SHA。
- 范围：当时只导入 `configs/nodes/templates/patches/rulesets` 下安全命名的 JSON；该旧路径已由 RF-909 直接切换为 `adapters`，不保留兼容读取。
- 限制：tree 截断、超过 1000 文件、单文件超过 4 MiB、总计超过 32 MiB、base64/UTF-8/size 异常均失败，不产生部分输入。
- 验证：42 integration tests 通过；fixture 覆盖 pinned commit、过滤、truncated tree 与 blob mismatch。
- 下一任务：RF-301，只读 legacy KV settings/PAT/token mapping，不迁移任何缓存 key。

### 2026-07-14：RF-301 旧 KV 设置导出

- 完成内容：实现 `LegacySettingsReader` port 与 KV adapter，仅读取 `user:{owner}/{repo}` 和对应 `sub:{token}`。
- 导出范围：PAT、仓库坐标、用户显示信息和 default branch；dashboard snapshot、配置缓存、session 不进入迁移。
- 兼容：旧 token index 缺失允许继续，因为新 HMAC token 不需要 index；若 index 指向其他仓库则硬失败。
- 验证：47 integration tests 通过；覆盖完整导出、缺失 mapping、无设置、错配和无效 schema。
- 下一任务：RF-302，将 GitHub raw snapshot 转为严格 normalized migration plan，并汇总逐文件错误。

### 2026-07-14：RF-302 迁移 dry-run

- 完成内容：统一 legacy path codec，将固定 GitHub snapshot 转为严格 Profile/Asset normalized plan 与结构化 issue report。
- 校验：仓库/branch 一致、JSON/schema、profile 文件名、大小写碰撞、本地引用、ruleset source schema；重复 order 作为 warning。
- 原子输入：只在零 error 时返回 normalized data，禁止后续步骤误用部分解析结果；统计文件、字节和各实体数量。
- 验证：52 integration tests 通过，覆盖完整 snapshot、无效 profile、缺失引用、大小写冲突和 source mismatch。
- 下一任务：RF-303，把 normalized plan 发布为首个 immutable R2 workspace 与独立 private credentials。

### 2026-07-14：RF-303 首个 R2 workspace 发布

- 完成内容：application migration use case 从完整 normalized plan 创建 schema v1 revision、migration record 和独立 private GitHub credentials。
- 数据边界：revision 不含 PAT 或旧 subToken；auth/token version 从 1 开始，GitHub commit SHA 固化在 migration metadata。
- 冲突安全：已有 private metadata 或 workspace head 不覆盖；只在 workspace 与 private credentials 都成功后返回可签发 session 的结果。
- 故障模型：workspace 写入后、private 写入前崩溃会留下未签发 session 的随机 ID orphan，后续由显式恢复/retention 处理，不自动覆盖或删除竞态对象。
- 验证：完整 verify 通过，59 unit、55 integration、4 desktop/mobile E2E；覆盖成功迁移、private 冲突和 existing head。
- 阻塞：RF-304 前需锁定 Cookie 丢失后的 workspace 定位/认证模型；R2-only 没有 `owner/repo -> workspaceId` 查询能力。

### 2026-07-14：ADR-010 单部署单 workspace

- 用户确认：项目为个人使用；其他用户各自部署 Cloudflare Worker/R2，不需要共享多租户服务。分发方式后由 ADR-034 修订为默认下载 Release，fork 非必需。
- 决策：每个部署固定逻辑 workspace ID `primary`，一个管理员，可多设备同时登录；不建立 owner/repo lookup、用户表、角色或 workspace index。
- 认证：管理员口令与签名密钥保存在 Worker secrets；GitHub 仅参与首次迁移与可选 sync，不再承担日常登录。
- 影响：RF-304 解除阻塞；未来若引入多用户必须新增 ADR 与完整权限模型。

### 2026-07-14：RF-304 单 workspace 认证与 Profile 主路径

- 认证：固定 `primary` workspace；未初始化显示 GitHub migration 字段，初始化后登录只验证 Worker secret 管理员口令，不调用 GitHub。
- 会话：signed Cookie 携带 auth version；登出只清 Cookie，不删除 R2；bootstrap 返回 setupRequired 与 revision。
- Profile：GET/PUT/rebuild/preview 全部读取 R2 snapshot；保存携带 expected revision，陈旧保存映射为 409。
- 构建：当时 Profile preview 从 revision 内 template/node/patch 读取；RF-909 已将该资源边界直接切换为 template/node/adapter，仍不读取 GitHub/KV cache。
- 验证：62 unit、59 integration、4 desktop/mobile E2E 通过；覆盖错误口令、Cookie 恢复、零 GitHub 登录与 stale revision。
- 下一任务：RF-305，将 Asset query/read/write/delete 迁移到 workspace revision。

### 2026-07-14：RF-305/RF-306 Asset、Ruleset 与 Settings 主路径

- Asset：列表、文件和模板读取来自 current R2 snapshot；create/update/rename/delete 统一通过 `saveAsset/deleteAsset` 与 expected revision 发布。
- 删除：前端多文件删除改为顺序推进 revision，避免同一 expected revision 并发冲突；规则集删除同时移除 build summary。
- Ruleset：source 刷新与安全校验保留，保存不再创建 GitHub commit、同步 workflow 或删除远端 SRS。
- Settings：GitHub 坐标暂为只读 sync metadata；移除自定义明文 subToken，轮换通过 tokenVersion + HMAC 完成。
- 验证：62 unit、60 integration、4 desktop/mobile E2E 通过；lint 0 error、23 个 legacy warning。
- 下一任务：RF-307，订阅 JSON 从 current revision 构建并使用 revision-keyed Cache API。

### 2026-07-14：RF-307/RF-308 订阅切换与旧在线管线删除

- Subscription：HMAC token 解析到固定 `primary`，从 current revision 构建 JSON；Cache API key 包含 revision，驱逐/异常只触发重建。
- SRS read：只读取 workspace active artifact pointer 与 private R2 artifact，不再从 GitHub raw URL 下载。
- 删除：移除旧 KV session/config cache、dashboard snapshot、GitHub Contents CRUD、Git tree commit 和相关 characterization tests。
- GitHub 剩余边界：只保留首次迁移所需 user/repository/ref/tree/blob 只读客户端；没有在线 save/compile commit 路径。
- KV 剩余边界：`SESSIONS` 只被首次迁移 reader 读取，生产迁移确认后由 RF-309 删除。
- 验证：62 unit、55 integration；revision cache miss、token rotate、R2 CRUD 与 import scan 通过。
- 下一任务：用户执行 `docs/operations/r2-migration.md`；确认后完成 RF-309 并进入 Phase 4。

### 2026-07-14：RF-309 R2-only 切流与 GitHub 可选初始化

- 生产验证：用户确认桌面/移动登录、Profile、Asset、订阅与保存全部正常；修复普通移动登录错误发送空 GitHub 字段的问题。
- KV 清理：删除 `SESSIONS` binding、Env 类型、legacy KV settings reader、token index 兼容与对应测试；旧 namespace 不再绑定或访问。
- 初始化：空 R2 默认以管理员口令创建空 `primary` workspace，不调用 GitHub且不创建 private credentials。
- 可选导入：用户展开 GitHub 导入后才提交 `owner/repo` 与 PAT；固定 commit dry-run 后写入首个 revision 和 private metadata。
- 兼容：历史 revision 的 `migration.source=github-kv-legacy` 仍可读取；新导入记录为 `github-import`。
- 验证：完整 verify 通过，63 unit、52 integration、8 desktop/mobile E2E；Worker dry-run 只识别 R2 binding，源码扫描无 KV 残余。
- 生产部署：用户手动部署成功，版本 `ce409756-2bc5-4fb3-a98f-8be94c5e2653`，binding 清单只有 `WORKSPACE_BUCKET`。
- 下一任务：Phase 4 RF-400/RF-401。

### 2026-07-15：ADR-032/ADR-033 公开 SRS 与受控部署

- 安全约束：公开规则集从一开始不接受 subscription token，避免将 bearer credential 引入公开 URL 结构。
- SRS 路由：固定为 `/rules/{ruleset}.srs`，读取 `primary` workspace active pointer 与 private R2 artifact；任何额外 path segment 返回 404。
- 隔离验证：公开 SRS 即使 subscription signing secret 不可用仍可下载，证明未构造或依赖私有订阅认证服务。
- 缓存与枚举：响应增加 content hash ETag，保持短期 public cache；不提供列表，缺失/未编译/artifact 缺失统一 404。
- 部署：`deploy.yml` 从 main push 自动发布改为显式 `workflow_dispatch`，避免源码更新自动覆盖生产。
- 低优先级计划：新增 Phase 9，重构结束后实现独立 Release setup、secret 初始化、域名检查和受控 update/rollback。
- 验证：完整 verify 通过，63 unit、53 integration、8 desktop/mobile E2E；Worker dry-run 只识别 R2 binding。
- 下一任务：进入 RF-400/RF-401，无状态 SRS compiler workflow 与固定版本。

### 2026-07-15：Phase 9 独立 Release 与 Windows 部署助手设想

- 用户设想：Action 发布包含源码、manifest/checksum 和升级说明的 Release；Windows 脚本或程序采集必要信息后完成首次 Cloudflare 部署。
- 更新能力：部署助手检查并拉取稳定 Release，验证发布物与兼容范围，经用户确认后推送新 Worker 版本，并支持健康检查和代码回滚。
- 安全边界：Release Action 不持有用户 Cloudflare/R2/Worker secrets；发现更新、main push 和上游变化均不得自动覆盖生产。
- 重构预留：版本/health endpoint、workspace schema migration、参数化 Wrangler 资源和 release compatibility contract 纳入 Phase 8/9 设计。
- 排期：主体明确延后到 Phase 9，不阻塞当前 Phase 4-8；详细记录见 `deployment-automation-backlog.md`。
- 分发修订：普通用户不要求 fork；维护仓库主动发布 Release，用户下载后由本地助手部署到自己的 Cloudflare。fork 只保留给贡献者或自定义源码用户。

### 2026-07-15：Phase 4 JSON fallback 与私有仓库 SRS compiler

- 架构修订：Sing-Sub 源码仓库不承担其他部署的编译服务；compiler workflow 作为模板安装到当前部署已连接的私有仓库，维护者与普通用户使用同一机制。
- 基础分发：新增 `/rules/{ruleset}.json`，始终从 current R2 revision 输出去除 `_sing_sub` 的 sing-box source ruleset；无 GitHub/SRS 时规则集编辑与订阅完整可用。
- 可选编译：该阶段早期的 static compiler secret 已由 RF-412 删除；现由 R2 private GitHub credentials、显式 enabled 状态和短期 job ticket 控制。未启用时 build status 为 `none`，不产生永久 pending。
- callback：实现受认证 source、complete、failed routes，固定 compiler version/checksum、binary body limit、SHA-256、superseded、幂等、失败保留旧 active artifact。
- 恢复：新增 authenticated build status/retry API；SRS 是少数高级功能，默认不增加 Cron 或 Queue。
- workflow：从 Sing-Sub `.github/workflows` 移除可执行 compiler，保留 `templates/github/compile-srs.yml` 安装模板。
- 验证：`npm run verify` 通过，71 unit、59 integration、8 desktop/mobile E2E；dry-run 仅有 R2 binding。
- 下一任务：RF-412 至 RF-415 实现自动 provision、短期 ticket、待编译 reconcile 与 fake integration。

### 2026-07-15：动态订阅与刷新语义收敛

- 最终配置不持久化：订阅请求从 current R2 revision 动态拼装，`workspaceId + revision + profile` Cache API key 只用于未变动版本的响应加速。
- revision 切换天然绕过旧 cache，因此 R2 内部保存后不需要 rebuild、cache flush 或前端刷新按钮。
- Profile preview 与订阅均只使用当前 R2 revision；GitHub pull/push、规则来源更新、SRS retry 保留为独立显式操作。
- Phase 6/7 删除旧 `/api/rebuild`、`?refresh=1`、全局刷新按钮和过时 GitHub 同步文案；草稿冲突使用 reload/discard。
- SRS 自动 provision 前移到 Phase 4：已连接仓库的 WebUI toggle 通过 Worker 自动安装/升级 workflow，并使用短期 ticket callback，不设置 GitHub/Worker compiler secret。

### 2026-07-15：RF-412 至 RF-415 SRS 自动化闭环

- Ticket：新增 HKDF 派生、15 分钟有效的 `v1.payload.signature` job ticket；严格绑定 workspace、job、purpose 和 source/complete/failed operation，删除 `SRS_COMPILER_SECRET` 与静态认证器。
- Workflow：dispatch input 改为 `job_id`、`worker_url`、`job_ticket`，运行时立即 mask ticket，不读取 Actions Secret/Variable，不 checkout 或提交数据。
- Provision：验证仓库私有、可访问且具备写权限；对 canonical workflow 做内容/hash 比较，只在缺失或变化时产生一个安装/升级 commit。
- 状态：新增 authenticated `/api/srs-compiler` GET/PUT；R2 private metadata 以 ETag CAS 保存 disabled/provisioning/ready/error、workflow version/hash 和脱敏错误码。
- Reconcile：启用成功后扫描 current revision，所有 stale/missing ruleset 在一个 workspace revision 中发布 pending；dispatch 并发上限为 2，重复执行不重复发布或触发已运行 job。
- 前端边界：已增加 typed API contract；PrimeVue 开关和中英文文案归 Phase 6/7，不新增临时自研 UI。
- 验证：`npm run verify` 通过，75 unit、68 integration、8 desktop/mobile E2E；`npm run worker:dry-run` 通过且只有 R2 binding。
- 下一任务：RF-416 部署后执行真实私有仓库自动 provision、Action callback、R2 artifact 和公开 SRS smoke。

### 2026-07-15：RF-416 生产 smoke 与 Actions 权限阻塞

- 部署：生产版本更新为 `b12c1d42-20fa-4ef2-b6ac-5cea637e09ab`，binding 仍只有 `WORKSPACE_BUCKET`，启动时间 19 ms。
- WebUI：设置页新增正式 SRS 状态与开关，使用 typed `/api/srs-compiler` 契约；启用、停用和 provision error 均已在生产验证。
- Provision：`Leovikii/misc` 已由 Worker 自动写入 canonical `.github/workflows/compile-srs.yml` commit，无需用户配置 GitHub Secret/Variable。
- 生产修复：修复平台 `fetch` 被实例方法错误绑定导致的 Worker `Illegal invocation`，并新增无绑定调用回归测试。
- Dispatch：三个待编译规则集 `direct`、`jp`、`proxy` 均被 reconcile；GitHub dispatch 返回 403，确认 PAT 缺少目标仓库 Actions 写权限，尚未产生 Action run 或 SRS artifact。
- 状态准确性：dispatch 失败现在写入脱敏 `ACTION_DISPATCH_FAILED` private state，设置页延迟刷新后不再错误显示 ready；日志只记录 HTTP status，不记录 PAT、ticket 或响应体。
- 验证：`npm run verify` 通过，75 unit、70 integration、8 desktop/mobile E2E；0 lint error，20 个既有前端 warning。
- 权限恢复：用户为现有 PAT 增加 `Actions: Read and write` 后，三个 workflow dispatch 均成功。
- Callback：三个 Action 的 authenticated source 与 complete callback 均返回 200；Cloudflare 日志自动将 Authorization 标记为 `REDACTED`。
- Artifact：`direct.srs` 370 B、`jp.srs` 285 B、`proxy.srs` 8052 B 均写入 R2 并激活。
- 公开分发：三个 `/rules/{name}.srs` 均返回 200、`application/octet-stream`、内容 ETag 与 `public, max-age=300`；`/rules/direct.json` 返回 200，旧 tokenized URL 保持 404。
- 迁移修复：现有模板中的同源旧 `/rules/{token}/{name}.srs|json` 在共享 workspace 构建边界规范化为无 Token URL；订阅 cache variant 升级，预览与订阅一致，外部域名不改写。
- 最终生产版本：`7f5a2353-d9f2-4a3f-847e-de7619daa620`；Phase 4 完成。
- 最终验证：`npm run verify` 通过，76 unit、70 integration、8 desktop/mobile E2E；0 lint error，20 个既有前端 warning。
- 下一步：进入 Phase 5 RF-500/RF-501。

### 2026-07-15：Phase 5 GitHub 安全方向同步完成

- 模型：采用 R2 base、current local 与 GitHub 实际受管树 remote 的整体内容摘要；时间和 manifest 不参与新旧覆盖判断。
- 冲突：首次内容不同或双方变化时阻止 safe 操作；只允许显式 `overwrite` 选择 R2 整体覆盖 GitHub 或 GitHub 整体覆盖 R2，不实现自动逐文件/字段合并。
- 文件：导出稳定 pretty JSON、完整 file hash 与 manifest；远端先规范化再比较，格式变化不构成业务冲突，删除由完整树缺失表达。
- GitHub：连接验证 private/Contents write；push 以 base tree 创建最多一个 commit、`force:false` 更新 ref，保留 workflow 与所有非受管路径；空仓库可直接初始化。
- R2：pull 完整下载、大小/UTF-8/schema/name/reference dry-run 后才发布 expected revision；sync base revision 受 retention 保护，规则集变化接入既有 SRS reconcile。
- API：新增 authenticated connect/disconnect/status/push/pull 路由及 typed client；PrimeVue 页面和双语文案明确延后 Phase 6/7，不扩展旧 UI。
- 恢复：初始化 GitHub 导入可直接恢复 editable tree，并把 pinned commit 与首个 R2 revision 记录为同步基准；Git history 与 R2 revision 分别承担站外/站内历史。
- 范围：RF-510 按 ADR-038 跳过独立 AES-GCM 时间快照，避免重复版本系统和 key 管理成本。
- 验证：`npm run verify` 通过，89 unit、76 integration、8 desktop/mobile E2E；0 lint error，20 个既有前端 warning。
- Worker：`npm run worker:dry-run` 通过，bundle 758.09 KiB / gzip 123.95 KiB，仅 `WORKSPACE_BUCKET` R2 binding；未部署、未修改 GitHub 或 Cloudflare 外部状态。
- 下一步：暂停；进入 Phase 6 前先讨论前端信息架构、PrimeVue theme、双语切换、Pinia store 与 Router 页面切分。

### 2026-07-15：Phase 6/7 前端平台与 feature 迁移完成

- 平台：保留 Vue 3，接入 PrimeVue 4.5.5、Aura 派生主题、Vue I18n、Pinia 与 Vue Router；PrimeVue 当日 npm stable `latest` 为 v4，许可证为 MIT，未使用 RC。
- 信息架构：只渲染一套侧栏，桌面常驻、窄屏 off-canvas 展开；配置、资源四子项、同步、设置四子项均使用独立路由，顶栏只显示一份页面标题。
- 状态边界：session、workspace、assets、rulesets 与 sync 使用独立 store；`App.vue` 只保留 RouterView、Toast 和 ConfirmDialog。
- 组件：登录、设置、编辑器、文件卡片、冲突、规则集状态和同步页迁移 PrimeVue；删除旧 Input、Select、ToolbarButton、Modal、Toast、Popover、SegmentedControl 等基础实现。
- 双语：zh-CN/en-US catalog parity、PrimeVue locale、document lang 与偏好持久化完成；Profile、ruleset、CodeMirror 搜索和运行状态不再混入固定中文。
- 规则集：页面显示 JSON/pending/dispatching/compiling/ready/failed/superseded，支持失败重试与公开 JSON 链接；仅 binary ready 时显示 SRS 链接。
- 验证：`npm run verify` 通过，90 unit、76 integration、12 desktop/mobile E2E；0 lint error；`npm run worker:dry-run` 只识别 R2 binding，未部署。
- 下一步：用户完成本地人工视觉与关键流程验收后进入 Phase 8 安全、预算、dead code 和发布清理。

### 2026-07-15：RF-707 单侧栏响应式修正

- 反馈：窄屏 Drawer 与桌面 aside 虽然共享菜单数据，但标题、宽度和关闭方式不同，视觉上像重复导航。
- 修正：删除 PrimeVue Drawer 容器，保留一个响应式 `aside`；桌面固定显示，窄屏通过同一 DOM off-canvas 展开/收起，加入遮罩、关闭按钮、Esc 和路由自动收起。
- 边界：移动端关闭时保持同一侧栏挂载，但通过 `visibility`、`pointer-events: none` 和 `aria-hidden` 排除可访问树与点击命中；桌面侧栏仍保持常驻，`AppNavigation` 仍只有一个实例。
- 验证：针对失败用例 desktop/mobile 2/2 通过；完整 E2E 12/12 通过；lint、Web typecheck、生产 build 通过。
- 下一步：用户继续检查本地页面；确认后进入 Phase 8。

### 2026-07-15：RF-707 宽屏按钮与动画收敛

- 浏览器核对：实际 `window.innerWidth=1053` 时侧栏数量为 1；原汉堡按钮仍显示是 PrimeVue `.p-button` 的 display 优先级覆盖普通 `lg:hidden`，不是断点判断错误。
- 修正：对 PrimeVue 按钮使用重要性响应式 utility，宽屏隐藏汉堡和移动关闭按钮；窄屏只在侧栏关闭时挂载并显示汉堡。
- 动画：删除旧 `fade-scale` 缩放位移，改为 150ms opacity 页面过渡；侧栏遮罩使用 180ms fade；侧栏 transform 过渡保留；全部支持 `prefers-reduced-motion`。
- 验证：宽屏浏览器 DOM/样式检查通过；`npm run verify` 通过，90 unit、76 integration、12 desktop/mobile E2E（桌面 6/6、移动 6/6）；`npm run worker:dry-run` 通过，读取 23 个静态资源，总上传 757.59 KiB / gzip 123.88 KiB，仅识别 `WORKSPACE_BUCKET` R2 binding，未部署。

### 2026-07-15：RF-710 侧栏动画产物修复

- 根因：动态 Tailwind 位移类没有稳定进入生产 CSS，导致侧栏虽有 transition，但计算后的 transform 为 `none`。
- 修正：将侧栏开合状态改为 scoped CSS 的 `translateX/visibility/pointer-events`，只用 Vue 状态切换 `sidebar-open`，保留 200ms 轻量过渡和 reduced-motion 降级。
- 浏览器验证：412x915 视口下关闭状态为 `translateX(-256px)`；打开和收回交互均执行约 200ms 过渡，最终状态分别为 `translateX(0)` 与 `translateX(-256px)`。
- 回归：桌面 E2E 6/6、移动 E2E 6/6 通过；`npm run build` 通过；本地 Wrangler 预览已重启。

### 2026-07-15：RF-712 编辑弹窗头部布局优化

- 调整：桌面端名称、备注、编辑/预览、保存和关闭统一为一行工具栏；移动端自动变为名称/操作与备注两行。
- 简化：Profile 编辑器不再显示 `.json` 后缀；通用 `EditorModal` 仍保留扩展名能力，资产编辑器继续显示 `.json`。
- 验证：`npm run build` 通过；完整桌面/移动 E2E 12/12 通过；本地预览已重启。

### 2026-07-15：RF-708 侧栏动画、模板引用与身份入口修复

- 修正：侧栏不再通过 `v-if` 在移动端关闭时卸载，改为保持单一 DOM 并使用 `transform/visibility/pointer-events/aria-hidden` 切换，恢复真实进出场动画。
- 简化：Profile 模板选择删除“自定义直连”、外部 URL 输入框及对应双语文案；后端 schema、构建器和模板 API 同步删除外部模板兼容。
- 统一：顶栏 GitHub 头像和用户图标均跳转设置/仓库，GitHub 用户名作为 tooltip 提示。
- 文档：新增 ADR-040，并同步工程标准和路线图约束。
- 验证：`npm run verify` 通过，90 unit、76 integration、12 desktop/mobile E2E（桌面 6/6、移动 6/6）；`npm run worker:dry-run` 通过，读取 22 个静态资源，总上传 757.59 KiB / gzip 123.88 KiB，仅识别 `WORKSPACE_BUCKET` R2 binding，未部署。
- 下一步：进入 Phase 8 安全、预算、dead code 和发布清理检查。

### 2026-07-15：Phase 8 初步审计

- 已核对：Worker 当前仅使用 R2 binding；会话、订阅和 SRS ticket 使用 Web Crypto；没有重新引入 KV/D1、`Math.random` 安全 token 或未等待的后台 Promise。
- 审计记录：当时 `compatibility_date` 仍为 `2024-12-01`，且未启用 Workers observability；本阶段已按决策更新兼容日期并保持 observability 关闭。
- 下一步：确认上述运行时/日志策略后继续 RF-800 至 RF-811 的安全、预算、dead code 和恢复演练。

### 2026-07-15：Phase 8 安全边界与恢复演练

- 决策：`compatibility_date` 更新为 `2026-07-15`；暂不启用 Workers observability；保留当前 R2 retention/budget 默认值；不接入 Turnstile。
- 日志：新增 request ID、`X-Request-ID` 响应头、结构化白名单日志和路径脱敏；不记录 Cookie、Authorization、PAT、job ticket、请求 body 或完整私有 JSON。
- 模板：立即删除外部模板兼容；Profile schema、workspace builder 和 `/api/template` 只允许 R2 workspace 模板资产。
- 恢复：本地 R2 演练覆盖 revision A/B、恢复 A 为新 current revision、expected revision/CAS 和 immutable revision 保留；SRS 指针随 workspace snapshot 恢复。
- 生产检查：仅执行 Wrangler 登录状态与 `sing-sub-data` bucket/绑定只读核对，不部署、不写入或删除对象。
- 验证：93 unit、76 integration、12 desktop/mobile E2E、lint、typecheck、build 和 Worker dry-run 全部通过；R2 恢复专项测试 8/8 通过。
- 生产只读检查：Wrangler 登录有效；`sing-sub-data` 为 R2 Standard，29 个对象、约 729 kB；未读取对象内容、未部署、未写入或删除数据。
- 阶段结果：Phase 8 完成；后续已按 ADR-042 进入 Phase 9 Beta 稳定与产品化。

### 2026-07-15：v3.0.0-beta.1 发布前收束

- 版本：`package.json`、lockfile 与 WebUI About 统一为 `3.0.0-beta.1`。
- 许可证：Beta 当时补充 MIT `LICENSE`；正式版前已由 ADR-049 切换为 GPL-3.0-only。
- 清理：删除未使用的自研 `Button.vue` 和只剩测试调用的旧 asset facade；测试改为直接覆盖 domain path parser。
- 文档：重写过时的中文 README 与中英文 WIKI，移除 GitHub/KV 主存储、tokenized SRS 和手动 workflow 旧说明。
- 目录：记录发布版实际目录结构；保留稳定的扁平 routes/components，避免为理想树制造空目录或机械搬迁。
- 本地残留：已清理 debug log、npm cache、Playwright 产物和可移除的 build 目录；当前运行中的本地 Wrangler 预览仍持有 `.wrangler` state，目录保持 ignored，不进入仓库；Secret 文件 `.dev.vars` 保持本地忽略。
- 验证：`npm run verify` 通过（92 unit、76 integration、12 desktop/mobile E2E），`npm run worker:dry-run`、版本/引用扫描通过；没有业务源码空目录。`.agents` 属于本地工具目录，不纳入发布内容。
- 部署加固：`deploy.yml` 的 push 与手动触发均只允许 `main` ref；正式 deploy 前先执行 Worker dry-run，完整 verify 继续由 PR required check 承担。

### 2026-07-15：配置产物顺序保持修复

- 根因：workspace revision body 复用了递归排序的 canonical JSON，导致模板资产写入 R2 后丢失原始字段顺序；最终构建读取到的已经是排序后的模板。
- 修复：revision body 改用保序 JSON 序列化，content hash 继续使用 canonical JSON，CAS、内容一致性和 sync hash 语义不变。
- 构建：模板字段顺序、节点源顺序和 outbound 模板顺序保持；多条 inbound 规则命中同一锚点时按规则顺序稳定插入，不再反向堆叠。
- 兼容：现有生产 revision 已经丢失的模板顺序无法自动推断；部署修复后需要重新保存或重新导入一次对应模板，后续 revision 才会保留期望顺序。
- 验证：93 unit、77 integration、12 desktop/mobile E2E、lint、typecheck、build 和 Worker dry-run 全部通过。

### 2026-07-15：Phase 9 Beta 稳定与产品化启动

- 阶段调整：Phase 0-8 重构正式完成；原“低优先级 Release 自动化”扩展为当前进行中的 Beta 稳定与产品化阶段。
- 版本门禁：当前保持 `3.0.0-beta.1`；部署方案、Profile target adapter、前端 Beta 收束、P0/P1 回归和 Release smoke 未完成前不得更新为 `3.0.0`。
- 部署方向：普通用户下载可信 Release，通过本地 CLI/Windows 助手完成 Cloudflare setup/update/rollback，不要求 fork 或让维护仓库接触用户凭据。
- 配置方向：ADR-043 已接受并由 RF-908/RF-909 完成；Profile 使用可编辑 replacement adapter，Momo 是初始化预设而不是代码特例。
- 前端方向：继续收集生产 Beta 使用反馈，优先修复功能、移动端、i18n、可访问性和性能问题，不重开基础架构或组件库迁移。
- 下一任务：继续推进 RF-900 至 RF-907 部署助手，以及 RF-910/RF-911 前端 Beta 与生产回归；adapter 不再是正式版阻塞项。

### 2026-07-15：RF-913 短订阅 Token 切换

- 旧格式：`v1.<JSON claims>.<full HMAC>` 在 URL 中重复携带固定 workspace/purpose，长度较大。
- 新格式：`s2.<22-char-tag>`，对 domain、workspace、tokenVersion 和 purpose 计算 HMAC-SHA-256 并截取 128 bits，总长 25 字符。
- 安全边界：继续使用独立 `SUBSCRIPTION_SIGNING_SECRET`，无 KV/R2 token index；轮换 tokenVersion 或 Secret 即失效，tamper/错误 workspace/错误 version 均拒绝。
- 兼容：不解析旧 `v1` Token；部署后旧私有订阅链接立即返回 404，必须从 WebUI 重新复制。
- 初始化：ADR-045 接受未来由本地部署助手自动生成并上传 signing secret、WebUI 默认空 workspace/GitHub 后连；本轮未修改初始化代码。
- 验证：`npm run verify` 全通过（93 unit、77 integration、12/12 desktop/mobile E2E），`npm run worker:dry-run` 通过；Wrangler 4.110.0 完成 Worker 与 22 个静态资源打包，未部署生产。

### 2026-07-16：RF-908/RF-909 replacement adapter 完成

- 数据模型：workspace snapshot 直接切换为 schema v2，`assets.patches` 改为 `assets.adapters`；Profile 删除 `patchUrl`/`overrides`，只保留可选 `adapterUrl`。editable-sync manifest 同步切换为 schema v2 和 `sing-sub/adapters/*.json`。
- 构建：删除 `smartMerge` 与 `$set/$append/$prepend/$remove/$replace`。adapter 只支持已存在路径的完整字段替换，或在数组中按浅层 primitive 字段恰好匹配一个元素后完整替换；零匹配、多匹配、路径缺失和目标类型错误均中止构建。
- 预设：新 workspace 初始化创建可编辑的 `momo` adapter，完整替换 `inbounds`，并把唯一 `action: hijack-dns` 规则替换为绑定 `dns-in` 的规则；Worker 没有 Momo 专用执行分支。
- 前端：资源导航、资源编辑器、Profile 选择器、中英文文案与 desktop/mobile smoke 全部从补丁切换为适配器；用户可编辑 Momo 或新建其他 replacement adapter。
- 兼容：旧 GitHub patches 与旧 DSL 不属于长期兼容范围；生产已有 R2 schema v1 workspace 改由 RF-914 临时登录迁移器一次性升级，验证后删除，不要求清空 bucket 或手工重建业务数据。
- 验证：`npm run verify` 全通过（98 unit、78 integration、12/12 desktop/mobile E2E）；`npm run worker:dry-run` 通过，Wrangler 4.110.0 完成 Worker 与 22 个静态资源打包，总上传 764.00 KiB / gzip 125.40 KiB，仅绑定 `WORKSPACE_BUCKET`，未部署生产。

### 2026-07-16：RF-914 临时 workspace v1→v2 迁移器

- 触发：bootstrap 对合法 v1 只报告已有 workspace；登录先校验管理员 Worker Secret，正确后才执行迁移。错误口令和普通读取不写 R2。
- 原子性：校验 v1 head/revision identity 与 canonical hash，先写 immutable v2 root revision，再用 head ETag/CAS 切换；并发或失败不会覆盖未知 head。
- 数据：保留节点、模板、Profile、规则集、settings、build/SRS pointer、migration metadata 与 R2 private credentials；删除 patch/overrides，创建 Momo adapter，并只把原来选择 patch 的 Profile 指向它。
- 同步：清除指向 v1 revision 的 sync base 并重置为 `never`；登录迁移不访问或写入 GitHub。旧 remote schema 无效时状态页仍返回 conflict，禁止 pull，只允许用户确认 R2 overwrite push 将受管文件升级为 v2。
- 生命周期：workspace 已为 v2 时自动 no-op；生产验证通过后删除临时模块、认证接线与测试，正式版不保留 v1 schema 解析。
- 验证：`npm run verify` 全通过（99 unit、83 integration、12/12 desktop/mobile E2E）；迁移测试覆盖 bootstrap 只读、错误口令、数据/凭据/SRS pointer 保留、Momo 实际预览、幂等、hash 拒绝与并发 CAS，并验证旧 remote 只能由显式 R2 overwrite push 修复。`npm run worker:dry-run` 通过，总上传 774.36 KiB / gzip 127.48 KiB，仅绑定 `WORKSPACE_BUCKET`，未部署生产。

### 2026-07-16：RF-915 一次性迁移器清理

- 生产确认：WebUI 数据与功能正常，GitHub `sing-sub/manifest.json` 已为 schema v2，R2 active workspace 已通过新 Worker 正常读写。
- 删除：移除 v1 workspace schema、登录时识别/CAS 升级路径与 5 个专用集成测试；认证和 bootstrap 恢复为只接受当前 v2 store。
- 保留：无效 GitHub remote 只能由显式 R2 overwrite push 修复的通用保护继续存在；该路径不识别、转换或执行旧 patch DSL。
- 结果：运行时代码不再包含 workspace v1、`patchUrl`、`profile.overrides` 或旧 patch DSL 兼容读取。
- 验证：`npm run verify` 全通过（99 unit、78 integration、12/12 desktop/mobile E2E）；`npm run worker:dry-run` 通过，总上传 766.85 KiB / gzip 125.85 KiB，仅绑定 `WORKSPACE_BUCKET`，未部署生产。

### 2026-07-16：RF-900 至 RF-907 Workers Builds 初始化实现

- 部署：新增幂等 `scripts/deploy-cloudflare.mjs`；自动创建或复用 `sing-sub-data`，从加密 Build Secret 补充缺失的管理员口令，并分别生成缺失的 signing secrets。已有 R2 对象和 runtime secret 不删除、不覆盖、不轮换。
- 解耦：删除网站部署 `deploy.yml`；`ci.yml` 只负责 PR 验证，私有数据仓库 workflow 只负责可选 SRS 编译。
- 登录：首次登录契约只接受管理员口令并创建空 workspace；删除 GitHub/PAT 登录导入、旧 source reader、旧 migration dry-run 和对应测试。数据导入只能登录后通过显式 sync pull 完成。
- 文档：完成 fork、Cloudflare Workers Builds、`Sync fork` 更新、Worker version rollback 和 Secret 恢复说明；同步更新中英文 README 与架构决策。
- 验证：`npm run verify` 全通过（107 unit、66 integration、12/12 desktop/mobile E2E）；`npm run worker:dry-run` 通过，Wrangler 4.110.0 完成 Worker 与 22 个静态资源打包，总上传 749.93 KiB / gzip 122.22 KiB，仅绑定 `WORKSPACE_BUCKET`，未部署生产。
- 实现完成时的待验证状态：RF-900/RF-902/RF-904/RF-905 当时保持 `IN_PROGRESS`，需要真实 Cloudflare Build、业务 smoke 和版本回滚演练；RF-902 后续生产验证已完成，见下方专项记录。
- 兼容边界：旧登录导入和历史迁移代码已直接删除；生产验证后没有待删除的一次性兼容代码。部署初始化器是长期正式入口。

### 2026-07-16：RF-910 前端 Beta 优化完成

- 弹窗：桌面名称/备注使用 160-224px 与 224-320px 有界弹性宽度，不填满标题区；预览态在左侧按内容紧凑组合。模式切换紧邻保存左侧；中等宽度分离元数据/操作行，手机端保持垂直满宽字段；移除可见 `.json` 后缀，所有状态切换不跳位。
- 响应式：统一 16px 移动端留白和 44px 触控目标；Profile 选择器、Ruleset SOURCE、CodeMirror 搜索、同步按钮、设置页和长仓库名在窄屏不溢出。
- 文案：同步精简中英文登录、设置、Profile、同步和状态文本；复制反馈改为稳定的 `订阅`/`已复制`，保留 Token 轮换和覆盖方向等必要风险。
- 规则集：卡片合并为单个 `SRS` 或 `JSON` 链接按钮，格式只信任后端 `formats.binary`；失败继续保留 retry，未改动服务端 endpoint 降级语义。
- 追加收束：侧栏激活项只保留主题色背景/文字和字重，删除自定义实线/阴影；导航与资产图标按语义统一；同步页刷新/拉取/推送共享互斥忙碌态。
- 主题与性能：同源 `theme-init.js` 在 Vue 挂载前读取保存/系统主题，同步设置 `app-dark`、`color-scheme`、theme color 和根背景，不放宽现有 CSP；删除路由内容 `mode="out-in"` 150ms 淡出，避免 Firefox 等待 transition end 后才挂载新页。
- 元数据：Beta 当时把关于页许可证与根目录 MIT 声明对齐；正式版前已由 ADR-049 统一切换为 GPL-3.0-only。
- 验证：`npm run verify` 全通过（107 unit、66 integration、28/28 Chromium desktop/mobile + Firefox desktop E2E）；桌面弹窗标题区 < 140px，字段宽度/顺序和模式切换稳定；Firefox 主题首帧和内容切换专项通过，切换 < 130ms；`npm run worker:dry-run` 通过，23 个静态资源总上传 749.93 KiB / gzip 122.22 KiB，仅绑定 `WORKSPACE_BUCKET`，未部署生产。
- 阶段结果：后续 `main` push 已由 Cloudflare Workers Builds 自动拉取并成功部署；RF-910 的 Beta UI 优化全部完成，无已知 UI 阻塞。

### 2026-07-16：RF-902 生产 Workers Builds 切换验证

- 生产更新：官方仓库推送后，Cloudflare 正常检测 `main` 新 commit、自动拉取、构建并更新现有 Worker；网站部署不再依赖 GitHub deployment Action。
- 业务 smoke：生产 WebUI 功能正常，侧栏激活态、同步互斥加载反馈及本轮其他 UI 优化均已落地。
- 任务状态：RF-902 改为 `DONE`；RF-900/RF-904 仍等待独立 Cloudflare 账户 fresh-account smoke，RF-905 仍等待 `Sync fork` 用户路径与 Worker version rollback 演练。
- 验证限制：当前无第二个 Cloudflare 账户，因此不用删除现有 Worker、清空 R2 或重建生产资源的方式模拟新账户。
- 下一步：保持 `3.0.0-beta.1`，等待下一轮 UI 优化反馈；有独立账户或正式版发布前再补 fresh-account 与回滚验证。

### 2026-07-17：RF-912 与 `3.0.0` 正式版收束

- 版本：`package.json`、lockfile 与 WebUI About 统一为 `3.0.0`；Phase 9 与 RF-900/RF-904/RF-905/RF-911/RF-912 标记完成。
- 文档：重写精简中英文 README，标题使用 Sing Sub favicon；删除根目录旧 WIKI；新增并在线发布 `docs/wiki` 双语部署、适配器、首页和侧栏。
- 许可证：按 ADR-049 从 Beta 的 MIT 切换为 `GPL-3.0-only`；根目录使用完整 GNU GPL v3 正文，npm metadata、README、WebUI 和 E2E 一致。
- 发布前 UI：完成 FBO-16；名称/备注字段收紧为 112-176px 与 128-224px，预览文本放大并垂直居中，桌面/手机编辑与预览共用固定元数据轨道，切换不再改变 header 高度、正文起点或操作控件位置。
- 验证：`npm run verify` 全通过（107 unit、66 integration、28/28 Chromium desktop/mobile + Firefox desktop E2E）；`npm run worker:dry-run` 通过，Wrangler 4.110.0 打包 23 个静态资源，总上传 749.93 KiB / gzip 122.22 KiB，仅绑定 `WORKSPACE_BUCKET`，未部署生产。
- 生产依据：维护者 `main` 自动更新与业务 smoke 已验证；R2 本地恢复模型、Wrangler version discovery 和配置检查已通过。
- 延期项：独立账户 fresh-account、普通用户 `Sync fork` 与实际 Worker rollback 按 ADR-048 延期到首次外部部署、获得第二 Cloudflare 账户或真实故障，不阻塞稳定版。
- 结果：Phase 0-9 完成，无已知 P0/P1 阻塞；本次未创建 tag、GitHub Release，也未部署生产。

### 日志模板

```text
### YYYY-MM-DD：RF-NNN 简短标题

- 开始状态：
- 完成内容：
- 文件/模块：
- 验证：
- 遗留风险：
- 下一任务：
```
