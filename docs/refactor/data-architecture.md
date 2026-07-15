# R2-only 数据架构

## 最终结论

```text
R2 Standard       唯一持久化存储
Workers Cache API 可丢弃的订阅 JSON 与 SRS 响应缓存
Signed Cookie     浏览器会话，不建立持久 session store
GitHub Actions    无状态官方 sing-box 编译器
GitHub private    可选双向同步与站外备份
```

D1 不进入当前架构。KV binding 已在 R2 主存储切换验证后删除。GitHub 不参与初始化默认路径或日常 Profile、Asset、Ruleset CRUD，也不在保存或编译路径中创建 commit。

采用 R2-only 的前提是当前产品边界保持不变：每个 Worker 部署一个管理员和一个 `primary` workspace、workspace 约 2-3 MiB、SRS 通常小于 1 MiB、没有服务端复杂查询和分页需求。若未来出现多人协作、高频局部写入或关系查询，再通过新 ADR 与 port 引入身份索引/D1 metadata adapter，不提前承担该成本。

## 数据聚合

一个 workspace 是唯一业务聚合根。完整 revision 包含：

```ts
interface WorkspaceSnapshot {
  schemaVersion: number
  workspaceId: string
  revisionId: string
  createdAt: string
  previousRevisionId: string | null
  settings: WorkspaceSettings
  profiles: Profile[]
  assets: {
    nodes: Record<string, JsonAsset>
    templates: Record<string, JsonAsset>
    patches: Record<string, JsonAsset>
    rulesets: Record<string, RulesetAsset>
  }
  builds: Record<string, BuildSummary>
  sync: SyncMetadata
}
```

- 普通业务数据进入 immutable revision。
- GitHub PAT、短期 job ticket 等敏感动态配置不得进入 revision、快照导出或 GitHub manifest。
- SRS 二进制不嵌入 workspace JSON，只保存 artifact descriptor。
- `schemaVersion` 必须由 shared schema 校验；读取旧版本通过显式 migration 升级。
- workspace 之外不维护需要事务同步的业务索引。

## R2 对象布局

```text
workspaces/{workspaceId}/head.json
workspaces/{workspaceId}/revisions/{revisionId}.json
workspaces/{workspaceId}/private/credentials.json
workspaces/{workspaceId}/jobs/{jobId}.json
workspaces/{workspaceId}/artifacts/srs/{rulesetId}/{sourceHash}.srs
```

规则：

- 所有 key 只能由 `r2ObjectKeys.ts` 生成。
- revision、job source 和 artifact 使用不可变 key，不得覆盖。
- `head.json` 是唯一可变业务指针，内容包含 current、previous、schemaVersion、updatedAt 和 workspace hash。
- bucket 必须 private；浏览器、GitHub Actions 和用户数据仓库不持有 R2 凭据。
- private metadata 使用独立 prefix，永不进入 workspace export。
- 使用 R2 Standard；禁止 Infrequent Access。

## Revision 发布协议

所有业务修改都通过 `WorkspaceStore.publish()`：

1. 读取 `head.json` 和对象 ETag。
2. 读取并校验 current revision。
3. application 在内存中执行 command，产生完整 normalized snapshot。
4. 生成 ULID/UUID revision ID 与 SHA-256 workspace hash。
5. 以不可变 key 写入新 revision；若 key 已存在则失败。
6. 使用旧 head ETag 执行 conditional put 更新 `head.json`。
7. conditional put 失败返回 `409 REVISION_CONFLICT`，不得重试为覆盖写。
8. head 失败留下的 orphan revision 不可见，由定时清理任务回收。

head 切换是业务保存成功的唯一判断。GitHub、Actions、Cache API 或后续异步构建失败不得回滚已经发布的 workspace revision。

```ts
interface WorkspaceStore {
  read(workspaceId: string): Promise<WorkspaceRead>
  readRevision(workspaceId: string, revisionId: string): Promise<WorkspaceSnapshot>
  publish(command: PublishWorkspaceCommand): Promise<PublishWorkspaceResult>
  listRevisions(workspaceId: string, limit: number): Promise<RevisionSummary[]>
  restore(workspaceId: string, revisionId: string, expectedRevision: string): Promise<PublishWorkspaceResult>
}
```

HTTP route 只能调用 application use case，不得直接读取 R2、拼 key 或处理 ETag。

## CRUD 与读取模型

- bootstrap 读取一次完整 current revision，返回 settings、profiles、assets 摘要与状态。
- Profile/Asset/Ruleset create/update/rename/delete 都在 current snapshot 副本上完成，再发布完整 revision。
- 前端编辑使用本地 draft；保存携带 expected revision。
- 重命名在同一 snapshot command 中验证旧名称存在且新名称不存在。
- 删除为新 revision 中移除实体，不直接删除旧 revision 内的数据。
- 订阅 JSON 由 current revision 在请求时拼装，不产生持久化最终配置；以 `workspaceId + revisionId + profileId` 作为 Cache API key。
- 保存任意 profile、节点、模板或 patch 都发布新 revision，因此下一次订阅自动绕过旧 response cache，无需 rebuild、flush 或用户刷新按钮。
- Profile 模板必须来自 workspace revision 内的模板资产；HTTP 外部模板不再支持，因此预览与订阅都具有明确的 revision 信号。
- Cache API miss、驱逐或跨 PoP 不一致不影响正确性；禁止建立新的 KV 缓存。

当前 2-3 MiB workspace 与低频写入适合整体 revision。若单 workspace 增长到 32 MiB、保存频率显著上升或读取必须分页，触发架构复审，不在当前版本实现分块数据库。

## 会话与订阅 token

- 每个 Worker 部署固定使用 workspace ID `primary`，不存在用户或 workspace lookup index。
- 管理员口令保存在 Worker secret，仅用于签发 session；同一管理员可持有多个设备 session。
- 浏览器使用 HttpOnly、Secure、SameSite=Lax 的签名 Cookie。
- Cookie 只携带不可猜测 workspace ID、到期时间和 auth version，不保存 GitHub PAT。
- Worker 使用独立 secret 验证 HMAC；无效或过期 Cookie 返回 `NOT_AUTHENTICATED`。
- logout 清除 Cookie；基础安全策略接受已泄露 Cookie 在短有效期内无法中心化撤销。
- 需要全局失效时递增 workspace `authVersion`。
- 订阅链接使用 HMAC 签名 payload，包含 workspace ID、token version 和用途，不建立 KV token index。
- GitHub sync credential 单独保存于 `private/credentials.json`，依赖 R2 平台静态加密，不做逐字段加密。

## 初始化

- 空 R2 默认使用管理员口令创建空的 `primary` workspace，不要求 GitHub 仓库或 PAT。
- 新 workspace 的首个 revision 包含空 Profile/Asset/build 集合，订阅 Token 由 HMAC 自动签发。
- “从 GitHub 导入”是可选初始化分支；只有选择该分支才读取仓库并创建 private GitHub credentials。
- 初始化完成后，GitHub 可在 sync 设置中连接或断开，不影响 R2 数据、登录、CRUD 或订阅。
- workspace 已存在时，任何设备登录都只提交管理员口令。

## Ruleset JSON 与 SRS 发布

规则集始终提供公开 source URL `/rules/{rulesetId}.json`。Worker 从 current `primary` workspace revision 读取编辑源，移除 `_sing_sub`，只输出 sing-box `version` 与 `rules`。该路径不依赖 GitHub、build job 或私有配置订阅 Token。

SRS 是可选公开派生产物，下载别名为 `/rules/{rulesetId}.srs`。只有 active artifact pointer 存在时提供。R2 bucket 保持 private，只有 Worker 响应公开。规则集名称可枚举是公开模型的既定结果，但 API 不提供列表；JSON 缺失和 SRS 缺失均使用不泄露内部状态的 404。

公开 router 只接受 `/rules/{rulesetId}.json` 与 `/rules/{rulesetId}.srs` 两种单段路径；它没有 token parameter、没有 token parser，也不会调用订阅认证服务。额外 path segment 一律 404。

job identity：

```text
workspaceId + rulesetId + sourceHash + compilerVersion
```

未启用 SRS 时，保存规则集只发布 workspace revision，build summary 为 `none`，不会创建 job。用户连接 private GitHub repository 后，可显式开启 SRS；Worker 验证 PAT 权限、幂等安装模板、记录 enablement status，并扫描 current ruleset 补建缺失/过期 job。上述 provision 失败时保持 JSON-only，不影响 CRUD 或同步。

启用成功后的保存流程：

1. command 更新 ruleset source，并在新 workspace revision 中写入 `pending` build summary。
2. 在切换 head 前写入确定性 immutable job descriptor；head 冲突时该 job 成为可清理 orphan。
3. head 发布成功后通过 `ctx.waitUntil` dispatch `workflow_dispatch`。
4. dispatch 失败更新 job 状态；管理员可通过 authenticated retry API 显式重试。默认部署不配置 Cron。

Action 协议：

1. workflow 安装在当前部署所连接的私有仓库；维护者与其他用户没有不同分支。
2. Worker 从既有 signing secret 派生 SRS ticket key，签发短期 job-scoped ticket；不配置 GitHub Actions Secret/Variable。
3. Action 输入只含 opaque job ID、Worker HTTPS origin 和 ticket；ticket 不含 source、PAT、R2 key 或长期 credential。
4. Action 使用 ticket 从 Worker internal endpoint 获取 source，固定版本与 checksum 的官方 sing-box 编译 JSON 为 SRS。
5. Action 通过同一 ticket callback 上传二进制或报告失败；Worker 验证 job、允许操作、过期时间和签名。
6. Action 不持有 R2、Cloudflare API Token 或用户 GitHub PAT，不 checkout 或 commit 私有仓库内容。

callback 发布：

1. Worker 验证 job、sourceHash、compilerVersion、content length 与 SHA-256。
2. 写入 immutable SRS artifact key。
3. 重新读取 current workspace；只有 ruleset sourceHash 仍匹配时才合并 artifact pointer。
4. 使用 head ETag 发布新 revision；冲突时基于最新 head 有限重试合并，不得覆盖其他业务修改。
5. source 已变化则 job 标记 `superseded`，artifact 不激活。
6. 构建失败保留旧 active artifact。

## GitHub 双向同步

GitHub 只存在于 `GithubSyncGateway`，commit 代码不得被普通 CRUD 或编译流程导入。

同步使用三个整体业务内容摘要：`B` 是 R2 中上次成功同步的 base content hash，`L` 是 current workspace 导出的 local content hash，`G` 是 GitHub 当前受管文件实际解析、规范化后的 remote content hash。时间戳只用于展示和审计，不参与覆盖判断。R2 同时保留 base workspace revision 和 base GitHub commit；GitHub `sing-sub/manifest.json` 只描述最近一次 Worker 导出，用户从 IDE 修改文件后可以自然落后，不能把 manifest 当作远端真相。

状态矩阵：

```text
L = B, G = B  -> synced
L != B, G = B -> local-ahead，允许普通 push
L = B, G != B -> remote-ahead，允许普通 pull
L = G         -> 内容已一致，更新 sync base 即可
其他          -> conflict，普通 push/pull 均阻止
```

首次同步没有 `B`，普通同步不会静默选择赢家；调用方必须明确选择 R2 或 GitHub。冲突时第一版不自动逐文件合并，只允许经过确认的整侧覆盖。预检仍基于 base revision 生成逐文件新增、修改、删除列表，供 UI 准确展示影响，也为未来升级合并器保留数据基础。

### Push

1. 读取并校验 expected current workspace revision，转换为稳定路径和两空格缩进、LF、末尾换行的 canonical pretty JSON。
2. 下载 GitHub 当前受管文件并计算 `B/L/G`；远端已变化时阻止普通 push。
3. 内容已一致时不创建 Git commit，只更新 R2 sync base。
4. 允许推送时生成 manifest，并使用一次 Git tree/commit 替换完整受管树；不 force push，受管目录外文件保持不变。
5. GitHub head 更新成功后发布新的 workspace revision，记录 base workspace revision、base GitHub commit 与 base content hash。

### Pull

1. 下载 GitHub 当前 commit 的实际受管文件集合；manifest 可校验但不决定文件存在性或新旧。
2. 校验 private repository、路径、数量、大小、UTF-8、JSON schema、文件名和内部引用，再规范化内容并计算 `B/L/G`。
3. local 已变化时阻止普通 pull；双方变化时返回整体 conflict，不自动 last-write-wins。
4. 允许拉取时将完整 remote 状态转换为新 workspace snapshot；删除由远端完整树中缺失文件表达。
5. 使用 expected workspace revision 发布；并发变化返回 conflict，远端不会造成部分 R2 数据可见。
6. 若 ruleset source 变化且 SRS 已启用，发布后通过既有 reconcile 流程补建和 dispatch 派生构建。

SRS artifact、build/job 状态、private credential、Cookie、subscription token 和短期 job ticket 不进入 GitHub。editable sync 可在 private repository 保存明文业务 JSON 以保留 IDE 体验。当前不额外创建加密时间快照；R2 revision 和 Git commit 分别承担站内与站外版本历史。

## 现有数据迁移

以下流程是旧 GitHub + KV 生产部署迁入 R2 的一次性历史流程，不是新 Release 部署的默认初始化要求。

```text
freeze legacy writes
-> export current GitHub files and KV settings
-> schema validation and dry-run report
-> create workspace ID and private credentials
-> write first immutable R2 revision
-> conditional create head.json
-> verify bootstrap/subscription/ruleset
-> switch routes to WorkspaceStore
-> remove legacy GitHub CRUD and KV binding
```

- 导入失败不得创建 head，因此不会出现半迁移可见状态。
- migration record 写入首个 revision metadata，包含 source repo、branch、commit SHA 和时间。
- 不实现长期 GitHub/R2 双写。
- 切换前保留 GitHub commit 作为站外回滚点。

## 保留、预算与恢复

默认策略：

- workspace 保留最近 30 个 revision，并始终保留 current、previous 与 sync base。
- 每个 ruleset 保留 active、previous 和最近 3 个历史 artifact。
- orphan revision/job/artifact 至少等待 24 小时再清理。
- 清理前重新读取 head 与 current revision，禁止删除仍被引用的对象。
- 逻辑使用达到 1 GiB 提示，达到配置硬阈值停止非必要历史创建，不阻止业务保存。

截至 2026-07-14，R2 Standard 免费额度记录为 10 GB-month、100 万 Class A/月、1000 万 Class B/月且 egress 免费；额度与价格在部署前重新核对。R2 需要启用 subscription，超额会按量计费。

恢复顺序：

1. head 正常时通过 `restore()` 将旧 revision 发布为新的 current revision。
2. head 丢失或损坏时列出有限 revision，校验 hash 与 previous chain 后重建 head。
3. bucket/account 级丢失依赖 GitHub 站外备份；R2 内 revision 不能替代异地备份。
4. 恢复演练必须覆盖 current、previous、SRS artifact 与 GitHub import。

## 明确不做

- 不创建 D1 database、migration 或 SQL repository。
- 不把 KV 作为 session、token index 或缓存长期保留。
- 不实现 R2 对象与 GitHub 的实时双主复制。
- 不让 Action 直接访问 R2。
- 不为未来查询提前拆分 workspace 为大量对象或关系表。
- 不使用 Cloudflare Containers、Queues 或 Durable Objects。
