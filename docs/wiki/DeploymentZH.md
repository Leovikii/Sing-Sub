# 部署到 Cloudflare

[English](Deployment)

## 前提

- 已启用 Workers 和 R2 subscription 的 Cloudflare 账户
- GitHub 账户及 `Leovikii/Sing-Sub` fork
- 至少包含 12 UTF-8 bytes 的管理员口令

部署网站不需要私有 GitHub 数据仓库或 PAT；它们只在之后启用 GitHub 同步或 SRS 编译时使用。

## 连接仓库

1. 打开 **Cloudflare Dashboard > Workers & Pages**，新建或选择一个 Worker。
2. 进入 **Settings > Builds**，连接 GitHub 并选择 Sing-Sub fork。
3. 将生产分支设为 `main`。
4. 不需要预览环境时，关闭非生产分支构建。
5. Root directory 留空。
6. **Build command** 填写 `npm run build`。
7. **Deploy command** 填写 `npm run deploy:cloudflare`。
8. 使用 Cloudflare 自动创建的 Builds API token。

## 设置管理员口令

新增名为 `SING_SUB_ADMIN_PASSWORD` 的加密 Build variable。首次部署时，它会成为运行时 `ADMIN_PASSWORD`，值必须至少包含 12 UTF-8 bytes。

不要把口令写入仓库、普通明文变量、命令参数或截图。

## 首次部署

连接仓库或重试构建即可启动部署。部署初始化器会：

- 创建或复用私有 R2 bucket `sing-sub-data`；
- 保留 bucket 中所有现有对象；
- 仅在缺失时创建 `ADMIN_PASSWORD`；
- 分别生成缺失的 `SESSION_SIGNING_SECRET` 与 `SUBSCRIPTION_SIGNING_SECRET`；
- 后续部署始终保留已有运行时 Secret；
- 使用 `WORKSPACE_BUCKET` binding 部署 Worker。

打开生成的 `workers.dev` 地址并用管理员口令登录。空 bucket 首次登录成功后会创建空 workspace 和可编辑的 Momo 适配器。

首次部署成功后，可以删除 Build variables 中的 `SING_SUB_ADMIN_PASSWORD`；运行时 `ADMIN_PASSWORD` 会继续保存在 Worker 加密变量中。只有运行时管理员 Secret 被删除时，才需要在下次部署前恢复 Build Secret。

## 可选 GitHub 功能

登录后进入**设置 > 仓库**，按需连接私有数据仓库和 fine-grained PAT，即可使用显式导入、推送、拉取和可选 SRS 编译。普通 WebUI 编辑与 JSON 订阅不依赖 GitHub。

启用 SRS 后，Sing Sub 会在已连接的数据仓库中安装编译 workflow。workflow 通过短期 job ticket 返回产物，不会获得 Cloudflare 存储凭据。

## 更新

- 维护者部署跟踪官方 `main`。
- 普通用户部署跟踪自己的 fork `main`。
- 更新 fork 时使用 GitHub **Sync fork**；新 commit 会触发 Cloudflare Workers Builds。
- 构建失败会保留上一 Worker 版本，不会修改 R2 数据。

## 恢复

代码恢复与数据恢复是两件事：

- 对错误源码 commit 执行 revert，并由 `main` 的新 commit 触发 Cloudflare 构建。
- Cloudflare 账户提供 Worker version rollback 时，选择已验证版本重新部署。
- 业务数据恢复必须把选定的不可变 workspace revision 发布成新 revision；不要清空 R2，也不要手工把 `head.json` 指回旧 revision。

维护者生产环境自动更新已经验证。独立 Cloudflare 账户的全新部署、普通用户 **Sync fork** 路径和实际 Worker 回滚，在获得第二账户或真实故障演练条件前延期验证。

## 本地验证

```powershell
npm ci
npm run verify
npm run worker:dry-run
```

维护者仍可使用 `npm run deploy` 本地部署，但普通用户安装不需要该流程。

完整恢复模型见 [release-and-recovery.md](https://github.com/Leovikii/Sing-Sub/blob/main/docs/operations/release-and-recovery.md)。

