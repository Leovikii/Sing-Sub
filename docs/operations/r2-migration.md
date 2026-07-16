# R2-only workspace 初始化

R2 Standard 是唯一在线主存储。新部署不通过登录 API 导入 GitHub/KV，也不要求数据仓库或 PAT。

## 部署资源

- 用户先在 Cloudflare 启用 R2 subscription。
- `npm run deploy:cloudflare` 查询固定 private bucket `sing-sub-data`；存在则复用，仅在明确返回 not-found code `10006` 时创建。
- `WORKSPACE_BUCKET` binding 由 `wrangler.toml` 固定绑定该 bucket。
- 初始化器只创建缺失资源，不删除 bucket、对象或 runtime secret。

## 首次登录

访问 `workers.dev` 或 Custom Domain 后，WebUI 只提交：

```json
{
  "adminPassword": "<administrator password>"
}
```

管理员 Worker Secret 校验通过后创建首个 immutable workspace schema v2 revision、head pointer 和 Momo adapter。该请求不访问 GitHub，不创建 private credentials。

## 已有 GitHub 数据

需要恢复或导入站外 editable tree 时：

1. 先完成空 workspace 初始化并登录。
2. 在设置/仓库中连接 private repository 和 fine-grained PAT。
3. 打开同步页检查 remote diff。
4. 显式执行 GitHub 覆盖 R2 的 pull；首次两侧内容不同必须确认 overwrite。

Pull 固定 remote commit，完成路径、大小、UTF-8、schema、名称和引用校验后，才以 expected R2 revision 发布一个新 workspace revision。失败不会部分覆盖 current workspace。

## 验证清单

```text
[ ] Cloudflare 账户已启用 R2 subscription
[ ] sing-sub-data 已自动创建或复用
[ ] Worker 只绑定 WORKSPACE_BUCKET
[ ] 三个 runtime secret 名称存在，值未输出
[ ] 未登录 bootstrap 返回 setupRequired=true
[ ] 登录请求只包含 adminPassword
[ ] 首个 workspace revision 为 schema v2 并包含 Momo adapter
[ ] 未连接 GitHub 时 Profile、Asset、Ruleset JSON 和私有订阅可用
[ ] 可选 GitHub 连接与 pull 在登录后独立完成
```

历史 GitHub/KV 到 R2 的生产迁移已经完成，对应运行时 reader、登录导入分支和迁移测试已删除。正式版不保留兼容代码。
