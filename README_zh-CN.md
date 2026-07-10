# Sing Sub

[English](README.md)

基于边缘计算的 [sing-box](https://sing-box.sagernet.org/) 多环境配置分发控制台。通过优雅的 Web UI 管理配置文件，直接将数据存储在私有 GitHub 仓库中，并通过 Cloudflare Workers 分发订阅链接。

## 核心特性

- **基于 Cookie 的鉴权** — 使用 GitHub 仓库和 PAT 登录。会话以 HttpOnly 和 Secure Cookie 形式存储，无需第三方认证。
- **服务端安全** — GitHub PAT 加密存储于 Cloudflare KV 中，绝不暴露给浏览器。多台设备共用同一仓库时共享用户凭据。
- **边缘配置构建** — Worker 在边缘节点拉取模板和节点进行即时合并，并缓存在 KV 中，无需配置复杂的 GitHub Actions。
- **🤖 自动化机器人提交** — 通过 UI 修改并保存配置时，代码会以专属的 “Sing-Sub Bot” 身份提交到仓库，使自动化的更改与您的手动代码修改泾渭分明，保持提交历史整洁。
- **订阅分发** — 提供安全的订阅链接格式 `/sub/{token}/{name}.json`，内置 User-Agent 过滤，仅限 sing-box 客户端访问。
- **次世代毛玻璃 UI** — 令人惊艳的响应式界面，完美适配桌面与移动端，具有动态布局自适应、智能协议标签渲染和丝滑的模式切换。
- **双模式配置编辑器** — 可通过带动画的分段控制器，在可视化 UI 编辑器与实时 JSON 预览间无缝切换。
- **资源管理器** — 专用的界面用于管理、检查并实时预览远端存储的节点、模板和补丁文件。
- **多环境配置** — 轻松管理多个环境（例如 `home`、`office`、`travel`），每个环境可配置独立的入站/出站规则和模板。
- **自动化部署** — 代码推送到 `main` 分支即可触发 GitHub Actions 自动部署 Worker。

## 技术栈

- **前端**: Vue 3 (Composition API) + TypeScript + Vite + Tailwind CSS v4
- **后端**: Cloudflare Workers + KV
- **鉴权**: 基于 Cookie 的会话 (HttpOnly, Secure, SameSite=Strict)
- **CI/CD**: GitHub Actions (仅用于 Worker 部署)

## 部署前提条件

1. 准备一个 **私有 GitHub 仓库** 用于存储您的 sing-box 数据，目录结构如下：

   ```
   your-private-repo/
   ├── sing-sub/
   │   ├── configs/             # 面板生成的配置文件 (自动管理)
   │   ├── nodes/               # 节点池文件 (.json)
   │   ├── templates/           # 基础模板文件 (.json)
   │   └── patches/             # 补丁文件 (.json)
   ```
   *注: 基础模板也可以是托管在任意地方的公开 URL（例如 GitHub 的 raw 链接）。*

2. 获取 **GitHub Personal Access Token (PAT)**。必须包含 `repo` 和 `workflow` 权限（`repo` 用于读写配置，`workflow` 用于支持 GitHub Actions 自动编译规则集）。在此创建: https://github.com/settings/tokens
3. 一个绑定了 **自定义域名** 的 **Cloudflare 账号**。

## 部署指南

### 1. 创建 KV 命名空间
- 登录 Cloudflare 控制台 → 存储和数据库 → KV → 创建命名空间
- 复制命名空间 ID，并更新项目根目录下 `wrangler.toml` 文件中的 `id` 字段。

### 2. 配置 GitHub 密钥
- 前往您的 GitHub 仓库 → Settings → Secrets and variables → Actions
- 新增 `CLOUDFLARE_API_TOKEN`（请在 Cloudflare 申请并使用 "Edit Cloudflare Workers" 权限模板）。

### 3. 推送并部署
```bash
git push origin main
```

## 使用与详细文档

获取详细的 UI 面板使用教程、了解仓库的目录组织形式，以及学习强大的 **Patch 语法** (`$set`, `$append`, `$replace`, `$remove`)，请查阅我们的 [WIKI 文档](WIKI_zh-CN.md)。

订阅链接格式: `https://your-domain/sub/{token}/{profile_name}.json`

## 安全性

- 用户的 PAT 仅按 `owner/repo` 键名被单次存储在 KV 中。
- 会话 Cookie 启用了 HttpOnly + Secure + SameSite=Strict，有效期为 30 天。
- 配置了严格的 CSP 头，限制脚本加载和连接源，仅允许 GitHub API 通信。

## 许可证

MIT
