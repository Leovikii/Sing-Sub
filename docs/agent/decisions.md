# 架构决策

状态：`ACCEPTED` 已锁定；`PROPOSED` 待实施前确认；`SUPERSEDED` 已被后续决策取代。

## 当前有效决策

| ID | 状态 | 决策 |
|---|---|---|
| ADR-007 | ACCEPTED | Worker 使用 ports/adapters 隔离 domain、application、HTTP 与 infrastructure。 |
| ADR-010 | ACCEPTED | 每个 Worker 部署只管理一个 `primary` workspace。 |
| ADR-011 | ACCEPTED | API 返回稳定错误码，前端翻译用户文案。 |
| ADR-012 | ACCEPTED | 迁移分阶段验证；兼容层在最后调用方迁移后立即删除。 |
| ADR-019/020 | ACCEPTED | GitHub Actions 是无状态 SRS 编译器，通过 Worker callback 发布到 R2。 |
| ADR-021/038 | ACCEPTED | GitHub private 仅作用户主动 sync/backup，并使用 base/local/remote 安全方向比较。 |
| ADR-024 | ACCEPTED | SRS 异步构建，失败保留旧 active artifact。 |
| ADR-025 | ACCEPTED | R2 使用平台静态加密；日志和 UI 不泄露凭据。 |
| ADR-027/029/030 | ACCEPTED | R2 Standard 是唯一持久化，使用软预算；最终无 KV/D1。 |
| ADR-032/035/036 | ACCEPTED | Ruleset JSON/SRS 公开分发；私有配置使用短 Token；订阅按 current revision 动态构建。 |
| ADR-037 | ACCEPTED | SRS 使用短期 job ticket 自动 provision。 |
| ADR-043 | SUPERSEDED | replacement adapter 在 3.1.2 由 ADR-061 完整移除。 |
| ADR-047/048 | ACCEPTED | Fork + Cloudflare Workers Builds 是部署模型，代码 rollback 与 R2 restore 分离。 |
| ADR-049 | ACCEPTED | 项目许可证为 GPL-3.0-only。 |
| ADR-050 | ACCEPTED | 3.1 前端迁移到 React 19 + Mantine 9。 |
| ADR-051 | ACCEPTED | UI 依赖必须无商业资格门槛、许可证密钥和续期要求。 |
| ADR-052 | ACCEPTED | 迁移采用短期双构建、单生产入口；不在运行时桥接 Vue 与 React。 |
| ADR-053 | ACCEPTED | `3.1.0-beta.1` 切换默认入口到 React，并删除已无调用方的 Vue 迁移栈；`3.0.0` 保留为代码回滚基线。 |
| ADR-054 | ACCEPTED | 资源与 Profile 编辑器统一以实体名称为主标题、类型为辅助信息；预览态元数据只读，操作区独立于可滚动内容。 |
| ADR-055 | SUPERSEDED | JSON 资源编辑改用 Mantine `JsonInput`；由 ADR-058 取代。 |
| ADR-056 | SUPERSEDED | Mantine `JsonInput` 的轻量查找/替换；由 ADR-058 取代。 |
| ADR-057 | ACCEPTED | 根 README 可展示当前稳定版本与用户相关技术栈；README/Wiki 不维护发布说明、更新日志或开发过程记录。 |
| ADR-058 | ACCEPTED | JSON 编辑重新采用精简的官方 CodeMirror 6，编辑态懒加载并对应用与编辑器 chunk 分别执行预算门禁。 |
| ADR-059 | ACCEPTED | `3.1.0` 在 Beta 生产验证、完整回归、依赖与性能审计通过后作为稳定版准备发布。 |
| ADR-060 | ACCEPTED | GitHub 双向同步保留业务 JSON 的对象字段与数组顺序；语义哈希继续忽略对象字段顺序以兼容既有同步基线。 |

## ADR-050：React 19 + Mantine 9

3.1.0 使用 React 19、Mantine 9、React Router、Zustand、react-i18next、`@mantine/form`、dnd-kit、精简 CodeMirror 6 和 Lucide React；JSON 编辑器的最终选型见 ADR-058。

本决策取代原 ADR-001 至 ADR-006 中的 Vue/PrimeVue/Pinia/Vue Router/Vue I18n 选型，取代 ADR-014 的 Tailwind 布局选型，并取代 ADR-039/040 的 PrimeVue/Vue 专属 UI 实现。后端、shared contract、路由 URL、用户能力和数据语义保持不变。

原因：产品负责人明确不继续使用 Vue；Mantine 是活跃、主流、MIT 的 React 组件库，能够原生覆盖当前基础交互、主题、响应式、动画和可访问性需求。

## ADR-051：依赖许可证门禁

PrimeVue 5 的发布包采用带资格门槛、年度确认和许可证密钥的自定义许可，因此不得升级或重新引入。所有新 UI runtime 依赖必须通过自动许可证扫描；自定义、source-available 或商业双轨许可证需要新的显式 ADR 和用户批准。

## ADR-052：短期双构建而非混合运行时

迁移期保留 Vue `index.html` 作为唯一生产入口，新增 `react.html` 供本地和 CI 验证。React 页面按 feature 完成，但不把 React mount 到 Vue 组件，也不让两个 router 共同控制同一页面。达到验收门槛后一次切换默认入口并删除旧栈。

该模式是 ADR-012 的受控例外：新入口必须持续构建和运行 E2E，任务台账必须给出明确退出条件，禁止演变为长期双前端。

## ADR-053：3.1 Beta 生产候选与旧前端退场

产品负责人确认 `3.1.0-beta.1` 作为 React/Mantine 测试版生产候选。默认 `index.html` 切换到 React；迁移期 `react.html`、旧 Vue 页面、旧 Vue E2E、PrimeVue/Pinia/Vue Router/Vue I18n/Tailwind/vuedraggable 依赖在同一变更中删除，避免测试版继续携带两套前端。

`3.0.0` 只作为已发布代码与 Worker version 的回滚基线，不作为当前测试版 UI 的运行时兼容层。本决策不授权部署、推送、打 tag、发布 GitHub Release、修改 R2 或轮换 Secret；这些仍需用户对具体操作的明确请求。

Beta 切换是对正式版总包体积门槛的有限例外：首屏、功能回归、许可证和 Worker dry-run 必须通过，但 `FE-3151` 在全量客户端 JS 达到预算或另行批准预算前保持 `IN_PROGRESS`。测试版不得因此被标记为稳定版。

## ADR-054：编辑器标题、只读预览与操作区层级

资源与 Profile 弹窗采用相同的信息层级：已有实体以名称作为主标题，资源类型或“配置”只用 Mantine `Badge` 作为辅助上下文；新建实体以“新建…”作为主标题。类型不能取代实体名称，因为名称才是用户在列表和编辑流程中识别对象的稳定标识。

类型、名称、备注与关闭按钮统一位于 Mantine `Modal.Header`：预览态名称按内容占宽，非空备注紧随其后并保持左对齐；编辑态在相同位置原位切换为名称和备注输入框，Modal Body 不再重复渲染元数据。模式切换与底部操作区位于可滚动业务内容之外，长表单和代码预览统一使用 Mantine `ScrollArea` 独立滚动，避免取消和保存按钮随内容离开视口。移动端继续使用全屏 Modal，ScrollArea 通过 Mantine 弹性布局填满标题与操作区之间的剩余高度，不实现自定义 sticky、滚动锁或 overlay。

## ADR-055：用 Mantine JsonInput 收束 JSON 编辑器体积

`3.1.0-beta.2` 将通用 JSON 资源编辑器从 CodeMirror 6 替换为 Mantine `JsonInput`。保留受控编辑、JSON 语法校验、失焦格式化、等宽字体、原生键盘撤销/重做、只读预览和保存前完整解析；不再提供 CodeMirror 专属行号、语法高亮、内嵌搜索面板和工具栏按钮。

原因：CodeMirror 及其 commands、language、lint、search、state、theme、view 依赖形成约 116.8 KiB gzip 的二级懒加载代码，是全客户端 JS 超出正式版预算的决定性来源。`JsonInput` 已包含在锁定的 Mantine 运行时中，功能覆盖当前业务正确性所需能力，也更符合“优先组件库原生能力、减少自定义实现”的迁移原则。

构建后必须自动计算 `dist/assets/*.js` 的 gzip 总量，并维持不高于 `v3.0.0` 全客户端 JS 基线 248.53 KiB 的 115%，即 285.81 KiB。该门禁衡量全部懒加载功能，而不只衡量首屏入口；修改预算需要新的显式决策。

## ADR-056：Mantine 原生 JSON 查找与替换

通用 JSON 编辑继续使用 Mantine `JsonInput`，并以 Mantine `ActionIcon`、`Tooltip`、`Popover`、`TextInput` 和原生 `textarea` 选择 API 提供显式格式化、字面量查找与替换控件。编辑器聚焦时，`Ctrl/Cmd+F` 打开查找，`Ctrl/Cmd+H` 打开替换；控件支持上一个、下一个、替换当前项和全部替换。失焦格式化、JSON 语法校验、保存前完整解析与原生撤销/重做继续保留。

该能力属于具有明确业务语义的薄组件，不自研输入框、弹层、焦点管理或快捷键框架，不新增运行时依赖，也不恢复 CodeMirror 的行号、语法高亮、lint worker 或搜索运行时。新增代码必须继续通过 ADR-055 的 285.81 KiB 全客户端 JS gzip 门禁；不得为恢复搜索功能提高预算。

## ADR-057：公开文档不承担版本日志职责

根目录中英文 README 与 `docs/wiki` 只面向用户介绍产品能力，并提供部署、配置和日常使用说明。根 README 可以显示来自 package metadata 的当前稳定版本徽章，并以简短章节说明用户部署和运维相关的技术栈；这不等同于发布历史。README 与 Wiki 不保存发布说明、更新日志、迁移任务、包体积、依赖审计、自动化测试过程或 Agent 开发记录。

版本与工程状态继续保存在应用包元数据和 `docs/agent`；部署与恢复的长期操作步骤保存在 `docs/operations`。发布历史如有需要使用 Git tag、GitHub Release 或 Git 历史，不在 Wiki 中建立逐版本页面。

## ADR-058：精简 CodeMirror 6 与隔离性能预算

产品负责人确认行号、JSON 语法高亮、括号匹配和可发现的查找/替换属于正式编辑能力。Mantine `JsonInput` 基于原生 `textarea`，无法在不自研滚动同步、高亮覆盖层和行号栏的情况下可靠提供这些能力，因此 ADR-055 与 ADR-056 被本决策取代。

编辑器直接使用 CodeMirror 官方 MIT 模块，不引入第三方 React wrapper，也不使用 `codemirror` 聚合包或 `basicSetup`。首批只启用行号、JSON 解析与高亮、括号匹配、历史、格式化、lint 和原生查找/替换；不启用自动补全、折叠、多光标附加 UI 或 IDE 级功能。Mantine 只负责编辑器外层工具栏、加载态和 Modal；CodeMirror 负责代码输入、滚动、选择和搜索面板。

CodeMirror 只能在非规则集资源进入编辑状态后动态加载；资源列表和预览不得请求编辑器 chunk。普通应用 JS gzip 继续不高于 285.81 KiB，CodeMirror 专用懒加载 JS gzip 不高于 120 KiB，总客户端 JS gzip 不高于 405.81 KiB。构建门禁必须分别报告三项；修改预算需要新的显式决策。编辑器实例在一次 Modal 会话中保持稳定，关闭时销毁并释放监听器。

## ADR-059：3.1.0 稳定版发布准备

产品负责人确认 `3.1.0-beta.2` 已在生产完成主要功能验证，FE-3163 的 CodeMirror 版本也已完成真实后端只读浏览器验收，未发现新的功能、布局或交互问题。正式版继续保持 React/Mantine 单入口、Worker/API/R2/revision/SRS/GitHub sync 语义不变，`3.0.0` 仍是代码回滚基线。

`3.1.0` 发布门槛采用 ADR-058 的三段 JavaScript 预算，取代 ADR-053 测试版阶段的单一 15% 总量例外；同时要求完整 `npm run verify`、生产依赖许可证检查、Worker dry-run、生产构建真实浏览器性能与移动端边界全部通过。React Router 的现有 high advisory 仅影响未使用的 RSC Mode，本项目没有 RSC、Server Action 或服务端 action endpoint，且上游没有修复版本，因此记录为不可达的已审阅风险，不阻断浏览器 SPA 发布。

本决策只授权把仓库内容和版本元数据准备为 `3.1.0`。Git push、tag、GitHub Release、Cloudflare 部署、Secret 变更和 R2 写入仍需单独明确授权。

## ADR-060：GitHub 同步保留 JSON 内容顺序

`3.1.1` 修复业务 JSON 在 R2 与 GitHub 之间同步时被递归按键名排序的问题。Profile、节点、模板、Adapter 与 Ruleset 使用保留对象插入顺序的两空格、LF、末尾换行 JSON 输出；数组顺序始终保持。Manifest 仍可使用稳定键排序。

同步继续使用既有的顺序无关语义哈希判断业务冲突，以兼容 `3.1.0` 已保存在 R2 的 `baseContentHash`。另行比较标准化输出的表示指纹；语义相同但字段顺序不同时不制造冲突，但显式 push/pull 必须分别以 R2/GitHub 一侧的顺序为准执行，不能返回 noop。Zod 仍负责完整校验，校验成功后保留原始 JSON 对象而不使用 schema 重建结果。此决策不引入原始源码副本，不保证保留任意空白格式。


## ADR-061：3.1.2 源数据与产物边界、适配器退场

用户批准完整删除适配器，不保留运行时兼容逻辑：删除 Profile adapterUrl、workspace assets.adapters、预设、CRUD、同步支持和前端入口。workspace snapshot 改为 schema v3；旧数据由独立离线升级工具生成 v3 转换基线及其后继 current revision/head 候选和报告，保证 current/previous 均可由新运行时读取，部署前人工应用，不在 Worker 读取路径迁移，不改写历史 revision。需要适配器的旧 Profile 可删除，由用户在新版本重新创建；其他源数据保持原样。升级重置 sync 基线，首次同步由用户显式选择方向，避免旧哈希引发错误覆盖。

Profile 定义仍位于 sing-sub/configs，模板、节点和规则集保持独立。编辑源、R2 revision 和 GitHub 同步保留管理备注；预览与订阅共同使用的构建出口删除配置根与入站/出站对象上的 note、_sing_sub，保留任意键值映射（例如 HTTP headers）中的同名业务键及字段/数组顺序。订阅产物缓存版本随输出语义变更更新。规则集继续使用既有 compiler-source 边界。

筛选器模式属于表单草稿；空关键词不能导致模式重置，空规则仅在预览/提交时规范化掉。

## ADR-062：3.1.2 一次性自动升级

取代 ADR-061 的手工离线应用要求。用户要求合并自动部署即可升级：R2 current 读取入口仅在 schema v2 时调用独立一次性转换模块，校验身份/哈希后备份原 head/snapshot，写入 v3 previous/current，再以原 ETag CAS 发布 head；冲突重读，不覆盖并发写入。业务 schema、历史 readRevision、builder 和同步导入仍只支持 v3，不保留适配器执行或双格式业务逻辑。升级代码隔离，可在不再支持从 v2 直接升级的后续版本删除。备份使用独立 migration prefix，不受 revision retention 清理。GitHub 仍只由用户显式同步，不在读取时写远端。
