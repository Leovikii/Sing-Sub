# AI Agent 开发入口

本目录是 Sing-Sub 唯一的工程计划、架构约束和进度入口。根目录 README、`docs/wiki` 与 `docs/operations` 面向用户和运维人员，不承担 Agent 指令职责。

## 每次任务必读

1. [工程标准](./engineering-standards.md)
2. [架构决策](./decisions.md)
3. [当前进度](./progress.md)
4. 与任务对应的专项计划；当前为 [v3.1.3 修复计划](./v3.1.3-plan.md)；历史前端迁移见 [v3.1.0 计划](./v3.1-frontend-plan.md)

按需阅读：

- 修改模块边界、前端入口或目录时阅读 [目标架构](./architecture.md)。
- 新增或升级前端依赖时阅读 [依赖与包体积基线](./dependency-baseline.md)。
- 修改 React UI 前先检索本地 `docs/agent/vendor/mantine-llms-full.txt` 对应章节，并以锁定版本的类型声明复核 API。该文件来自官方 [完整 LLM 文档](https://mantine.dev/llms-full.txt)，仅供本地使用且不提交 Git。
- 修改 R2、revision、SRS、GitHub sync 或认证时阅读 [数据架构](./data-architecture.md)。
- 使用本地 React 前端连接真实后端做只读验证时阅读 [真实后端本地预览](./real-backend-preview.md)。
- 追溯 3.0 决策背景时阅读 [v3.0 历史摘要](./archive/v3.0-summary.md)，更细历史使用 Git。

## 执行流程

1. 在 `progress.md` 将一个具体任务标记为 `IN_PROGRESS`。
2. 先固定或补充行为测试，再修改实现。
3. 保持每个提交可构建；默认入口、typed API 边界与 Worker 静态资源回退必须持续由测试覆盖。
4. 运行任务局部验证和约定的全量验证。
5. 更新任务状态、验证结果和遗留风险。
6. 新增长期约束时先写入 `decisions.md`。

## 文档边界

- 本目录只保留当前有效规范和精炼历史，不保存逐次会话流水。
- 用户操作、部署与恢复说明写入 `docs/wiki` 或 `docs/operations`。
- 不把内部架构术语、临时迁移步骤或 Agent 指令写入用户 README。
