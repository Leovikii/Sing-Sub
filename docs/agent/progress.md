# 当前交付状态

2026-11-03 · 3.1.7 暂定方案，仅提交推送 dev，暂不推进 · 包版本仍为 3.1.6 · 回滚基线 3.0.0。

| 任务 | 状态 | 结果 |
|---|---|---|
| RULE-3170 | DONE | DLC 产物/交互/契约/边界与分阶段验收方案完成；5 份文档本地链接和 diff whitespace 检查通过 |
| RULE-3171–3175 | NOT_STARTED | 见 [3.1.7 计划](./v3.1.7-plan.md)，尚未实施 |

本轮只编辑工程文档。用户确认保留官方 CLI 的自动格式降级；DLC 推荐采用已展开 YAML 链接和分类选择，复用现有多行 SOURCE 输入。ADR-068 的格式策略为 ACCEPTED，ADR-069 的接入设计为 PROPOSED。2026-11-03 用户仅授权提交并推送暂定计划到 dev，明确暂不推进；RULE-3171–3175 保持未开始，不进行功能开发、合并、部署、发布或生产数据操作。

## 3.1.6 已完成基线

| 任务 | 状态 | 结果 |
|---|---|---|
| META-3210 | DONE | metadata v1、workspace v4、集中提取/多实体歧义报告与完整性校验 |
| META-3211 | DONE | 原子 CRUD/元数据保存、服务端时间、来源观测防伪、CAS 与排序无 fetch/SRS |
| META-3212 | DONE | 同步 v3 单文件、原树/本地基线校验、旧 v2 base、不完整导入阻断及过期提示 |
| META-3213 | DONE | 共享顺序/模板展示、旧本机显式导入、过期规则确认；58 Chromium + 6 Firefox 通过 |
| META-3214 | DONE | 全门禁、隔离 Worker、读/恢复/保留回归、性能对照、版本和运维文档完成 |

3.1.6 基线见 ADR-067 与[元数据设计](./metadata-storage-design.md)。兼容代码在 3.1.7 必须按[退场清单](./metadata-compat-retirement.md)删除。3.1.6 的提交推送 dev 曾获用户授权，到 main 的 PR 由用户手动创建；该记录不代表 3.1.7 已获实施或推送授权。

## 基线与调研验证

- 3.1.7 调研阶段：现有 rulesets、compiler、workflow、pipeline、reconcile、provisioner 和 metadata commands 共 8 个测试文件、41 项通过；未实际调用 GitHub Actions 或编译/加载真实 SRS。最新官方 DLC 全量 YAML 发布资产约 3.58 MB，低于现有 5 MiB 单源上限；Worker CPU/内存与新解析器尚未测量。
- 以下为 3.1.6 已完成验证，不代表 3.1.7 新行为已验证：

- lint 无警告；shared/web/node/worker 四类类型检查、215 项 unit/integration、58 项桌面/移动 Chromium 与 6 项 Firefox E2E 全通过。生产构建覆盖五档视口、双语/主题、鼠标/触摸/键盘、失败草稿/409、旧顺序显式导入与过期规则确认。
- build、三段 gzip（285.03/114.80/399.83 KiB，预算 285.81/120/405.81）、许可证、Worker deploy --dry-run、diff whitespace 和本地文档链接检查通过；dry-run 不部署。
- 隔离 localhost:8796 和独立本地 R2 state 实测新建资源/备注、保存排序/刷新、预览纯正文；不接入远端，不触碰原 8788 验收数据。215 项中覆盖原 v3 hash/历史不写、v4 恢复、retention、旧 v2 基线、来源时间防伪、仅备注/排序无 fetch/SRS、有效远端时间保留及不同备注不借用本地旧时间。
- 约 2.57 MB 节点样例 codec 中位读取 +0.6%、写序列化 +1.5%，快照 +207 bytes；R2 get/put 次数不增加。测量口径与局限见 [依赖/性能基线](./dependency-baseline.md)。
- 后续操作：用户手动创建 dev → main PR；3.1.7 需按退场清单检查活跃引用并删除一次性兼容。线上性能尚未实测，本次不授权部署或生产数据写入。
