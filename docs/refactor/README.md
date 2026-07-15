# Sing-Sub 完全重构计划

本文档集是 Sing-Sub 重构工作的唯一计划与进度来源。后续开发任务开始前必须先阅读本页、`decisions.md` 和 `progress.md`，完成后必须更新进度与验证结果。

## 重构目标

1. UI 基础控件由成熟组件库提供，删除不必要的自研 Button、Select、Dialog、Popover、Toast 等实现。
2. WebUI 只能依赖稳定的应用 API，不感知 R2、GitHub 或编译调度细节。
3. R2 Standard 是唯一持久化存储，保存 workspace revision、private metadata、build job 与 SRS artifact。
4. 所有 workspace 更新使用 immutable revision、head pointer 与 ETag 乐观并发控制，普通保存不得静默覆盖陈旧版本。
5. 路由只负责 HTTP 解析、认证、调用应用服务和响应映射，不承担业务编排。
6. 前后端共享契约，API 使用稳定错误码，用户界面支持简体中文和英文。
7. CI 能验证前端、Worker、领域逻辑、R2 WorkspaceStore、GitHub 同步、SRS 编译协议和关键浏览器流程。
8. 每个迁移阶段都可独立发布，不使用长期不可运行的“大爆炸”重写分支。

## 文档导航

- [current-state.md](./current-state.md)：当前基线、已确认风险和保留能力。
- [target-architecture.md](./target-architecture.md)：目标依赖关系与完整目录结构。
- [data-architecture.md](./data-architecture.md)：R2-only 数据模型、revision 发布、SRS 编译和 GitHub 同步协议。
- [engineering-standards.md](./engineering-standards.md)：架构、UI、API、i18n、测试和安全标准。
- [roadmap.md](./roadmap.md)：实施阶段、任务顺序、验收门槛和回滚边界。
- [decisions.md](./decisions.md)：已锁定和待确认的架构决策。
- [progress.md](./progress.md)：任务状态、验证记录、阻塞项和会话日志。
- [deployment-automation-backlog.md](./deployment-automation-backlog.md)：重构后 Release CI/CD、Windows 部署助手、升级与回滚设想。

## 执行方式

采用渐进式替换：先为现有行为增加测试和适配边界，再逐个迁移调用方，最后删除旧实现。禁止先创建一套完整的新架构、长期不接入实际流量。

每个任务遵循以下流程：

1. 从 `progress.md` 选择一个任务，将状态改为 `IN_PROGRESS`。
2. 阅读该任务关联的标准与决策，确认不违反依赖方向。
3. 先补 characterization test 或失败测试，再修改实现。
4. 运行任务要求的局部验证和全量 `npm run verify`。
5. 更新 `progress.md` 的状态、验证结果和会话日志。
6. 出现新的长期约束时，先记录到 `decisions.md`，再继续开发。
7. 只有验收条件全部满足时才能标记为 `DONE`。

## 不可违反的红线

- Vue 组件和前端 store 不得直接调用 Cloudflare 存储或 GitHub API。
- Feature 组件不得直接调用全局 `fetch`，只能使用 `src/api` 的类型化客户端。
- HTTP route 不得直接构造 R2 key、Git tree、commit 或 workflow payload。
- 所有 workspace 更新必须携带期望 revision/ETag；重命名必须验证源 revision 和目标名称不存在。
- 不得捕获并忽略所有 GitHub 错误来假装文件不存在。
- 不得把 GitHub 原始错误文本直接作为用户界面文案。
- 不得新增硬编码用户可见文本；必须同时提供 `zh-CN` 和 `en-US` 词条。
- 不得新增自研基础交互控件，除非 `decisions.md` 记录了 PrimeVue 无法满足的证据。
- 不得在同一个 PR 中同时迁移主数据存储和大面积迁移 UI。
- 不得引入 RC、beta 或未稳定依赖；PrimeVue 使用实施时的最新稳定版。
- 不得让 GitHub Actions 直接持有 R2 管理凭据；编译产物必须通过 Worker 回调写入。
- 不得把 GitHub 同步当作实时双主复制；所有 pull/push 都由用户主动触发，并基于 R2 sync base 与 GitHub 实际受管文件树的内容摘要阻止误覆盖。

## 完成定义

重构完成需要同时满足：

- `App.vue` 只承担应用入口和路由出口，不保存业务状态或编排保存流程。
- 所有 R2 与 GitHub 访问分别只存在于对应 infrastructure adapter；浏览器不得感知存储实现。
- 所有 API 请求只存在于 `src/api`。
- 所有基础交互控件来自 PrimeVue，旧自研基础组件已删除。
- 用户可见界面完整支持 `zh-CN` 与 `en-US`，不存在散落硬编码文案。
- 配置、资产、规则集的创建、修改、重命名、删除、ETag 冲突、revision 回滚和迁移路径均有测试。
- 规则集保存、Actions dispatch、编译回调、R2 原子发布、失败保留旧 SRS 和 superseded job 均有测试。
- GitHub push、pull、无变化、单边变化和双边冲突均有测试。
- CI 执行 lint、前后端类型检查、单元测试、Worker 集成测试、构建和关键 E2E。
- Worker dry-run 和桌面/移动端关键流程验证通过。
- `progress.md` 中所有必需任务为 `DONE`，没有未处理的 P0/P1 风险。
