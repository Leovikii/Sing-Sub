# R2-only 初始化与 GitHub 导入

每个部署固定使用 private R2 Standard bucket `sing-sub-data`，binding 为 `WORKSPACE_BUCKET`。R2 是唯一持久化主存储；初始化、登录、CRUD 和订阅均不依赖 KV、D1 或 GitHub。

## 首次部署

先通过 Wrangler 交互配置三个互不相同的 Worker secrets：

```text
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SIGNING_SECRET
npx wrangler secret put SUBSCRIPTION_SIGNING_SECRET
```

- 管理员口令至少 12 bytes；两个 signing secret 各至少 32 bytes。
- Secret 不得写入 `wrangler.toml`、`.dev.vars`、GitHub 仓库、日志或聊天记录。
- R2 bucket 的公共 URL、custom domain、CORS 与 Data Catalog 保持关闭。

## 初始化方式

空 R2 首次打开 WebUI 时显示“初始化工作区”。默认只输入管理员口令，即可创建空的 `primary` workspace、首个 immutable revision/head 和自动签名的订阅 Token。

需要导入现有数据时，展开“从 GitHub 导入现有配置（可选）”，再填写：

- private repository 的 `owner/repo`；
- 对该仓库有读取权限的 PAT。

Worker 会固定默认分支 commit、只读下载受管 JSON、执行 schema/name/reference dry-run，并在校验成功后创建 workspace。PAT 只进入 R2 private metadata，不进入 revision、订阅或前端响应；导入过程不修改 GitHub，也不创建 commit。

GitHub 导入不是初始化前置条件。空 workspace 初始化后，可在未来的 GitHub sync 功能中再连接仓库；不连接 GitHub 不影响 Profile、Asset、Ruleset source、JSON 订阅或登录。

## 后续登录

workspace 存在后，所有桌面和移动设备只输入管理员口令。`owner/repo` 与 PAT 不参与登录。订阅 Token 由 Worker 根据 signing secret 和 workspace token version 自动生成，格式为 `s2.<22-char-tag>`；设置页只能轮换，不能直接填写。

## 验证

```text
[ ] bootstrap 从 R2 返回 profiles 与 revision
[ ] 空初始化未创建 GitHub private credentials
[ ] 可选 GitHub 导入完整且不会写入仓库
[ ] Asset/Profile 保存与 revision 冲突处理正常
[ ] `s2` 短订阅 Token 可用，轮换后旧 Token 和旧 `v1` 格式均失效
[ ] GitHub 不可用或未配置时仍可登录和 CRUD
[ ] 桌面与移动端均可使用密码登录
```

旧 GitHub + KV 到 R2 的生产迁移已在 RF-309 前完成验证。KV namespace 可作为短期只读回滚材料保留，但不再绑定 Worker；确认不需要旧数据后再由部署者显式删除 namespace。
