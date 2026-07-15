# 重构工程标准

## 1. 依赖边界

- Domain 不依赖 application、HTTP、infrastructure 或 UI。
- Application 只能依赖 domain、shared contract 和 port interface。
- Infrastructure 实现 port，不得反向被 domain 导入。
- HTTP route 不得执行 SQL、生成存储 key、拼 GitHub endpoint 或 workflow payload。
- Vue feature 不得导入 Worker 文件或直接访问外部系统。
- 跨层使用明确 DTO，不传播 R2 object、ETag 或 GitHub response。
- 使用 ESLint `no-restricted-imports` 固化边界。

## 2. 主数据与发布

- R2 Standard 是唯一持久化存储；D1 不进入当前架构，现有 KV 在迁移后删除。
- 一个 workspace revision 是业务聚合根，Profile、Asset、Ruleset、Settings、Build Summary 与 Sync Metadata 一起经过 schema 校验。
- 业务保存成功只以新的 immutable revision 写入且 head conditional put 成功为准，不依赖 GitHub、Actions 或 Cache API 可用性。
- private credential、SRS binary 和 job payload 使用独立 prefix，不得混入可导出的 workspace revision。
- application 不拼 R2 key 或处理 binding；R2 object 与 ETag 只存在于 `infrastructure/r2`。
- adapter 返回领域 DTO 和判别错误，不返回原始 R2 object。

## 3. Revision 并发控制

- 每次业务修改生成新的 workspace revision ID；旧 revision 不可覆盖。
- update/delete 必须携带 expected workspace revision。
- create/rename 在完整 snapshot 上验证 workspace scoped 名称唯一。
- `head.json` 只能通过旧 ETag conditional put 更新。
- conditional put 失败返回 `RevisionConflictError`，新写入的 orphan revision 不得变为可见状态。
- 普通 save 永远不代表 force overwrite。
- 用户选择覆盖后执行独立 replace command，并记录被覆盖 revision。

## 4. R2 workspace 与 artifact

- R2 保存 workspace revision、head、private metadata、deterministic job 与不可变 SRS artifact。
- 所有 object key 由 `r2ObjectKeys.ts` 生成。
- revision/artifact 写入使用新 key；业务发布只切换 head，禁止覆盖 revision 或 active artifact。
- Workspace revision 的完整性 hash 使用 canonical JSON，但 revision body 必须保留资产 JSON 的插入顺序；不得为了 hash 稳定性把模板字段排序后再作为业务内容持久化。
- R2 bucket 保持 private，浏览器和 Actions 不持有 R2 凭据。
- 删除遵循保留策略，不得删除 head/current/previous/sync base 或 active artifact 引用的 object。
- 使用 Standard storage class；禁止使用不享受免费额度的 Infrequent Access。
- 应用跟踪逻辑 size、object count 和 retention，接近软预算时停止非必要历史快照。

## 5. 会话与缓存

- 会话使用短期 HttpOnly 签名 Cookie，不建立持久 session store。
- 私有 JSON 订阅使用 `s2.<128-bit HMAC tag>` 短 Token；签名输入绑定 domain、固定 workspace、token version 与用途，不携带 payload，不建立 KV token index。
- 订阅 Token 格式切换默认不保留旧 bearer credential 兼容；变更必须在 Release note 中明确旧链接立即失效，并验证设置页轮换和新链接复制流程。
- 公开 source ruleset 使用 `/rules/{ruleset}.json`，始终从 current revision 生成去除 `_sing_sub` 的 JSON。
- 公开 SRS 使用 `/rules/{ruleset}.srs`，仅在 active artifact 存在时提供；两者均不得携带或验证私有配置订阅 token。
- 公开 ruleset router 只接受一个安全 ruleset ID path segment；禁止实现 token parameter、token parser、token redirect 或 subscription-auth import。
- Workers Cache API 只保存可丢弃响应，key 必须包含 workspace revision。
- Cache miss、驱逐或跨 PoP 不一致不得影响正确性。
- 最终源码和 Wrangler 配置不得保留 KV binding；迁移期访问集中在 legacy adapter。
- 清理函数必须限定 workspace prefix，不允许模糊全局删除。

## 6. SRS 构建任务

- 保存 ruleset 产生确定性 immutable build job，并在同一次 workspace head 发布中记录 pending summary。
- job identity 为 `rulesetId + sourceRevision + compilerVersion`。
- HTTP 保存不等待编译；UI 独立展示数据保存和构建状态。
- dispatch 使用 `ctx.waitUntil`，失败写入 R2 job 状态；管理员通过显式 retry API 重试，默认部署不增加 Cron。
- workflow 使用版本化真实 YAML 模板，由显式 SRS enable command 自动、幂等安装或升级；普通 ruleset save 不动态修改 workflow。
- sing-box 版本和 checksum 固定；禁止运行时下载 latest。
- Action 只接收 opaque job ID，不接收私有 JSON 或存储凭据。
- Action 只能通过受认证 Worker callback 下载 source、上传 result 或报告失败。
- callback 验证 job、revision、compiler version、content length 和 SHA-256。
- stale job 标记 `superseded`，不得切换 active artifact。
- 新构建失败时保留旧 active SRS。
- SRS 下载不提供列表；非法、不存在、未编译和 artifact 缺失均返回不泄露内部状态的 404。
- SRS 响应使用 public cache 与内容 ETag，但 URL 不暴露 R2 key、source hash 或 job ID。
- 规则集 source 按公开数据处理；不得把节点私钥、PAT、Cookie、订阅 token 或其他凭据写入 ruleset。

## 7. GitHub Actions 安全

- Worker 从既有 deployment signing secret 以独立 domain label 派生 SRS ticket key；不新增 GitHub Actions Secret、Repository Variable 或用户可见长期 compiler secret。
- ticket 绑定 job ID、允许 operation、短过期时间和 HMAC signature；Action input、log、R2 revision、error 和 UI 均不得输出 ticket。
- Action 不持有 R2、Cloudflare API Token 或用户 GitHub sync PAT。
- workflow log 不打印 source、callback header、节点内容或 SRS payload。
- internal endpoint 使用独立 rate limit、body size 和 request ID。
- 轮换 `SESSION_SIGNING_SECRET` 会立即使现有 session 与未过期 SRS ticket 失效；轮换步骤写入 operations 文档。

## 8. GitHub 同步

- GitHub 是可选同步/备份介质，不是在线主存储。
- 同步只由用户主动 push/pull 触发，不在 CRUD、登录、订阅或定时任务中隐式执行。
- editable sync 使用 private repository，并在启用前验证 visibility。
- 每次同步以 R2 保存的 base、current workspace 导出的 local、GitHub 实际受管文件解析后的 remote 做整体内容摘要比较；时间戳和 GitHub manifest 都不得作为“更新者获胜”依据。
- 双方都变化时生成 conflict；禁止 last-write-wins 和自动合并。只有明确的整侧覆盖命令可以越过 conflict，且 API 必须返回受影响文件摘要。
- pull 必须先完整下载、schema 校验和 dry-run，再以 expected head ETag 发布新 workspace revision。
- push 一次生成一个 Git tree/commit，不 force push，业务 CRUD 不调用 commit 代码。
- manifest 保存 schema version、导出 workspace revision、完整文件集合和整体内容 hash；冲突检测始终读取实际文件，允许 manifest 在 IDE 编辑后落后。
- 导出 JSON 固定使用递归稳定 key 顺序、两空格缩进、LF 与单个末尾换行；纯格式变化规范化后不构成业务冲突。
- SRS 不同步到 GitHub；源数据与 compiler version 足以恢复。
- 私有数据仓库仅在用户显式启用 SRS 时执行版本固定的 compiler workflow；workflow 不 checkout、读取或提交仓库业务文件。
- SRS enable command 使用 fine-grained PAT 对已绑定仓库自动 provision workflow，并验证 Contents/Actions 权限；workflow 安装/升级与 CRUD 分离。

## 8.1 部署触发

- 维护者开发部署允许 `main` push 自动部署，并保留显式 `workflow_dispatch`；该 Action 只使用维护者自己的 Cloudflare 凭据。
- 普通 Release 用户不依赖 GitHub Actions 或 fork，通过本地部署助手显式调用 Wrangler 部署到自己的 Cloudflare 账户。
- Release 的首次初始化、日常升级和回滚必须是不同操作，不能由 main push 或发现新版本隐式完成。
- 普通用户部署不得要求 fork；维护仓库 Release Action 不能获得或代理用户 Cloudflare 凭据。
- SRS compiler 属于连接私有仓库后的可选能力，维护者与 Release 用户使用同一机制。
- `3.0.0-beta.*` 阶段允许基于真实使用反馈优化产品能力，但不得降低数据、鉴权、同步和恢复边界；部署方案、Profile target adapter、前端 Beta 收束和 P0/P1 回归全部完成前不得发布 `3.0.0`。
- 未连接 GitHub 或未配置 compiler 时，WebUI、R2 CRUD、私有 JSON 配置订阅、ruleset 编辑及公开 JSON ruleset 订阅必须完整可用。

## 9. 快照与加密

- 每个 immutable workspace revision 本身就是快照；回滚必须将旧内容发布为新 revision，不倒退 revision ID。
- R2 workspace/private metadata 依赖平台静态加密，不做逐字段加密。
- GitHub private editable tree 与 commit history 承担当前站外备份；不额外创建加密时间快照或 `BACKUP_ENCRYPTION_KEY`。
- 未来只有在 Git history 无法满足明确的独立保留需求时才通过新 ADR 设计加密快照、key 生命周期和恢复演练。
- editable sync 为保留 IDE 体验可在 private repository 中保存明文 JSON，UI 必须提示节点包含敏感数据。
- 日志、错误、metrics、Toast、workflow output 不得包含私钥、PAT、Cookie、订阅 token 或完整 JSON。

## 10. API 契约

成功响应：

```ts
interface ApiSuccess<T> {
  data: T
  meta?: Record<string, unknown>
}
```

失败响应：

```ts
interface ApiFailure {
  error: {
    code: ApiErrorCode
    details?: Record<string, string | number | boolean>
    requestId?: string
  }
}
```

- 错误码来自 `shared/contracts/errors.ts`。
- HTTP 状态表达协议语义，错误码表达产品语义。
- 用户文案由前端按错误码翻译。
- schema 失败返回 `400 VALIDATION_FAILED`，不得变成 500。
- storage limit、dispatch failure、build failure、sync conflict 分别映射。
- 所有 endpoint 返回具体类型，不允许公共 API 返回 `any`。

## 11. 输入与文件校验

- HTTP body/query、R2 workspace JSON、GitHub sync JSON 都经过 shared schema。
- TypeScript assertion 不能替代运行时校验。
- schema 输出 normalized DTO，再进入 domain/application。
- 验证嵌套 filters、rules、URL、名称、order 和 metadata。
- 远程导入保留 HTTPS、私网地址、重定向、5 MiB、UTF-8 和超时限制。
- SRS callback 使用单独二进制大小上限，不能复用 JSON parser。

## 12. 前端网络与状态

- `src/api/client.ts` 是浏览器唯一 `fetch` 调用点。
- endpoint 不触发 Toast、Dialog 或 Router。
- Pinia store 管理 session、profiles、assets、rulesets 和 sync；短期 Toast 不建立持久 notification store。
- editor draft 使用 feature composable，不直接修改父 prop。
- 保存、构建、同步采用相互独立状态机。
- AbortController 或 sequence token 用于取消/忽略陈旧请求。
- conflict 不通过递归 save 处理。
- 不实现通用 refresh/rebuild/force-refresh UI 或 API。订阅由 current revision 动态构建，revision-aware Cache API 只做加速。
- Profile 最终 JSON 保留模板字段和数组顺序；override/patch 只覆盖原位置或在没有对应字段时追加，筛选节点保持节点源顺序并在同一锚点按规则顺序稳定插入。
- 浏览器重新加载已足以读取 current R2 state；未保存草稿的多设备变化使用显式 reload/discard 确认，不以刷新按钮静默覆盖。
- GitHub pull/push、规则来源更新和 SRS retry 必须分别命名、确认并展示独立状态，不能收敛为“刷新”。

状态最少包含：

```text
save: idle/saving/saved/conflict/failed
srs: none/pending/dispatching/compiling/ready/failed/superseded
sync: never/synced/local-ahead/remote-ahead/conflict/running/failed
```

## 13. UI 组件

- 保留 Vue 3，不迁移 React。
- PrimeVue 使用实施时 npm `latest` 稳定版；禁止 RC。
- 按 v5 兼容 API 编写：`Select`、`Popover`、`Tabs`、`ToggleSwitch`、`DatePicker`。
- Button 使用 slot 组合 Lucide icon、label 和 spinner，避免计划移除的快捷 props。
- Tailwind 只负责布局、响应式和业务容器；PrimeVue 负责控件状态与交互。
- 主题只通过 preset 和少量 token 定制，不堆积 `:deep()`。
- 品牌主色为 `#F596AA`，具体视觉不是验收阻塞项。
- PrimeVue 可满足的 Button、Input、Select、Dialog、Popover、Toast、Tooltip 不得自研。
- CodeMirror、Lucide、`vuedraggable` 保留。
- 相同业务动作必须使用相同图标、组件 variant、尺寸、位置和本地化 tooltip；编辑统一使用 Pencil 语义，删除、复制、保存和关闭同理。
- 不引入通知中心缓存历史错误。瞬时结果使用 Toast，未解决错误使用业务页面内 Message，SRS/sync 长期状态由对应领域页面从服务端恢复。
- 动画优先使用 PrimeVue 原生 transition 和少量 Vue Transition，不引入独立动画库；必须尊重 `prefers-reduced-motion`。

## 14. 可访问性与响应式

- Dialog 必须有名称、focus trap、focus restore、Escape 和 body scroll 管理。
- icon-only button 必须有本地化 aria-label/tooltip。
- 表单错误使用 `aria-describedby`。
- 触控目标最小 44x44 CSS px。
- 固定格式控件保持稳定尺寸，动态文本不得推动工具栏布局。
- Playwright 在 desktop/mobile 验证遮挡、溢出、导航和弹层。

## 15. 多语言

- 使用 Vue I18n，首批 locale 为 `zh-CN`、`en-US`。
- locale 顺序：用户值、浏览器语言、`zh-CN` fallback。
- 切换同步 Vue I18n、PrimeVue locale、`document.lang` 和 localStorage。
- 词条按 `common/auth/profiles/assets/rulesets/sync/settings/errors` 组织。
- 新 key 必须同时提供两种语言；CI 检查 key 集一致。
- 日期、相对时间和数字使用 Intl/Vue I18n。
- 不翻译 commit message、路径、JSON 字段、日志和用户内容。
- 禁止新增硬编码用户可见文案。

## 16. Router、导航与页面

- 使用 Vue Router：`/connect`、`/profiles`、`/resources/nodes`、`/resources/templates`、`/resources/patches`、`/resources/rulesets`、`/sync`、`/settings/general`、`/settings/subscription`、`/settings/repository`、`/settings/about`。
- session guard 只决定访问与跳转，不执行保存或同步。
- URL 作为页面与资产类型状态来源，替代 `App.vue` tab switch。
- 桌面使用常驻侧栏；窄屏让同一侧栏 off-canvas 展开/收起，不另建第二套 Drawer 样式。侧栏移动端必须保持挂载，通过 transform/visibility 和 Vue Transition 完成进出场，关闭状态设置 `aria-hidden` 与 `pointer-events: none`。`资源` 和 `设置` 是可展开导航组，不在内容区重复一套资源切换控件。
- 资源定义为可独立命名、保存、编辑，并被 Profile 引用或公开分发的 workspace 数据；节点集、模板、补丁和规则集均属于资源。规则集因 JSON/SRS 发布与构建生命周期使用独立子路由和专属组件。
- `同步` 是独立操作页，负责 status/diff/push/pull/conflict；`设置/仓库` 只负责连接、更换 PAT、断开仓库、默认分支和 SRS 全局开关。
- 设置分为 `通用`、`订阅`、`仓库`、`关于`；退出登录位于侧栏底部，不创建账户设置分类。
- 顶栏只显示一次当前路由标题，内容区不得重复同名 H1/H2 和说明性副标题。
- Profile 保留列表/卡片打开 Dialog 的交互。编辑使用结构化表单，预览从当前未保存 draft 实时生成最终 JSON；切换模式不丢弃 draft，保存只属于编辑模式。
- Profile 的模板选择只引用 workspace 内的模板资产；编辑器、schema、预览构建和模板 API 均不得接受外部 URL。未来若重新支持必须在模板资源页建立独立导入流程，并通过新的 ADR 重新启用。
- 节点集、模板和补丁不保留无价值的只读 JSON/编辑切换；CodeMirror 直接承担编辑与校验。规则集页面按需展示公开 JSON/SRS、构建状态和编辑入口。

## 17. 错误与可观测性

- 领域错误为可判别类型，不依赖字符串比较。
- 只在 HTTP error boundary 映射 error -> status/code。
- 每个请求生成 request ID，并通过 `X-Request-ID` 返回；SRS job 与 sync job 使用独立 job ID。
- 日志字段化：operation、requestId、workspace、entity、revision、status、duration、attempt；path 中的订阅 token、job id 等敏感参数必须参数化，禁止记录 Cookie、Authorization、PAT、ticket、完整 body 或私有 JSON。
- expected conflict 记录为 info/warn，不作为未知 500。
- 监控 R2 bytes/operations、head conflict、orphan count、build latency 和 sync failures。

## 18. 测试标准

### Unit

- domain build/merge/filter、revision、SRS job 状态机、sync manifest/diff、schema、错误映射、i18n key。

### Integration

- R2 workspace create/update/rename/delete、head ETag CAS、restore、retention 和 missing object。
- Signed Cookie/HMAC token roundtrip、到期、auth version 与篡改失败。
- Cache API revision key 与驱逐后重建。
- SRS dispatch/callback/superseded/failure/idempotency。
- GitHub push/pull/no-op/local-only/remote-only/conflict/delete。
- Worker route 认证、schema、status 和 error code。

### E2E

- 登录、Profile/Asset/Ruleset CRUD、revision conflict、预览和订阅。
- SRS pending/ready/failed 状态。
- GitHub 主动 push/pull/conflict。
- 中英文切换与刷新保持。
- desktop/mobile 导航、Dialog 和工具栏。

每个 bug 修复前先添加复现测试；不能自动化时记录原因和替代验证。

## 19. CI、免费额度与依赖

目标脚本：

```text
npm run lint
npm run typecheck:web
npm run typecheck:worker
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
npm run worker:dry-run
npm run verify
```

- `verify` 至少包含 lint、两个 typecheck、unit、integration 和 build。
- PR required check 不得只运行 Vite build。
- 依赖使用稳定版并提交 lockfile。
- 不引入 Cloudflare Containers。
- R2 资源启用前记录 Free plan 上限、subscription 要求与超额计费风险。
- 应用提供 retention、软预算和用量提示，避免非必要 R2 历史无限增长。
- 新依赖必须替代明确自研成本或提供必要测试能力。
- 格式化限制在触及文件，不制造全仓噪音。
