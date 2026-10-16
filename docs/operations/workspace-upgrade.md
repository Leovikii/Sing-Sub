# 工作区升级与跨格式恢复

## 3.1.6：正文与元数据分离

新安装直接写 workspace v4。已有 v3 安装可更新至 3.1.6：先校验原 schema、身份和 head hash，再在内存转换；登录/预览/订阅读取不会发布 revision 或改写历史。第一次明确保存以既有 head CAS 原子发布 v4，失败仍保留原 current。

上线前在隔离副本完成以下步骤；生产备份、部署、同步和对象恢复须明确授权。

1. 停止旧页面写入，保存上一可用代码、current/previous/head、同步 base revision 与对应 Git commit/受管树的联合备份；凭据按原安全流程单独备份，不能放进业务 JSON。
2. 用 3.1.6 读取并检查 Profile、备注、资源、规则集来源和时间。未知管理字段、冲突备注、没有唯一 tag 的注释会阻断转换；修复输入歧义后重试，不能删除报错数据来继续。
3. 进行一次正常保存，再检查 current 是 v4。若 previous 仍为 v3，再进行一次明确保存；有 GitHub 同步时先检查 diff、明确方向，把远端转为纯正文加一个 `sing-sub/metadata.json` 和现有 manifest。不会自动推送，也不清空旧基线。
4. 核对登录、预览/订阅、公开 JSON/SRS、资源改名删除、跨设备排序和规则编辑能力。旧本机排序仅点选确认导入后写入工作区，成功才清理旧键；旧设备不会自动覆盖。

GitHub metadata 保存备注/order/已知时间/display/editor，正文文件不再混入管理字段。R2 metadata 位于同一个 immutable revision 内，不另建 metadata 对象。首次同步的格式差异是可见变更；旧 v2 基线按原表示验证，保留 B/L/G。

## 3.1.7 前置条件与一次性代码退场

3.1.7 移除 v3 快照、v2 同步和本机旧排序导入的兼容代码。升级前必须用 3.1.6 确认 head.current、head.previous、sync.baseWorkspaceRevision 均指向 v4，存在同步基线时 baseFormatVersion 为 3。仍有旧引用应回到 3.1.6 完成正常保存和明确同步，不在新版自动补救、不重置基线。

历史 revision 不就地改写，原备份继续保留。3.1.7 不直接读取旧 v3 历史；需要恢复时，用保留的 3.1.6 在隔离副本恢复旧 revision 并另存 v4，再按完整备份流程导入。

## 联合恢复和回滚

同格式 restore 将选定快照（正文+metadata+原运行摘要）发布为新 revision，以当前 revision 做 CAS；不会倒退 head。head 损坏时 recoverHead 校验原始 revision hash。retention 继续保护 current、previous 和 sync base。

跨 v3/v4 不能只回滚代码：停止写入，先备份最新数据，再配套恢复旧代码可读的 current/previous、head hash、sync base 及对应远端 v2 树。正文和 metadata 不能分别覆盖。升级后产生的新修改必须先保存并核对，不能直接用旧备份丢弃它们。本版不提供自动降级。

GitHub 站外恢复只恢复业务定义、正文和元数据；新部署重新连接、建立同步基线并 reconcile 派生构建。旧 artifact 已被清理则重新编译；不能从 GitHub 导入 ready 状态冒充二进制可用。

## 更早的 v2 安装

仍使用 workspace v2 的安装必须先经过 3.1.2，完成其适配器移除升级，再升级至 3.1.6。3.1.3 已删除该旧转换入口。原迁移备份 `workspaces/primary/migrations/v3/<旧 revision ID>.json` 保留，不由此次升级清理。更早流程细节查对应 Git tag，不在当前运行时恢复长期兼容栈。
