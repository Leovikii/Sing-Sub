<h1>
  <img src="./public/favicon.svg" width="34" height="34" alt="Sing Sub"> Sing Sub
</h1>

[English](README.md) · [Wiki](https://github.com/Leovikii/Sing-Sub/wiki/HomeZH) · [许可证](LICENSE)

Sing-Sub 是一个用于编辑和分发 [sing-box](https://sing-box.sagernet.org/) 配置的自托管控制台。

版本：`v3.0.0`

## 功能特色

- 在响应式双语 WebUI 中管理配置、节点集、模板、适配器和规则集。
- 使用一份模板、可选替换适配器和筛选后的节点动态构建配置。
- 使用私有 Cloudflare R2 bucket 保存 workspace、不可变 revision 和 SRS 产物。
- 通过简短签名 Token 分发私有配置订阅，以 JSON 或 SRS 公开分发规则集。
- 可选连接私有 GitHub 仓库，显式导入、备份和双向同步数据。
- 可选自动安装仓库级 GitHub Actions workflow 编译 SRS 产物。

## 部署

推荐使用 GitHub fork 与 Cloudflare Workers Builds：

1. 在 Cloudflare 启用 Workers 和 R2，然后 fork 本仓库。
2. 在 Worker 的 `Settings > Builds` 连接 fork，并跟踪 `main`。
3. Build command 填写 `npm run build`，Deploy command 填写 `npm run deploy:cloudflare`。
4. 添加至少 12 UTF-8 bytes 的加密 Build Secret `SING_SUB_ADMIN_PASSWORD`。
5. 完成部署后打开 Worker 地址，使用该管理员口令登录。

初始化器会创建或复用 `sing-sub-data`、生成缺失的运行时签名密钥，并在首次登录时创建空 workspace 和 Momo 适配器。GitHub 数据同步、PAT 与 SRS 编译均为部署后的可选功能。

请阅读[完整部署指南](https://github.com/Leovikii/Sing-Sub/wiki/DeploymentZH)或其[仓库内源文件](docs/wiki/DeploymentZH.md)。

## 技术栈

- Vue 3、PrimeVue、Pinia、Vue Router、Vue I18n
- TypeScript、Vite、CodeMirror、Zod
- Cloudflare Workers、Static Assets、Cache API、R2
- Vitest、Playwright

## 开发

```powershell
npm ci
npm run dev
npm run verify
npm run worker:dry-run
```

架构决策与发布进度见 [docs/refactor](docs/refactor/README.md)，运维文档见 [docs](docs/README.md)。

## 许可证

[GNU GPL v3](LICENSE)
