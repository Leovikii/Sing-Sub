# Sing-Sub

[English](README.md)

当前预发布版本：`v3.0.0-beta.1`

Sing-Sub 是一个用于编辑和分发 [sing-box](https://sing-box.sagernet.org/) 配置的自托管控制台。

## 当前架构

- Cloudflare R2 Standard 是唯一持久化主存储。
- Worker 提供 WebUI、鉴权 API、私有配置订阅和公开规则集分发。
- 浏览器会话使用签名 `HttpOnly` Cookie，不依赖 KV 会话。
- GitHub 是可选的初始导入、备份和双向编辑同步介质。
- 规则集 JSON 直接来自当前 R2 revision；连接私有仓库后，可选用 GitHub Actions 编译 SRS 并回传 R2。

```text
浏览器 -> Cloudflare Worker -> 私有 R2 workspace/revision/artifact
                           -> 可选 GitHub 同步/备份
                           -> GitHub Actions SRS 编译器
```

## 订阅地址

- 私有配置：`/sub/{signedToken}/{profile}.json`
- 公开规则集 JSON：`/rules/{ruleset}.json`
- 可选 SRS：`/rules/{ruleset}.srs`

配置订阅 Token 是 bearer credential，不应公开。规则集 JSON/SRS 链接不包含配置订阅 Token。

## 前置条件

- Node.js 22
- 已启用 Workers 和 R2 的 Cloudflare 账户
- 项目内安装的 Wrangler 4.x
- 只有导入、同步或启用 SRS 时才需要私有 GitHub 仓库和 PAT

## 手动部署

创建 `wrangler.toml` 中声明的私有 R2 bucket：

```powershell
npx wrangler login
npx wrangler r2 bucket create sing-sub-data
```

通过交互提示配置三个不同的 Worker Secret：

```powershell
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SIGNING_SECRET
npx wrangler secret put SUBSCRIPTION_SIGNING_SECRET
```

两个 signing secret 均应至少包含 32 个随机 bytes。不要提交或输出这些值。

验证并部署：

```powershell
npm ci
npm run verify
npm run worker:dry-run
npm run deploy
```

当前 `workers_dev` 已关闭，首次打开 WebUI 前需要在 Cloudflare 配置 Custom Domain 或 Route。空 R2 会创建空的 `primary` workspace；GitHub 导入是可选项，之后所有设备只使用管理员口令登录。

## GitHub 工作流

- `ci.yml` 验证 Pull Request。
- `deploy.yml` 用于维护者自己的生产部署，也支持手动触发。
- 启用 SRS 后，Worker 会自动向已连接的私有仓库安装版本化编译 workflow；用户不需要手动创建 Actions Secret 或 Variable。
- 普通发布用户使用本地 Wrangler 部署，不要求 fork、GitHub Actions 或数据仓库。

核心重构已经完成。`3.0.0-beta.1` 进入 Phase 9 Beta 稳定阶段，统一处理独立 Release 部署、受控升级、目标化配置派生和前端体验收束。普通用户不要求 fork；只有 Beta 发布门禁全部通过后才发布 `3.0.0` 正式版。

## 开发

```powershell
npm run dev
npm run verify
npm run preview
```

补丁语法见 [WIKI_zh-CN.md](WIKI_zh-CN.md)。架构、决策和进度见 [docs/refactor](docs/refactor/README.md)，发布与恢复说明见 [docs/operations/release-and-recovery.md](docs/operations/release-and-recovery.md)。

## 许可证

[MIT](LICENSE)
