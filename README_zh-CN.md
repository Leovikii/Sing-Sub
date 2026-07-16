# Sing-Sub

[English](README.md)

当前预发布版本：`v3.0.0-beta.1`

Sing-Sub 是一个用于编辑和分发 [sing-box](https://sing-box.sagernet.org/) 配置的自托管控制台。

## 当前架构

- Cloudflare R2 Standard 是唯一持久化主存储。
- Worker 提供 WebUI、鉴权 API、私有配置订阅和公开规则集分发。
- 浏览器会话使用签名 `HttpOnly` Cookie，不依赖 KV 会话。
- GitHub 是可选的数据导入、备份和双向编辑同步介质。
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

私有配置订阅使用紧凑的 `s2.<22-char-tag>` Token。它仍是 bearer credential，不应公开；规则集 JSON/SRS 链接不包含配置订阅 Token。

## 前置条件

- 已启用 Workers 和 R2 subscription 的 Cloudflare 账户
- 用于 Fork 源码的 GitHub 账户
- 只有导入、同步或启用 SRS 时才需要私有 GitHub 数据仓库和 PAT

## Cloudflare 部署

1. Fork 本仓库。
2. 在 Cloudflare Worker 的 `Settings > Builds` 连接该 fork，并选择 `main`。
3. 关闭非生产分支构建。
4. Build command 填写 `npm run build`，Deploy command 填写 `npm run deploy:cloudflare`。
5. 让 Cloudflare 自动创建 Builds API Token。
6. 添加名为 `SING_SUB_ADMIN_PASSWORD` 的加密 Build Secret，值至少包含 12 个 UTF-8 bytes。
7. 连接仓库并等待 Build 完成。
8. 打开生成的 `workers.dev` 地址，用管理员口令登录。

部署初始化器会自动创建或复用私有 `sing-sub-data` bucket，并生成两个相互独立的 signing secret。正常更新不会清空或轮换现有 bucket、对象和 runtime secret；管理员口令是用户唯一需要设置和记忆的部署凭据。

首次成功部署后可以删除 Build Secret。GitHub 数据同步、PAT 和 SRS 编译仍是 WebUI 内的可选设置。

本地维护仍可使用 Wrangler：

```powershell
npm ci
npm run verify
npm run worker:dry-run
npm run deploy
```

空 R2 会仅凭管理员口令创建空的 `primary` workspace 和内置 Momo 适配器；GitHub 连接稍后在仓库设置中配置。

## GitHub 工作流

- `ci.yml` 验证 Pull Request。
- Cloudflare Workers Builds 部署所跟踪的 `main`；不再存在 GitHub 网站部署 workflow，也不需要用户管理 Cloudflare API Token。
- 启用 SRS 后，Worker 会自动向已连接的私有仓库安装版本化编译 workflow；用户不需要手动创建 Actions Secret 或 Variable。
- 普通用户通过 GitHub `Sync fork` 显式更新；fork 的 `main` 更新后触发其自己的 Cloudflare Build。

核心重构已经完成。`3.0.0-beta.1` 进入 Phase 9 Beta 稳定阶段，统一处理 Cloudflare 初始化、受控升级、目标化配置派生和前端体验收束。只有 Beta 发布门禁全部通过后才发布 `3.0.0` 正式版。

## 开发

```powershell
npm run dev
npm run verify
npm run preview
```

适配器语法见 [WIKI_zh-CN.md](WIKI_zh-CN.md)。架构、决策和进度见 [docs/refactor](docs/refactor/README.md)，发布与恢复说明见 [docs/operations/release-and-recovery.md](docs/operations/release-and-recovery.md)。

## 许可证

[MIT](LICENSE)
