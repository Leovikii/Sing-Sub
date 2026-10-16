# 3.1.6 一次性兼容代码退场（3.1.7 必做）

用户明确要求迁移只服务本次升级，下个版本移除。不得把它扩展成长期多版本框架。

- 管理字段提取集中于 `worker/compat/v3.1.6/legacy-metadata.ts`；旧快照 v3 schema 和旧同步 v2 投影仅供本次升级、原始 hash 校验与隔离恢复验证，禁止新增旧格式写入。
- 新的正文、metadata、typed command、UI 与持久化只写 v4/同步 v3。兼容读取不发布 revision，不改历史；第一次明确保存才发布 v4。
- 3.1.7 开发时删除该目录、旧快照入口、旧同步导入/导出分支及其专属测试；不保留开关、自动降级或平行实现。正常元数据 schema、投影视图、产物隔离和命令不是迁移代码。

移除前在运维备份/隔离副本检查 current、previous、sync.baseWorkspaceRevision，按需完成两次 3.1.6 明确保存及一次明确方向同步，使活跃引用均指向 v4，基线投影为 v3。仍有旧引用时先通过 3.1.6 完成转换；不在新版热路径补救，不清空基线掩盖问题。保留旧对象备份，不原地改写历史 revision。

3.1.7 不再直接读取旧 v3 历史。若以后需恢复这些历史，先用保留的 3.1.6 代码在隔离副本恢复并保存成 v4，再按整体备份流程导入。生产升级/对象恢复仍须用户明确授权。

验证要求：3.1.6 覆盖旧原 hash、转换阻断、restore/recoverHead/retention/旧同步基线；3.1.7 覆盖 v4-only 拒绝旧 current 并给出先经过 3.1.6 的操作说明，删除不再运行的转换测试。当前开发不修改生产数据或执行退场。

## 删除位置清单

- `worker/compat/v3.1.6/legacy-metadata.ts`、`workspace-metadata.ts` 的 splitAsset 兼容转发、dryRunMetadataMigration：替换为拒绝混合正文的正常校验；保留合法业务 headers 和纯正文的回归。
- `shared/schemas/workspace.schema.ts` 的 legacyWorkspaceSnapshotSchema 与 3|4 union，以及 R2 store 的 v3 read/readRevision/recover 分支：收敛为 v4-only。Profile DTO 的组合视图与服务端时间继续保留，不属于旧持久化兼容。
- `export-workspace.ts` 的 formatVersion2 投影、`import-sync-tree.ts` 的旧 profile/混合正文导入和 noteFromJson、sync-workspace 的 `?? 2`：收敛同步 v3；新格式损坏仍必须阻断。
- `worker/lib/rulesets.ts` 的旧 readRulesetMetadata/createRulesetDocument/validateRulesetSource 及旧 snake_case 类型：迁移使用结束后删去；正常保存已直接用新 typed editor 生成纯正文，不再包装 `_sing_sub`。
- `LegacyOrderImport.tsx`、资源和 Profile 的导入按钮、entity-order.readOrder 与导入专用翻译/测试：一起删除，不保留自动导入或后台双写。
- 专属旧格式 fixture/转换/hash 恢复测试随边界退场；v4 CRUD/隔离/排序/冲突和同步完整性测试保留。

移除时先检索 `legacyWorkspaceSnapshotSchema`、`splitAsset`、`formatVersion`、`baseFormatVersion`、`LegacyOrderImport`、`readRulesetMetadata`，检查所有调用方；不以禁用测试代替完成活跃引用检查。
