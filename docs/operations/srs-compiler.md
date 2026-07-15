# 可选 SRS 编译器

SRS 编译只面向已连接私有 GitHub 仓库并明确启用该能力的部署。未启用时，规则集编辑和 `/rules/{ruleset}.json` 公开订阅保持完整；不会创建 build job 或访问 GitHub Actions。

## 数据与执行边界

```text
R2 current ruleset source
  -> Worker deterministic job
  -> connected private repository workflow_dispatch
  -> temporary GitHub-hosted runner
  -> authenticated Worker callback
  -> immutable R2 SRS artifact
```

- R2 是规则集源和 active SRS 的唯一在线持久化存储。
- 私有仓库只承载 workflow；Action 不 checkout、读取、提交或永久保存仓库业务数据。
- Action 不持有 R2 credential 或 Cloudflare API Token。
- `/rules/{ruleset}.json` 始终可用；`/rules/{ruleset}.srs` 只有 active artifact 存在时可用。

## 自动启用

SRS 启用不是首次部署、GitHub connect 或 sync enable 的必填步骤。用户可先只使用 R2 + JSON ruleset，随后通过 authenticated `GET/PUT /api/srs-compiler` 显式读取或修改状态。PrimeVue WebUI 开关在 Phase 6/7 接入同一 typed API。

Worker 自动执行以下 provisioning：

1. 验证仓库私有可见性与 PAT 的 Contents 写权限；workflow 写入和 dispatch 请求分别由 GitHub API 实际验证 Workflows/Actions 权限；
2. 对 `templates/github/compile-srs.yml` 做 hash 比较，并在需要时一次性写入或升级私有仓库 workflow；
3. 记录 provision/status，扫描 current ruleset，为没有 current SRS 或 source 已改变的规则集创建确定性 job；
4. 为每个 dispatch 签发短期 job ticket，有限并发触发 Action；
5. Action 用 ticket 拉 source、回传结果，Worker 验证后写入 R2。

不需要用户在 GitHub 网页创建 workflow、Actions Secret 或 Variable，也不需要为 SRS 新增 Worker Secret。PAT 不离开 R2 private metadata；浏览器不接收 PAT 或 ticket。

当前 API：

- `GET /api/srs-compiler`：返回 connected/enabled/status、仓库坐标和 workflow hash，不返回 PAT。
- `PUT /api/srs-compiler` body `{"enabled":true}`：自动 provision、扫描规则集，并在响应后通过 `waitUntil()` 有限并发 dispatch。
- `PUT /api/srs-compiler` body `{"enabled":false}`：停止创建和 dispatch 新 job；不访问 GitHub，也不自动删除已安装 workflow 或现有 artifact。

## Ticket 边界

- ticket 包含指定 job、允许 operation 与短过期时间，由 Worker 从既有 deployment signing secret 派生的独立 key 签发。
- ticket 只允许该 Action run 对其 job 执行 source/complete/failed callback，不能访问配置订阅、节点、PAT、R2 或其他 job。
- Action input 和 workflow log 不得打印 ticket；ticket 不进入 R2 revision、GitHub commit、UI 或错误响应。
- 过期、job 不匹配、状态不匹配、已 superseded 或内容校验失败的 callback 均不会激活 artifact。

## 验证

- `/rules/{ruleset}.json` 返回 `application/json`，内容只有 `version` 与 `rules`，不包含 `_sing_sub`。
- workflow input 只有 opaque `job_id`、Worker origin 和短期 ticket，不包含规则集 JSON、PAT、R2 key 或长期 credential。
- workflow 不产生 commit；runner 结束后不保存 source/output。
- `/rules/{ruleset}.srs` 成功后返回 `application/octet-stream`、public cache 和内容 ETag。
- 重复 callback 不创建重复 workspace revision；旧 job callback 变为 `superseded`。
- 新构建失败时旧 active SRS 继续可用，管理员可通过 build retry API 显式重试。

## 停用与升级

- 关闭 WebUI SRS 开关后，新的 ruleset save 自动退回 JSON-only，不创建 job；现有 active SRS 可按保留策略继续分发或被显式删除。
- 模板升级由下次显式 enable/upgrade command 比较 hash 后自动完成；无变化不创建 commit。
- 私有仓库 workflow 可以保留为闲置模板或被显式移除，均不影响 R2 source data。

## 旧 URL 迁移

- 公开规则集只接受 `/rules/{ruleset}.json` 与 `/rules/{ruleset}.srs`；旧 `/rules/{token}/{ruleset}.*` 始终返回 404。
- 订阅和 WebUI 预览在共享 workspace 构建边界遍历 JSON，将同一部署 origin 的旧 tokenized URL 规范化为无 Token URL。
- 已经是新格式的 URL和外部域名 URL 保持原样；旧 token 不会进入新订阅响应或新 cache variant。
