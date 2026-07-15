# 架构决策记录

状态：`ACCEPTED` 已锁定；`PROPOSED` 在对应阶段前确认；`SUPERSEDED` 已被后续决策替代。

| ID | 状态 | 决策 | 原因 |
|---|---|---|---|
| ADR-001 | ACCEPTED | 保留 Vue 3，不迁移 React | React 重写不改善数据与 Worker 架构，只扩大工作量。 |
| ADR-002 | ACCEPTED | 使用实施时最新稳定 PrimeVue，禁止 RC | 降低基础交互维护成本并避免候选版风险。 |
| ADR-003 | ACCEPTED | PrimeVue 按 v5 兼容 API 编写 | 降低未来 major 升级成本。 |
| ADR-004 | ACCEPTED | Vue I18n 首批支持 zh-CN/en-US | 文案与错误码分离，便于扩展语言。 |
| ADR-005 | ACCEPTED | Pinia 管理跨页面状态 | 从 App.vue 移出 session、collection、build、sync 状态。 |
| ADR-006 | ACCEPTED | Vue Router 表达主页面 | URL 替代 App.vue tab ref，页面边界清晰。 |
| ADR-007 | ACCEPTED | 使用 ports/adapters | 隔离 R2、GitHub 和 HTTP，支持 fake/integration test。 |
| ADR-008 | SUPERSEDED | GitHub 文件写入使用 blob/head 乐观锁 | ADR-029 将在线存储切换为 R2 revision；GitHub 乐观锁只保留给可选 sync adapter。 |
| ADR-009 | ACCEPTED | Repository provisioning 与 CRUD 分离 | 显式 SRS enable command 自动安装或升级私有仓库 workflow；普通 ruleset save 永不管理 workflow。 |
| ADR-010 | ACCEPTED | 每个 Worker 部署只管理一个 `primary` workspace | 每个用户独立部署 Worker/R2，避免用户索引、权限系统与 workspace lookup；源码不要求 fork。 |
| ADR-011 | ACCEPTED | API 返回稳定错误码，前端翻译 | 支持 i18n，不泄漏基础设施自由文本。 |
| ADR-012 | ACCEPTED | 渐进式迁移，不做长期大爆炸分支 | 每阶段可验证、发布、回滚。 |
| ADR-013 | ACCEPTED | 保留 CodeMirror、Lucide、vuedraggable | 它们解决专业需求，不是自研轮子。 |
| ADR-014 | ACCEPTED | Tailwind 保留为布局工具 | PrimeVue 管控件，Tailwind 管布局。 |
| ADR-015 | ACCEPTED | 不机械包装 PrimeVue 组件 | 仅对项目语义或兼容边界做薄封装。 |
| ADR-016 | SUPERSEDED | D1 是唯一业务主数据库 | 当前单管理员、低频写入和整体 JSON workspace 不需要 SQL；由 ADR-029 取代。 |
| ADR-017 | SUPERSEDED | R2 Standard 只保存 SRS 与快照 | ADR-029 扩大 R2 为唯一持久化存储。 |
| ADR-018 | SUPERSEDED | KV 只保存 session 与可重建缓存 | 最终删除 KV；会话使用签名 Cookie，缓存使用 Workers Cache API。 |
| ADR-019 | ACCEPTED | GitHub Actions 是无状态 SRS 编译器 | 免费运行官方 sing-box，不让 GitHub 仓库承担主存储。 |
| ADR-020 | ACCEPTED | Action 通过 Worker callback 发布 SRS | Action 不持有 Cloudflare 存储凭据，Worker 验证后写 R2。 |
| ADR-021 | ACCEPTED | GitHub private 是可选 sync/backup gateway | 日常 CRUD 不实时访问 GitHub，IDE 编辑仍可通过主动 pull/push 保留。 |
| ADR-022 | SUPERSEDED | GitHub sync 使用 manifest 文件级三方比较 | ADR-038 改用 R2 base 与实际 GitHub 文件树的整体摘要，降低实现与冲突处理成本。 |
| ADR-023 | SUPERSEDED | D1 迁移采用一次性切换，不长期双写 | 改为一次性导入首个 R2 revision，原则仍是不长期双写。 |
| ADR-024 | ACCEPTED | SRS 构建异步且保留旧 active artifact | 保存不等待编译，失败不破坏现有订阅。 |
| ADR-025 | ACCEPTED | 安全优先基本保障与性能 | R2 依赖平台静态加密，不做逐字段加密；private GitHub editable tree 允许明文 JSON。 |
| ADR-026 | ACCEPTED | 不使用 Cloudflare Containers | 仅使用 Workers、R2 Standard 与 Cache API，Actions 提供编译计算。 |
| ADR-027 | ACCEPTED | R2 使用软预算与保留策略 | R2 超免费额度会计费，默认限制历史产物和快照数量。 |
| ADR-028 | ACCEPTED | 不依赖 Cloudflare Queue/Cron | 使用 R2 deterministic job、`ctx.waitUntil` dispatch 和管理员显式 retry，避免为少数 SRS 用户增加所有部署的后台服务。 |
| ADR-029 | ACCEPTED | R2 Standard 是唯一持久化存储 | 当前 workspace 小、低并发、无复杂查询；immutable revision + ETag head 同时覆盖 CRUD、快照、回滚与 SRS。 |
| ADR-030 | ACCEPTED | 最终移除 KV 和 D1 | 签名 Cookie 替代 session store，HMAC token 替代 token index，Cache API 只承担可丢弃热点缓存。 |
| ADR-031 | ACCEPTED | 空 R2 默认创建本地 workspace，GitHub 导入可选 | R2 是主存储；强制仓库/PAT 会让可选同步介质重新成为启动依赖。 |
| ADR-032 | ACCEPTED | SRS 使用无 Token 的公开短链接 | 规则集是公开资产；复用私有订阅 Token 会让公开分享间接泄露 JSON bearer credential。 |
| ADR-033 | ACCEPTED | 生产部署必须显式触发 | Release 更新不应自动改动生产 Worker；完整一键 onboarding 延后到 Phase 9。 |
| ADR-034 | ACCEPTED | 普通用户通过独立 Release 部署，不要求 fork | 维护仓库负责发布可信版本包；部署助手在用户本机连接其 Cloudflare。具体工具形态在 Phase 9 决定。 |
| ADR-035 | ACCEPTED | JSON ruleset 始终公开分发，SRS 是可选优化 | 没有 GitHub/Actions 时仍保留完整规则集编辑与订阅能力。 |
| ADR-036 | ACCEPTED | 订阅按 current revision 动态构建，Cache 仅做加速 | 避免持久化最终配置、手动重建与失效扇出；保存后通过新 revision 自动绕过旧 cache。 |
| ADR-037 | ACCEPTED | SRS 使用短期 job ticket 自动 provision | 不要求用户配置 GitHub Action Secret/Variable；ticket 只授权单一、短期 build callback。 |
| ADR-038 | ACCEPTED | GitHub sync 使用安全方向同步 | 保留 base/local/remote 防误覆盖，但第一版不自动逐文件合并；冲突时只允许显式整侧覆盖。 |
| ADR-042 | ACCEPTED | 重构完成后进入 Beta 稳定阶段，设置 `3.0.0` 发布门禁 | 部署产品化、适配器机制和前端反馈仍需要真实使用验证，不能把架构完成等同于正式版完成。 |
| ADR-043 | ACCEPTED | 用可编辑 replacement adapter 取代通用 patch DSL | 初始化创建 Momo 预设；构建器只支持严格路径替换和唯一数组匹配替换。 |
| ADR-044 | ACCEPTED | 私有订阅直接切换为 25 字符确定性短 Token | 单 workspace 不需要在 URL 重复携带 claims；128-bit HMAC tag 保留轮换和隔离能力并显著缩短链接。 |
| ADR-045 | ACCEPTED | Beta 初始化目标由本地部署助手承担 Secret 与 Cloudflare 资源配置 | WebUI 默认只初始化空 workspace，GitHub 后连；本轮只记录方案，不修改现有初始化实现。 |
| ADR-046 | SUPERSEDED | 用正确管理员登录触发一次性 R2 schema v1→v2 升级 | 生产迁移验证完成；临时 schema、登录接线与测试已删除。 |

## ADR-002：PrimeVue 版本政策

- 安装当天检查 npm `latest`。
- 2026-07-15 实施时 npm stable `latest` 为 PrimeVue 4.5.5，项目锁定该 major/patch 范围；包内许可证确认为 MIT。
- v5 成为正式 `latest` 时直接使用 v5 稳定版。
- 若仍为 RC，使用 v4 最新 patch 并避开 v5 已废弃 API。
- 提交 lockfile，不自动跨 major。
- v5 升级前复核最终许可证。

## ADR-010：Workspace/session scope

每个 Worker 部署固定使用逻辑 workspace ID `primary`，只服务一个管理员。管理员可在多个浏览器或设备同时持有独立 signed Cookie session，但不存在第二个用户、角色或 workspace lookup index。

- 管理员口令与 HMAC signing key 使用 Worker secrets，不进入 R2、GitHub、前端 bundle 或日志。
- Cookie 丢失或到期后使用管理员口令重新登录，不依赖 GitHub 可用性。
- GitHub owner/repo/PAT 只用于用户主动选择的首次导入或后续可选 sync，不作为初始化必填项或日常登录身份。
- 其他用户通过正式 Release 在自己的账户部署独立 Worker/R2 bucket，不共享本部署数据；fork 仅用于贡献或自定义源码。
- 若未来需要多用户或多 workspace，必须新增 ADR，引入身份、索引、归属和权限模型，不能在 `primary` 上追加临时映射。

## ADR-029/030：R2-only 主数据

- 一个 workspace revision 保存 settings、Profile、Asset、Ruleset source、build summary 与 sync metadata。
- revision 与 SRS artifact 使用不可变 key；`head.json` 是唯一可变业务指针。
- 更新通过 expected revision 与 R2 ETag conditional put 发布，冲突返回 409。
- GitHub credential 等 private metadata 使用独立 R2 prefix，不进入 revision 或导出。
- 会话使用短期签名 Cookie，订阅使用 HMAC token，热点响应使用 Workers Cache API。
- 不创建 D1；现有 KV 在 R2 切换并验证后删除。
- 若未来出现多人协作、复杂查询或高频局部写入，必须新建 ADR 复审，而不是在现有 command 中直接加入 SQL。

## ADR-031：GitHub 可选初始化

- 空 R2 首次初始化默认只要求管理员口令，创建空 `primary` workspace。
- GitHub 导入通过显式可选入口填写 `owner/repo` 与 PAT，并执行只读固定 commit dry-run。
- 初始化后可在 sync 功能中连接 GitHub；未连接时所有 R2 CRUD、订阅和登录保持完整。
- workspace 存在后的多设备登录只提交管理员口令。

## ADR-032：公开 SRS 与私有 JSON 隔离

- 私有配置继续使用 `/sub/{hmacToken}/{profile}.json`；Token 只授权 JSON 订阅。
- 公开 source ruleset 使用 `/rules/{ruleset}.json`，始终从 current R2 revision 生成，并移除 `_sing_sub` 编辑元数据。
- 公开 SRS 使用 `/rules/{ruleset}.srs`，不包含订阅 Token、session、artifact hash 或 R2 key。
- 公开 ruleset router 从设计上只接受单一安全 `ruleset` ID；包含额外 path segment 的请求直接 404，不解析、验证或拼接订阅 token。
- 公共路由不提供列表，名称使用安全 codec，不存在或未编译统一返回 404，并使用短期 public cache 与内容 ETag。
- URL 会暴露部署域名和可猜测的规则集名称，但不会导出管理员口令、HMAC secret、PAT 或 private R2 metadata。
- 当前产品把所有 SRS source 视为可公开内容；未来如需私有规则集，必须设计独立授权模式，不得复用配置订阅 Token。

## ADR-033/034：维护者部署与独立 Release 分发

- 维护者拥有源码仓库和目标 Cloudflare 部署，`.github/workflows/deploy.yml` 允许 `main` push 自动部署并保留 `workflow_dispatch`。
- 首次部署当前仍使用 Wrangler 手动创建 R2、设置 Worker secrets、配置域名并部署。
- Phase 9 再实现可重复的 Release setup/update 流程，区分首次建站、版本更新和生产回滚。
- 普通 Release 用户不复用维护者 Action，不要求 fork；更新只能检查并提示，经用户确认后由本地工具显式部署。
- 普通用户从维护仓库下载 Release，不需要 fork 或维护 Git 工作区；Release Action 只发布版本包，不持有用户 Cloudflare 凭据。

## ADR-019/020：SRS 编译

- canonical workflow 作为版本化模板随 Sing-Sub Release 发布；用户显式开启 SRS 后，Worker 使用已连接仓库的最小权限 PAT 自动、幂等地安装或升级模板。
- 维护者与普通用户使用同一机制；Sing-Sub 源码仓库不作为其他部署的公共编译服务。
- SRS compiler 是可选功能；缺少已连接私有仓库或可 provision/dispatch 的 PAT 时不启用。启用成功后扫描 current ruleset 并补建缺失或过期 job。
- 未启用 SRS 时，ruleset source 仍通过 `/rules/{ruleset}.json` 公开分发，WebUI、R2 CRUD、JSON 配置订阅和规则集订阅保持完整。
- ruleset save 生成确定性 immutable job，并通过 workspace head 条件发布使 pending 状态可见。
- Action 通过短期、job-scoped ticket 认证的 Worker endpoint 拉 source、推 artifact。
- Action 不持有 R2 或 Cloudflare token。
- Artifact 先写不可变 R2 key，再通过最新 workspace revision 激活；sourceHash 不匹配则 superseded。
- stale callback 标记 superseded，失败保留旧 artifact。

## ADR-035：JSON ruleset 基础分发

- R2 workspace 中带 `_sing_sub` 的文档是编辑源；公开响应只包含 sing-box `version` 与 `rules` 字段。
- `/rules/{ruleset}.json` 使用 `application/json`、内容 ETag 与 public cache，不依赖 GitHub 或 build job。
- `/rules/{ruleset}.srs` 只在 active artifact 存在时响应；失败或未启用编译不影响 JSON URL。
- WebUI 默认提供 JSON 订阅链接；有 ready SRS 时显示 binary 选项，调用方必须为 JSON 使用 `format: source`、为 SRS 使用 `format: binary`。

## ADR-036：动态订阅与无通用刷新

- 私有配置订阅请求从 current workspace revision 动态加载模板、节点、adapter 和 profile 规则后构建最终 JSON；最终配置不写入 R2、GitHub 或其他持久化缓存。
- Workers Cache API 仅缓存可丢弃的最终响应，cache identity 必须包含 workspace revision 与 profile。任何内部数据保存发布新 revision 后，下一次请求自动使用新 key，不需要用户重建或清除缓存。
- Profile 模板只来自 workspace revision，预览与订阅都使用明确的 revision 信号；外部模板不属于当前能力范围。
- WebUI 不保留通用“刷新/重建”按钮、`?refresh=1` 或隐式 GitHub pull。浏览器重新加载已经足以读取 current R2 state。
- 多设备草稿冲突使用明确的 reload/discard 流程；GitHub pull/push、规则来源更新和 SRS retry 均是独立的命令。

## ADR-037：SRS 自动 provision 与短期 job ticket

- SRS enable 是独立 command，不是首次部署、GitHub connect、sync enable 或普通 ruleset save 的副作用。
- Worker 通过 R2 private metadata 中已连接仓库的 PAT 验证 private visibility、Contents/Actions 写权限，并对 workflow 模板 hash 做幂等 upsert；无模板变化不创建 commit。
- Worker 从既有 deployment signing secret 派生独立 SRS ticket key，签发包含 job ID、操作集合与短过期时间的 HMAC ticket。
- `workflow_dispatch` 输入只包含 job ID、Worker HTTPS origin 和 ticket；Action 不使用 repository Variable 或 Actions Secret。
- ticket 仅可读取/完成/失败对应 job，过期、job 不匹配、状态不匹配或 superseded 均拒绝；日志不得输出 ticket。
- PAT 仅限已绑定 private repository 的 Contents 读写与 Actions/Workflows 读写，不需要 Admin、Actions Secret、Cloudflare credential 或其他仓库访问。

## ADR-021/022：GitHub 模式

`editable-sync` 是用户主动的文件树 push/pull，同时承担可编辑站外备份并保留 IDE 编辑。R2 workspace 始终是在线主数据，GitHub 变化只有用户执行 pull 并发布新 revision 后才生效。

一次 push 最多一个 commit；pull 先 diff/校验，双边变化进入显式冲突处理。独立加密时间快照不进入当前范围，后续若版本历史不足再单独立项。

## ADR-038：安全方向同步

- R2 保存上次成功同步的 base workspace revision、base GitHub commit 和整体业务 content hash；GitHub manifest 只是最近一次 Worker 导出的说明文件。
- 每次状态检查和操作都读取 GitHub 实际受管文件，规范化 JSON 后比较 `base/local/remote`；时间戳不决定覆盖方向。
- 仅 local 变化可普通 push，仅 remote 变化可普通 pull，内容相同可直接对齐 base；首次同步和双方变化都必须显式选边。
- 第一版不做逐文件自动合并或字段级合并。UI 仍展示文件级新增、修改、删除，但冲突解决只有“R2 覆盖 GitHub”“GitHub 覆盖 R2”“取消”。
- 覆盖 R2 前已有 immutable revision 可恢复；覆盖 GitHub 后已有 Git commit history 可恢复。任何 R2 expected revision 或 GitHub head 竞争变化都中止操作。
- 该模型保留未来逐文件合并所需的 base revision 与 file hash，但当前不承担合并器和逐文件选择 UI 的成本。

## ADR-025：基础安全

- 日常 R2 数据依赖平台静态加密和 Worker 鉴权，不做逐字段应用加密。
- R2 bucket private。
- GitHub editable sync 使用 private repository，允许明文 JSON 以保留 IDE 体验，并明确提示私钥风险。
- 当前不创建额外 GitHub 加密时间快照；若未来新增，必须通过独立 ADR 定义 key 生命周期、恢复和保留策略。
- PAT、短期 job ticket 不进入前端、日志或数据仓库文件。

## ADR-039：前端信息架构与原生组件边界

状态：ACCEPTED
日期：2026-07-15

- WebUI 只渲染一套侧栏：桌面常驻，窄屏时同一侧栏以 off-canvas 方式展开/收起；不再用第二个 Drawer 容器重复导航视觉。
- 一级入口为配置、资源、同步、设置。资源包含节点集、模板、适配器和规则集；规则集仍属于资源语义，但因公开 JSON/SRS 与构建生命周期使用独立子路由和专属页面。
- 设置子项固定为通用、订阅、仓库、关于。仓库页管理连接、PAT、默认分支与 SRS 全局开关；同步页管理 diff、push、pull 和冲突决策。
- Profile 保留卡片/列表打开 Dialog 的低成本交互，编辑/预览切换保留；预览基于未保存 draft 动态构建。废弃设计稿中的页面内展开编辑区。
- 顶栏标题是页面唯一标题。语义相同的操作必须共享图标、尺寸、variant 和 tooltip；不建立历史通知中心。
- PrimeVue primitives 直接用于菜单、Dialog、表单、Toast、Message 和确认交互；响应式侧栏只复用一份 DOM 与 `AppNavigation`。主题只使用 preset/token，动画不新增依赖。

## ADR-040：模板引用与侧栏动画边界

状态：ACCEPTED
日期：2026-07-15

- Profile 编辑器的模板字段只允许选择 R2 workspace 中的模板资产，不提供自定义外部 URL 输入或“自定义直连”选项。
- 旧 Profile 中的 HTTP 模板引用不再兼容读取；schema、预览构建和模板 API 均直接拒绝外部模板。未来若恢复外部模板能力，必须在模板资源页设计独立导入、校验和错误状态，并通过新的 ADR 重新启用。
- 响应式侧栏只保留一个 DOM 实例。桌面常驻；移动端关闭时不卸载侧栏，而是通过 `transform`、`visibility`、`pointer-events` 和 `aria-hidden` 切换状态，以确保进入和离场动画都能执行。
- 顶栏头像继续显示 GitHub 用户身份；点击统一进入设置/仓库，不跳转通用设置。未连接 GitHub 时显示通用用户图标。

## ADR-041：Phase 8 运行时与基础可观测性

状态：ACCEPTED
日期：2026-07-15

- Worker `compatibility_date` 跟随本阶段日期 `2026-07-15`，通过完整测试与 `wrangler deploy --dry-run` 验证，不在本阶段自动部署生产。
- 暂不启用 Workers observability，也不接入 Turnstile；个人单用户部署继续依赖管理员口令、签名 Cookie 和 Cloudflare 边缘防护，应用层不伪造全局限速状态。
- 每个请求生成不可由客户端指定的 UUID request ID，并通过 `X-Request-ID` 返回。Worker 日志使用结构化 JSON 和字段白名单，订阅 token、job id 路径参数化，禁止记录认证头、Cookie、PAT、ticket、请求体和私有 JSON。
- 外部模板兼容立即删除，不提供迁移读取旁路。规则集公开 URL 导入仍保留既有 SSRF、大小、重定向和超时限制，两者不得混用。
- R2 retention/budget 默认值保持不变；先完成本地恢复演练，再做生产只读检查，生产部署和数据写入必须另行授权。

## ADR-042：Beta 稳定阶段与正式版门禁

状态：ACCEPTED
日期：2026-07-15

- Phase 0-8 的架构重构已经完成，当前版本保持 `3.0.0-beta.1` 并进入 Phase 9 Beta 稳定与产品化。
- Beta 阶段统一承接普通用户部署/升级方案、Profile 适配器机制优化、前端反馈和生产回归，不再把这些工作标记为低优先级尾项。
- `3.0.0` 不是单纯修改版本号；只有部署/升级/回滚演练、P0/P1 bug、正式版文档、完整验证和兼容矩阵全部通过后才可发布。
- Beta 中的数据结构或行为修改必须提供迁移与回滚路径；现有 R2 revision、GitHub sync、SRS 和签名认证边界继续作为不可降低的基线。

## ADR-043：可编辑 replacement adapter

状态：ACCEPTED
日期：2026-07-16

- Profile 只保留 `templateUrl`、可选 `adapterUrl`、`nodesPath` 与节点筛选规则；删除 `overrides`、`patchUrl`、`smartMerge` 和 `$set/$append/$prepend/$remove/$replace`。
- adapter 是普通、可编辑、可同步的 workspace JSON 资源，路径为 `sing-sub/adapters/{name}.json`。新 workspace 初始化时创建 `momo` 预设，用户可修改、复制或新增其他 adapter；Worker 不包含 Momo 专用分支。
- adapter schema v1 只有 `replacements`。每条 replacement 使用字符串数组 `path` 指向已存在字段；没有 `match` 时整体替换字段，有 `match` 时目标必须为数组并恰好命中一个浅层 primitive 字段子集，然后整体替换该元素。
- 路径缺失、目标类型错误、零匹配或多匹配均中止构建并返回明确错误。adapter 不合并、不追加、不删除、不创建缺失字段，不支持条件、通配符、表达式或脚本。
- adapter 在 inbound/outbound 节点注入前执行。Momo 预设整体替换 `inbounds`，并在 `route.rules` 中按 `action: hijack-dns` 查找后整体替换为绑定 `dns-in` 的规则。
- workspace snapshot 升级为 schema v2，旧 patches/Profile schema 与旧 GitHub 路径不属于长期兼容范围。ADR-046 的生产迁移与清理已完成；正式版运行时不保留 v1 读取或转换代码。

## ADR-046：管理员登录触发的一次性 R2 schema 升级

状态：SUPERSEDED
日期：2026-07-16

结果：生产 active workspace 与 GitHub manifest 已验证为 v2，临时迁移代码随后删除；以下内容仅保留为迁移审计记录。

- 未登录 bootstrap 只识别合法 active v1 workspace 并继续显示普通登录，不修改 R2。只有 Worker Secret 校验通过的管理员登录才允许迁移。
- 升级器校验 head、active revision identity 与 canonical content hash；随后写入 immutable v2 revision，并以 head ETag 条件更新完成原子可见切换。失败不覆盖现有 head。
- v2 revision 作为新的 root，不把不可由 v2 store 读取的 v1 revision 放入 active/previous 链；旧对象留在 R2 作为短期人工回退材料。
- 节点、模板、Profile、规则集、settings、build/SRS pointer、migration metadata 与 private GitHub credentials 保留。旧 patches 和 overrides 丢弃；有 `patchUrl` 的 Profile 映射到 Momo adapter，无 `patchUrl` 的 Profile 不增加 adapter。
- GitHub sync base 重置为 `never`，避免 v2 同步逻辑读取旧 v1 base revision。迁移请求不自动访问或写入 GitHub。
- 旧远端 Profile schema 无法校验时，同步状态固定为 conflict，只允许用户显式执行 R2 overwrite push，禁止 pull；该通用保护不解析旧 patch DSL，push 后远端受管文件自然升级为 v2。
- active workspace 已为 v2 后，临时 schema、登录接线与测试已删除；正式版不携带 v1 解析路径。

## ADR-044：确定性短订阅 Token

状态：ACCEPTED
日期：2026-07-15

- 私有配置订阅 Token 直接切换为 `s2.<22-char-tag>`，总长 25 字符；tag 是 HMAC-SHA-256 的前 128 bits。
- HMAC 输入绑定 `sing-sub:subscription-token:v2` domain、workspace ID、workspace `tokenVersion` 和 `subscription` purpose。Token 本身不携带 JSON payload、workspace 名称或版本号明文。
- 固定 `primary` workspace 允许 Worker 读取 current revision 后重算期望 tag；不需要 KV token index、随机 token 存储或额外 R2 private metadata。
- 设置页轮换继续递增 `tokenVersion`；Secret 轮换同样使旧链接失效。相同 Secret 与 claims 确定性产生相同 Token。
- 不兼容旧 `v1.payload.signature` 格式。部署该版本后所有旧私有配置链接立即失效，用户必须从 WebUI 重新复制。

## ADR-045：Beta 初始化简化目标

状态：ACCEPTED
日期：2026-07-15

- 普通用户未来从 Release 启动本地 Node CLI/薄 PowerShell 助手，由助手完成 Wrangler OAuth、account/Worker/R2/domain 选择、管理员口令输入、两个 signing secret 的本机内存生成与上传、dry-run 和显式部署。
- 部署后 WebUI 默认只以管理员口令创建空 `primary` workspace；GitHub 导入、sync 和 SRS 连接进入仓库设置，不再作为首次初始化主流程。
- 助手不得把管理员口令或 signing secret 写入仓库、命令参数、日志或非敏感 deployment manifest。
- 本 ADR 只确认 Phase 9 目标流程；本次短 Token 优化不修改现有 `handleLogin`、初始化表单或 GitHub 可选导入代码。

## ADR-027：免费额度策略

截至 2026-07-14：R2 Standard 记录的免费额度为 10 GB-month、100 万 Class A/月、1000 万 Class B/月；部署前必须重新核对官方额度与价格。

- 只使用 R2 Standard。
- 默认每 ruleset 保留 active、previous + 3 个历史 artifact。
- 默认保留 30 份 workspace snapshot。
- 逻辑 R2 使用达到 1 GB 显示提示，达到配置阈值停止非必要历史创建。
- 运维文档明确 R2 subscription 会对超额使用计费。

## 新决策模板

```text
## ADR-NNN：标题

状态：PROPOSED | ACCEPTED | SUPERSEDED
日期：YYYY-MM-DD

背景：
决策：
替代方案：
影响：
验证方式：
```
