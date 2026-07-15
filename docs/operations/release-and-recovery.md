# Phase 8 发布与恢复说明

对应预发布版本：`v3.0.0-beta.1`。

## 兼容范围

- Worker `compatibility_date` 为 `2026-07-15`。
- 运行时只需要 `WORKSPACE_BUCKET` R2 binding 和三个 Worker secrets。
- Workers observability 与 Turnstile 暂不启用。
- Profile 外部 HTTP/HTTPS 模板是明确移除的兼容项；旧数据必须先把模板导入 `sing-sub/templates/` 并更新 Profile 引用，不能依赖旧 URL 读取旁路。
- 私有配置订阅 Token 已直接切换为 `s2.<22-char-tag>`；旧 `v1.payload.signature` 链接不兼容，部署后必须从 WebUI 重新复制订阅链接。
- replacement adapter 将 workspace 切换为 schema v2。当前 Beta 临时包含一次性 v1 升级器：部署后首次使用正确管理员口令登录时，Worker 校验 active v1 revision/hash，再以 R2 ETag/CAS 发布新的 v2 root revision。错误口令、bootstrap 和普通读取均不触发写入；v2 workspace 上该逻辑自动 no-op。
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

## Schema v1 到 v2 临时升级

1. 不清空或删除 `sing-sub-data` bucket；先确认 GitHub/本地仍有当前业务文件备份。
2. 合并并等待生产 deploy Action 成功。部署完成前不要登录 WebUI。
3. 打开生产 WebUI，使用现有管理员口令登录一次。首次正确登录会同步完成 R2 schema v1 到 v2 升级。
4. 确认 Profile、节点、模板、规则集、订阅、GitHub 连接与已有 SRS 均可读取；曾引用任意旧 patch 的 Profile 会改为引用 `sing-sub/adapters/momo.json`，未引用 patch 的 Profile 不增加 adapter。
5. 旧 `assets.patches` 与 `profile.overrides` 不迁移；Momo adapter 由预设重新创建。GitHub sync base 重置为 `never`，登录迁移本身不写 GitHub。
6. 如果同步页把旧 GitHub tree 标记为冲突，只允许确认“R2 覆盖 GitHub”；旧格式 remote 禁止 pull。覆盖 push 会写入 v2 Profile/adapter/manifest。`sing-sub/patches/` 已退出受管范围，部署者随后在私有仓库手工删除该旧目录。
7. 当前 v1 revision 对象保留在 R2，但不进入新的 active/previous revision 链；不要尝试用 v2 Worker 直接 restore 该对象。
8. 生产验证通过后删除 `r2-workspace-v1-upgrade.ts`、登录接线和对应临时测试，并重新运行完整发布门禁。代码无法修改自身，但 workspace 已是 v2 时升级器不会再次写入。

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
