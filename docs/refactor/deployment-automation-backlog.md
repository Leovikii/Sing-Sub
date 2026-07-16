# Cloudflare Workers Builds 部署与更新

状态：`IMPLEMENTED`；现有生产 Worker smoke 与 `main` 自动更新已验证，等待 fresh-account smoke 与版本回滚演练。本文件记录 Phase 9 已接受的普通用户初始化、源码更新和生产回滚模型；它取代独立 Release、Windows 程序、Node CLI 和本地部署助手方案。

## 唯一部署模型

```text
维护仓库 main -> 维护者 Cloudflare Workers Builds -> 维护者 Worker

维护仓库 main -> 用户 GitHub fork -> GitHub Sync fork
                                  -> 用户 Cloudflare Workers Builds
                                  -> 用户 Worker
```

- 网站代码由 Cloudflare Workers Builds 拉取、构建和部署，不使用 GitHub deployment Action。
- 维护者的生产 Worker 跟踪官方仓库 `main`；普通用户的 Worker 跟踪自己的 fork `main`。
- 普通用户只有点击 GitHub `Sync fork` 后才接收上游更新；维护仓库的提交不能直接更新其他用户的生产 Worker。
- `.github/workflows/ci.yml` 只验证 Pull Request；私有数据仓库中的 SRS workflow 只承担可选编译，两者都不负责网站部署。

## 首次部署

用户只执行以下步骤：

1. 注册 Cloudflare，启用 Workers 与 R2 subscription；不手动创建 R2 bucket。
2. Fork Sing-Sub 公共仓库。
3. 在现有或新建 Worker 的 `Settings > Builds` 授权 GitHub，选择自己的 fork 和 `main`。
4. 关闭非生产分支构建；Build command 使用 `npm run build`，Deploy command 使用 `npm run deploy:cloudflare`。
5. 让 Cloudflare 自动创建 Builds API Token；不要输入 Account ID 或自建 Cloudflare API Token。
6. 添加加密 Build Secret `SING_SUB_ADMIN_PASSWORD`，值至少 12 UTF-8 bytes。
7. 连接仓库并等待构建完成，然后打开 `workers.dev` 地址，以相同管理员口令初始化空 workspace。

GitHub 数据仓库、PAT、editable sync 和 SRS compiler 均在登录后的仓库设置页按需连接，不属于部署或首次登录。

## 部署初始化器

`scripts/deploy-cloudflare.mjs` 只在本地或 Cloudflare 构建机运行，不进入 Worker bundle。每次部署按以下顺序执行：

1. `wrangler secret list --format json` 只读取 Secret 名称，不读取值。
2. 如果 Worker 不存在，将其视为首次部署；其他查询失败立即中止，避免误轮换已有密钥。
3. 缺少 `ADMIN_PASSWORD` 时，从加密 Build Secret 读取并校验管理员口令。
4. 分别生成缺失的 32-byte `SESSION_SIGNING_SECRET` 与 `SUBSCRIPTION_SIGNING_SECRET`；已有 Secret 永远不覆盖。
5. 查询固定 private bucket `sing-sub-data`；仅在 Cloudflare 明确返回 R2 not-found code `10006` 时创建，其他错误立即中止。
6. 通过仅当前进程可读的临时 JSON 与 `wrangler deploy --secrets-file` 上传缺失 Secret；`finally` 删除临时目录。
7. Wrangler 对未出现在 secret file 中的现有 Secrets 保持不变，R2 bucket 和对象从不删除或清空。

现有生产 Worker 已有三个 runtime secrets，因此不需要添加 `SING_SUB_ADMIN_PASSWORD`；初始化器会直接保留现有值。Build Secret 在首次成功部署后可以删除，后续代码部署不依赖它。若管理员 runtime secret 被手动删除，则下次部署必须重新提供 Build Secret。

## Secret 生命周期

- `ADMIN_PASSWORD` 是用户唯一需要设置和记忆的凭据。
- `SESSION_SIGNING_SECRET` 签名登录 Cookie 和短期 SRS job ticket；轮换会让现有会话和 ticket 失效。
- `SUBSCRIPTION_SIGNING_SECRET` 生成和验证私有配置短 Token；轮换会让旧订阅链接失效。
- 两个 signing secrets 不进入 GitHub、R2、前端、日志或构建输出，用户不查看也不记忆。
- 删除整个 Worker 后无法从 Cloudflare 读回 Secret；重新生成不会损坏 R2 数据，但需要重新登录并更新私有订阅链接。

## 更新与回滚

- 维护者合并到官方 `main` 后，维护者 Workers Builds 自动部署。
- 普通用户在 GitHub 显式点击 `Sync fork`；fork `main` 更新后，用户 Workers Builds 自动部署。
- 用户修改过源码且产生 Git 冲突时，GitHub 必须先解决冲突；Cloudflare 不执行上游合并。
- 构建或部署失败时，Cloudflare 保留上一生产版本；初始化器不清理 R2 或 Secrets。
- 代码问题使用 Cloudflare Worker version rollback；R2 数据问题使用 immutable workspace revision restore，两者不得混为同一操作。

## 不再实施的方案

- 不发布独立 Release 安装包、release feed 或 Windows 可执行程序。
- 不开发 PowerShell/Node setup、update 或 rollback 助手。
- 不要求用户配置 GitHub Actions deployment Secret、Cloudflare API Token 或 Account ID。
- 不让未初始化的公开 WebUI 接受“首位访问者设置管理员密码”；管理员口令只通过 Cloudflare 的受信构建控制面输入。
- 不自动把维护仓库更新推送到所有用户；普通用户升级始终由 `Sync fork` 显式触发。

## 验证门禁

- unit tests 覆盖已有部署、全新 Worker、缺失单个 Secret、R2 创建竞争和不明确查询失败。
- `npm run verify` 与 `npm run worker:dry-run` 必须通过。
- fresh-account smoke 需要真实 Cloudflare 账户启用 R2 后执行一次，确认 bucket、三个 runtime secrets、workers.dev、空 workspace 和后续无 Secret Build 均正常。
- 网站部署 `deploy.yml` 已从源码删除；现有 `sing-sub` Worker 已连接官方仓库，并于 2026-07-16 验证首次与后续 `main` Cloudflare Build 成功，生产控制面切换完成。
- 当前无独立 Cloudflare 账户执行 fresh-account smoke；不得通过删除现有 Worker 或清空 R2 来模拟。
