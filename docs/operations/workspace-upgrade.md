# 工作区升级：移除适配器

适用于从 workspace schema v2 升级到 v3 的现有安装。新建工作区直接使用 v3，无需此步骤。新 Worker 不读取 v2，也不在运行时转换旧数据；不要先部署新 Worker 再尝试用网页修改旧配置。

## 变更范围

- 删除所有适配器资源，删除 adapterUrl 非空的 Profile；这些 Profile 对应的订阅将失效，之后可使用独立模板重新创建。
- 其余 Profile 删除空的 adapterUrl 字段，名称、备注、模板和节点引用、筛选规则不变。
- 模板、节点、规则集、SRS 状态与 artifact 指针、认证和订阅签名版本保持原样。
- 生成两份 v3 不可变 revision：转换基线的 previousRevisionId 指向旧 current，新 current 指向该基线。这样清理任务读取 current/previous 时均使用新格式；旧 revision 不覆盖、不删除。
- 同步基线重置为 never。下一次同步需明确选择方向，不能沿用旧适配器文件参与计算的基线。
- 历史 v2 revision 只保留作备份，不能由 v3 运行时直接 restore；恢复前需离线转换为新格式。

## 离线准备

1. 暂停自动部署及所有写入，包括网页保存、同步、SRS callback 和自动清理。备份当前 Worker version、R2 head、current revision 和 GitHub 数据树。升级文件含私有配置，存放在仓库外的受保护目录，不提交 Git。
2. 从 R2 下载 workspaces/primary/head.json，并根据其中 currentRevision 下载对应 workspaces/primary/revisions/<revision>.json。记录 head 的 ETag；再次读取确认下载期间没有发生写入。不要把 head 或 revision 正文输出到日志。
3. 在新代码目录安装锁定依赖后运行（路径换成自己的备份目录）：

~~~powershell
npm ci
node scripts/upgrade-workspace.mjs C:/private-backup/head.json C:/private-backup/current-revision.json C:/private-backup/upgrade-output
~~~

输出目录必须不存在。工具先验证旧格式、head/revision 身份和内容哈希，再生成文件；它不连接 R2 或 GitHub，不修改输入文件，也不执行适配器替换。

输出包括：

- report.json：被删除的 Profile/适配器、保留的 Profile、新旧 revision ID、目标 R2 key 及 revision custom metadata。
- previous-revision.json、revision.json：通过新 schema 校验的转换基线和新 current。
- head.candidate.json：指向新 revision 的候选 head；head.backup.json 保留旧 head。
- sing-sub/：新格式的 GitHub 业务文件与 manifest。configs 仍保存 Profile 定义；templates、nodes、rulesets 仍单独保存。这里不包含完整 sing-box 配置产物。

先审阅 report.json；如果仍需要某个适配器 Profile，先在旧版将所需设置直接写入独立模板、清空该 Profile 的适配器选择，再重新备份并运行工具。也可按删除报告在新版本重新创建配置。

## 应用升级

以下操作会写入真实存储，应在维护窗口由部署负责人执行；离线工具不会执行这些操作。

1. 若已连接 GitHub，在私有数据仓库中将受管 sing-sub 业务树更新为生成的树，明确删除报告中的旧 Profile 文件和所有旧 adapters 文件；保留 .github 和其他非受管内容。审阅 Git diff 后提交。不能只添加新文件而留下旧适配器路径，否则新版本同步校验会拒绝该树。
2. 依次将 previous-revision.json、revision.json 上传到 report.json 指定的 previousRevisionKey、revisionKey，两者都要求目标不存在（If-None-Match: *）；同时设置 application/json 和 report 中对应的 previousRevisionMetadata、revisionMetadata。不得覆盖历史 revision。
3. 重新确认 head ETag 与步骤 2 下载时记录的一致，且所有写入仍暂停。用原 ETag 作为 If-Match 条件，将 head.candidate.json 发布到 report 指定的 headKey。条件失败则停止，重新备份和生成，不能强制覆盖。
4. 在同一维护窗口部署新 Worker。旧 Worker 与新数据格式不兼容，因此 head 切换与代码切换之间保持维护状态。
5. 验证登录、保留的 Profile、编辑源备注、无管理字段的完整配置预览及订阅、规则集 JSON/SRS；再检查 GitHub preflight，确认不存在旧 adapters 路径，明确选择同步方向。
6. 全部通过后恢复正常写入和自动部署。没有修改 signing secrets，保留的 Profile 订阅地址不变。

如果工具输出与预期不符，不应用候选 head。不要用清空 bucket、重置口令或直接改写旧 revision 代替升级。

## 回退

代码回滚与数据格式恢复必须配套。v2 Worker 不能读取 v3 current，不能只回滚代码。若新版本已发生写入，禁止直接恢复 head.backup.json，以免丢失新数据。

需要回退时保持维护状态，先备份 v3 current，再根据已保存的 v2 revision 准备符合目标 Worker 格式的新恢复 revision，previousRevisionId 指向回退前的 current，重算 head 内容哈希，以当前 head ETag 条件发布，再切换对应旧 Worker。私有凭据和 SRS 二进制不要删除；同步基线需重新确认。此流程不由升级工具自动执行。
