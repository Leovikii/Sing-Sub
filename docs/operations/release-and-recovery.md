# Cloudflare 部署、更新与恢复

对应预发布版本：`v3.0.0-beta.1`。

## 兼容范围

- Worker `compatibility_date` 为 `2026-07-15`。
- 运行时只需要 `WORKSPACE_BUCKET` R2 binding 和 `ADMIN_PASSWORD`、`SESSION_SIGNING_SECRET`、`SUBSCRIPTION_SIGNING_SECRET`。
- Workers observability 与 Turnstile 暂不启用。
- 当前运行时只读取 workspace schema v2；`workspaces/primary/head.json` 使用独立 head schema v1，GitHub sync manifest v2 与 adapter schema v1 也分别版本化。
- 私有配置订阅 Token 为 `s2.<22-char-tag>`；旧格式不兼容。
- 规则集公开 JSON/SRS URL、GitHub editable sync 与 SRS compiler 均不属于网站部署初始化。

## 新用户从零部署

前提：Node.js 22 由 Cloudflare 构建环境提供；用户只需 Cloudflare 与 GitHub 账户，并在 Cloudflare 中启用 R2 subscription。

1. Fork 官方 Sing-Sub 仓库。
2. 在 Cloudflare `Workers & Pages` 中创建 Worker 或打开目标 Worker，进入 `Settings > Builds` 并连接 GitHub。
3. 选择自己的 fork，生产分支 `main`，关闭非生产分支构建。
4. Build command：`npm run build`。
5. Deploy command：`npm run deploy:cloudflare`。
6. 根目录留空；API Token 选择 Cloudflare 自动创建。
7. 在 Build variables 中新增 `SING_SUB_ADMIN_PASSWORD`，输入至少 12 bytes 的管理员口令并点击“加密”。不得使用示例值或把口令截图、写入仓库。
8. 连接并等待 Build 成功。初始化器自动创建/复用 `sing-sub-data`、生成两个 signing secrets，并部署 Worker。
9. 打开 `<worker>.<account>.workers.dev`，用相同管理员口令登录；首次登录只创建空 workspace 和内置 Momo adapter。
10. 首次成功后可删除 Build Secret；后续部署只保留 runtime secrets。

首次部署不需要手动创建 bucket、Cloudflare API Token、Account ID、GitHub Actions Secret、signing secret、数据仓库或 PAT。

## 维护者生产切换

现有 `sing-sub` Worker 必须从该 Worker 的 `Settings > Builds` 连接 `Leovikii/Sing-Sub`，不要通过导入流程创建第二个 Worker。

- Production branch：`main`
- Non-production branch builds：关闭
- Build command：`npm run build`
- Deploy command：`npm run deploy:cloudflare`
- Root directory：空
- API token：Cloudflare 自动创建
- Build Secret：不需要；现有三个 runtime secrets 会被检测并保留

首次 Build 只读取 Secret 名称和 R2 bucket 状态，不读取或轮换现有 Secret，不修改 R2 对象。确认 `ss.vkio.org` 登录、Profile、订阅、规则集和 GitHub sync 正常后，网站部署完全由 Workers Builds 承担。

## 更新

- 维护者：官方 `main` 新 commit 自动触发 Cloudflare Build。
- 普通用户：在 GitHub fork 点击 `Sync fork`；fork 的 `main` 更新后自动触发 Cloudflare Build。
- Build 失败不会替换当前生产版本。不要通过清空 R2、删除 Worker 或重新 Fork 模拟升级。
- Cloudflare Build Secret 与 Worker runtime secret 是不同作用域；普通代码更新不应重新提供或生成 signing secrets。

## 发布前检查

```powershell
npm ci
npm run verify
npm run worker:dry-run
npx wrangler whoami
npx wrangler r2 bucket info sing-sub-data --json
npx wrangler secret list --format json
```

最后两个命令只验证资源和 Secret 名称；不得列出、下载或打印 R2 私有对象及 Secret 值。生产 deploy 是独立操作，不属于只读检查。

## 数据恢复

Workspace revision 是 immutable snapshot。恢复旧 revision 时必须把旧内容发布为新 revision，并使用 current head 作为 `expectedRevision`；禁止把 head 直接倒退到旧 revision ID。

恢复后确认：

- current revision 是新 revision；
- `previousRevisionId` 指向恢复前的 current revision；
- 目标旧 revision 和恢复前 revision 仍可读取；
- Profile、资产、sync metadata 和 SRS `activeArtifact` 指针来自选定 revision；
- stale `expectedRevision` 被 CAS 拒绝且不产生可见 revision。

SRS binary artifact 是 immutable R2 object。workspace restore 只切换 pointer；目标 artifact 已被 retention 删除时应重新编译，不得伪造 pointer。

GitHub 站外恢复使用显式 pull，并先完成 diff、schema/name/reference 校验，再以单个新 R2 revision 发布。不得用恢复演练覆盖真实私有仓库。

## 代码回滚

1. 在 Cloudflare Worker 的 Versions/Deployments 中选择已验证版本执行 rollback。
2. 只有业务数据确实错误时才单独执行 workspace revision restore。
3. 不删除或清空 R2，不使用 GitHub force push 模拟数据回滚。
4. 回滚后检查登录、Profile 预览、私有订阅、公开规则集和可选 GitHub sync。

## Secret 恢复

- 删除/轮换 `SESSION_SIGNING_SECRET`：现有会话和 SRS ticket 失效，重新登录即可。
- 删除/轮换 `SUBSCRIPTION_SIGNING_SECRET`：旧私有订阅链接失效，从 WebUI 重新复制。
- 删除 `ADMIN_PASSWORD`：在 Cloudflare Builds 添加加密 `SING_SUB_ADMIN_PASSWORD` 后重新触发 Build，或直接在 Worker Variables & Secrets 中恢复 runtime secret。
- Worker 被删除但 R2 保留时，可重新连接 fork 并生成新 Secrets；业务数据保留，但会话和订阅链接必须更新。

## 安全边界

- 部署初始化器不输出管理员口令或 signing secret，不把值作为命令参数。
- 临时 secret file 使用 OS 临时目录和仅当前进程可读权限，并在成功或失败后删除。
- R2 只在明确 not-found 时创建；任何认证、网络或未知 API 错误都会在部署前中止。
- 不记录 Cookie、Authorization、PAT、ticket、请求体或完整私有 JSON。
- Turnstile/专用 Rate Limiting 暂不启用；如公开域名出现持续撞库，再作为独立运维增强处理。
