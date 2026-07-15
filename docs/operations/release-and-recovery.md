# Phase 8 发布与恢复说明

对应预发布版本：`v3.0.0-beta.1`。

## 兼容范围

- Worker `compatibility_date` 为 `2026-07-15`。
- 运行时只需要 `WORKSPACE_BUCKET` R2 binding 和三个 Worker secrets。
- Workers observability 与 Turnstile 暂不启用。
- Profile 外部 HTTP/HTTPS 模板是明确移除的兼容项；旧数据必须先把模板导入 `sing-sub/templates/` 并更新 Profile 引用，不能依赖旧 URL 读取旁路。
- 私有配置订阅 Token 已直接切换为 `s2.<22-char-tag>`；旧 `v1.payload.signature` 链接不兼容，部署后必须从 WebUI 重新复制订阅链接。
- replacement adapter 使用 workspace schema v2；生产切换已完成，当前 Worker 只读取 v2，不再包含登录时 v1 识别或转换代码。
- 规则集公开 URL 导入不受上述变化影响，仍使用独立的 SSRF、大小、重定向和超时限制。

## 发布前检查

```powershell
npm ci
npm run verify
npm run worker:dry-run
npx wrangler whoami
npx wrangler r2 bucket info sing-sub-data
```

`worker:dry-run` 必须只显示 `WORKSPACE_BUCKET -> sing-sub-data`。只读检查不得列出或下载私有对象。生产部署仍是独立、显式操作，不属于检查命令。

## Workspace schema 基线

- 当前运行时仅支持 workspace schema v2；v1→v2 生产迁移已于 Beta 阶段完成，临时迁移器已从源码删除。
- `workspaces/primary/head.json` 仍使用 head schema v1，这是只包含 revision 指针与 content hash 的独立文档契约；active `revisions/{currentRevision}.json` 才是 workspace schema v2。GitHub sync manifest v2 与 adapter schema v1 也分别独立版本化，不得用其中一个推断另一个。
- 不得把历史 v1 revision 直接设为 head 或交给 v2 restore；旧部署升级必须使用对应 Release 的离线迁移工具，或备份业务文件后重新初始化。
- GitHub 远端受管文件 schema 无效时，状态固定为 conflict；只允许用户显式使用 R2 overwrite push 修复，pull 继续拒绝无效数据。该保护不解析旧 patch 或其他历史 DSL。

## 数据恢复

Workspace revision 是 immutable snapshot。恢复旧 revision 时必须把旧内容发布为一个新的 revision，并使用当前 head 作为 `expectedRevision`；禁止把 head 直接倒退到旧 revision ID。

恢复后应确认：

- current revision 是新 revision；
- `previousRevisionId` 指向恢复前的 current revision；
- 目标旧 revision 和恢复前 revision 仍可读取；
- Profile、资产、sync metadata 和 SRS `activeArtifact` 指针来自选定旧 revision；
- stale `expectedRevision` 被 CAS 拒绝，且不会产生可见的新 revision。

SRS 二进制 artifact 本身是 immutable R2 object。workspace 恢复只切换 pointer；如果目标 artifact 已被 retention 删除，应先从 GitHub/外部备份重新编译，而不是伪造 pointer。

GitHub 站外恢复使用显式 pull，并先显示 diff、校验 schema/name/reference，再以单个新 R2 revision 发布。测试和演练使用 fixture；不得用恢复演练覆盖真实私有仓库。

## 代码回滚

Worker 代码回滚与 R2 数据恢复是两个独立动作：

1. 代码问题使用 Cloudflare Worker version rollback，或重新部署已验证的旧 Release。
2. 只有业务数据确实错误时才执行 workspace revision restore。
3. 不删除 R2 bucket，不清空 revision history，不使用 GitHub 强制推送模拟数据回滚。
4. 回滚后检查登录、Profile 预览、私有订阅、公开规则集和可选 GitHub sync。

## 安全与剩余风险

- 每个请求返回 `X-Request-ID`；日志只记录结构化白名单字段，并参数化订阅 token 与 job ID 路径。
- 不记录 Cookie、Authorization、PAT、ticket、请求体或完整私有 JSON。
- 登录当前依赖高强度管理员口令、签名 Cookie 和 Cloudflare 边缘防护。Turnstile/专用 Rate Limiting 规则未纳入本阶段；若公开域名出现持续撞库或异常流量，再作为独立运维增强启用。
- R2 默认 retention/budget 保持现状：30 个 workspace revision、active/previous 与最近 3 个历史 SRS artifact、orphan 至少 24 小时、1 GiB warning、8 GiB history-paused。
