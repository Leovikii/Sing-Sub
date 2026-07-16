# GitHub 可编辑同步

GitHub 是可选的站外备份和 IDE 编辑介质，R2 `primary` workspace 始终是在线唯一真相来源。未连接 GitHub 时，登录、CRUD、配置订阅、ruleset JSON 和未启用 SRS 的全部功能保持可用。

## 受管范围

Worker 只管理以下路径：

```text
sing-sub/configs/*.json
sing-sub/nodes/*.json
sing-sub/templates/*.json
sing-sub/adapters/*.json
sing-sub/rulesets/*.json
sing-sub/manifest.json
```

replacement adapter 直接切换后，editable-sync manifest 使用 schema v2，只接受 `adapters` 路径；旧含 `patches` 的 manifest/tree 不兼容。

`.github/workflows/compile-srs.yml` 只由 SRS provisioner 管理。README、源码、其他 workflow 和任意非受管路径在同步 push 中通过 Git base tree 原样保留。SRS 二进制、build/job 状态、PAT、Cookie、订阅 Token 和短期 ticket 不进入同步树。

业务 JSON 使用递归稳定 key 顺序、两空格缩进、LF 和单个末尾换行。远端文件在比较前先解析并重新规范化，因此只修改缩进或 key 顺序不会产生业务冲突。

## 连接与权限

`PUT /api/github-sync/connection` 接受 private repository 的 owner、repo 和 fine-grained PAT。Worker 会验证仓库为 private、未 archived/disabled，并确认 token 具有 Contents 读写能力。连接信息保存在 R2 private metadata，API 不返回 PAT。

仅使用可编辑同步时需要：

- Metadata：read-only，GitHub 自动授予。
- Contents：read and write。

额外启用 SRS 时还需要 Workflows 与 Actions 的 read and write。同步连接不会自动启用 SRS；SRS 开关继续使用独立 `/api/srs-compiler` 命令。

`DELETE /api/github-sync/connection` 停止后续 GitHub 访问并禁用 SRS dispatch，但不会删除 R2 数据、GitHub 文件、历史 commit 或已安装 workflow。

## 状态与方向

`GET /api/github-sync` 每次读取 GitHub 当前 branch 和实际受管文件，返回：

- `never`：没有适用于当前仓库的同步基准。
- `synced`：R2 与 GitHub 内容一致。
- `local-ahead`：只有 R2 相对基准变化。
- `remote-ahead`：只有 GitHub 相对基准变化。
- `conflict`：两边相对基准都变化且内容不同。

响应同时提供 local/remote/base revision、内容摘要、文件级 added/modified/deleted、`canPush`、`canPull` 和 `requiresResolution`。时间仅用于审计，不决定哪边覆盖哪边。

普通命令：

```text
POST /api/github-sync/push { expectedRevision, resolution: "safe" }
POST /api/github-sync/pull { expectedRevision, resolution: "safe" }
```

首次内容不同、方向相反或双方变化时返回 `409 SYNC_CONFLICT`。用户检查 diff 后才可提交同一命令并使用 `resolution: "overwrite"`：push 表示 R2 整体覆盖 GitHub 受管树，pull 表示 GitHub 整体覆盖 R2 业务数据。第一版不做逐文件或 JSON 字段级自动合并。

## 原子性与恢复

- Push 重新读取 remote head，创建一次 Git tree 和最多一个 commit，再以 `force: false` 更新 branch ref。远端并发变化返回冲突；可能产生的未引用 Git object 由 GitHub 回收，不进入分支历史。
- Pull 固定一个 remote commit，完整下载并校验路径、UTF-8、数量、大小、JSON schema、文件名和引用后，才以 expected R2 revision 发布完整 workspace。验证失败不会产生部分可见数据。
- Push 覆盖后可从 Git commit history 恢复；Pull 覆盖前的 R2 revision 仍在 retention 历史中，sync base revision 始终受保护。
- 空 private repository 可由首次 overwrite push 直接建立默认分支，不要求用户先手工创建 README commit。
- bucket/account 级恢复先用管理员口令创建空 workspace，再在仓库设置中连接 private repository 并执行显式 pull。pull 固定 remote commit、执行同一结构校验，并把新的 R2 revision 与 GitHub commit 登记为 sync base。

Pull 改变 ruleset source 且 SRS 已启用时，会调用既有 reconcile/dispatch 流程。同步成功不依赖编译成功；编译补建失败通过 `SRS_RECONCILE_FAILED` warning 暴露，JSON ruleset 与已拉取的 R2 数据仍保持有效。

## API 清单

```text
GET    /api/github-sync
PUT    /api/github-sync/connection
DELETE /api/github-sync/connection
POST   /api/github-sync/push
POST   /api/github-sync/pull
```

所有接口要求管理员 signed Cookie。Phase 5 已提供 typed API client；PrimeVue 页面和双语文案在 Phase 6/7 接入，不在后端阶段临时扩展旧 UI。
