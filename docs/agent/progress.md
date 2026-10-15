# 当前交付状态

2026-10-15 · 项目版本 3.1.5 · 本地开发与验收完成 · 当前分支 dev · 回滚基线 3.0.0（跨数据格式须配套恢复）。版本准备不代表已部署。

| 任务 | 状态 | 结果 |
|---|---|---|
| FE-3199 | DONE | 配置、资源、出站筛选共用卡片；统一网格、标题操作、两行备注及底部信息 |
| FE-3200 | DONE | 多项共用鼠标/触控/键盘与上下移动；吸顶保存/取消、失败保留与离开确认；配置服务端 order，资源和编辑器为用户浏览器偏好 |
| FE-3201 | DONE | 桌面 216/64px 折叠导航持久化；手机最大 280px Drawer，共用导航内容及原生焦点/遮罩交互 |
| FE-3202 | DONE | 版本、双语/主题、五档视口、交互、生产回归及全部工程门禁完成 |
| FE-3181/3196 | DONE | 原 Firefox 缓存的 SideBySide/mozglue 启动故障已通过独立完整浏览器安装绕过，6 项专项通过 |

## 验证基线

- 197 项 unit/integration、54 项生产构建 Chromium 桌面/移动 E2E、6 项生产构建 Firefox 专项全部通过。lint、shared/web/node/worker 类型、许可证、生产构建、Worker dry-run 与 diff 检查通过。
- 三段 JS gzip：普通应用 285.22 / 285.81 KiB，编辑器 114.90 / 120 KiB，总计 400.13 / 405.81 KiB。无新依赖，未扩大预算；原生 Rolldown 分组配合 strictExecutionOrder，生产启动与 CodeMirror 二级懒加载由浏览器回归覆盖。
- 覆盖 320/390/412/768/1440、亮暗色/中英文、鼠标/真实触摸事件/键盘排序、长备注、吸顶保存、取消、导航保护、存储失败重试、revision 冲突、资源改名/新增/删除、出站展示顺序不改业务规则、Drawer 焦点恢复/循环/遮罩关闭。已人工检查双端截图。
- 默认 Firefox 缓存仍保留；本次使用临时完整安装复验：PowerShell 设置 `$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:TEMP 'sing-sub-315-browser'`，执行 `node scripts/run-e2e.mjs --production --project=desktop-firefox`。生产包须先构建。CI 继续安装自己的浏览器，不移除 Firefox gate。
- `verify` 改为对生产构建执行 E2E；不带 `--production` 的同一 runner 继续支持开发模式。26 份 Markdown 文档本地链接零失效；已完成旧计划由 Git 历史追溯。

范围见 [3.1.5 计划](./v3.1.5-plan.md)，长期约束见 ADR-066，历史见 [摘要](./archive/v3.1-summary.md) 与 Git。资源展示顺序仅属于当前用户、当前浏览器；出站筛选展示偏好按模板共享，不改执行/导出顺序。Worker、shared、revision、sync、SRS 语义未改动。

用户已在隔离本地测试页完成人工验收，并于 2026-10-15 授权提交、推送到 dev；到 main 的 PR 由用户手动创建。没有操作生产数据，不合并、部署或发布。
