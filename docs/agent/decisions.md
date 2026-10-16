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
| ADR-061 | ACCEPTED | 3.1.2 产物隔离与适配器移除；原手动升级要求由 ADR-062 取代。 |
| ADR-062 | SUPERSEDED | 3.1.2 一次性自动升级；3.1.3 按 ADR-063 删除该入口，历史备份保留。 |
| ADR-063 | ACCEPTED | 3.1.3 迁移退场、手动同步方向与覆盖确认。 |
| ADR-065 | ACCEPTED | 开发文档保留现行约束和当前交付状态，历史细节使用 Git；README 显示项目版本。 |
| ADR-064 | ACCEPTED | 资源卡片只显示配置修改时间；来源时间保留在 SOURCE 左下角，近期相对时间、满 30 天绝对时间。 |

| ADR-066 | ACCEPTED | 3.1.5 共用卡片、排序工具栏与导航内容；资源/筛选卡片顺序为浏览器展示偏好。 |
| ADR-067 | ACCEPTED | 3.1.6 用单一 metadata 文档分离 Profile/资源管理信息，按实体路径归集展示/编辑数据，保留部署与临时状态边界。 |

## ADR-050：React 19 + Mantine 9

3.1.0 使用 React 19、Mantine 9、React Router、Zustand、react-i18next、`@mantine/form`、dnd-kit、精简 CodeMirror 6 和 Lucide React；JSON 编辑器的最终选型见 ADR-058。

本决策取代原 ADR-001 至 ADR-006 中的 Vue/PrimeVue/Pinia/Vue Router/Vue I18n 选型，取代 ADR-014 的 Tailwind 布局选型，并取代 ADR-039/040 的 PrimeVue/Vue 专属 UI 实现。后端、shared contract、路由 URL、用户能力和数据语义保持不变。

原因：产品负责人明确不继续使用 Vue；Mantine 是活跃、主流、MIT 的 React 组件库，能够原生覆盖当前基础交互、主题、响应式、动画和可访问性需求。

## ADR-051：依赖许可证门禁

PrimeVue 5 的发布包采用带资格门槛、年度确认和许可证密钥的自定义许可，因此不得升级或重新引入。所有新 UI runtime 依赖必须通过自动许可证扫描；自定义、source-available 或商业双轨许可证需要新的显式 ADR 和用户批准。

## ADR-054：编辑器标题、只读预览与操作区层级

资源与 Profile 弹窗采用相同的信息层级：已有实体以名称作为主标题，资源类型或“配置”只用 Mantine `Badge` 作为辅助上下文；新建实体以“新建…”作为主标题。类型不能取代实体名称，因为名称才是用户在列表和编辑流程中识别对象的稳定标识。

类型、名称、备注与关闭按钮统一位于 Mantine `Modal.Header`：预览态名称按内容占宽，非空备注紧随其后并保持左对齐；编辑态在相同位置原位切换为名称和备注输入框，Modal Body 不再重复渲染元数据。模式切换与底部操作区位于可滚动业务内容之外，长表单和代码预览统一使用 Mantine `ScrollArea` 独立滚动，避免取消和保存按钮随内容离开视口。移动端继续使用全屏 Modal，ScrollArea 通过 Mantine 弹性布局填满标题与操作区之间的剩余高度，不实现自定义 sticky、滚动锁或 overlay。

## ADR-057：公开文档不承担版本日志职责

根目录中英文 README 与 `docs/wiki` 只面向用户介绍产品能力，并提供部署、配置和日常使用说明。根 README 可以显示来自 package metadata 的当前稳定版本徽章，并以简短章节说明用户部署和运维相关的技术栈；这不等同于发布历史。README 与 Wiki 不保存发布说明、更新日志、迁移任务、包体积、依赖审计、自动化测试过程或 Agent 开发记录。

版本与工程状态继续保存在应用包元数据和 `docs/agent`；部署与恢复的长期操作步骤保存在 `docs/operations`。发布历史如有需要使用 Git tag、GitHub Release 或 Git 历史，不在 Wiki 中建立逐版本页面。

## ADR-058：精简 CodeMirror 6 与隔离性能预算

产品负责人确认行号、JSON 语法高亮、括号匹配和可发现的查找/替换属于正式编辑能力。Mantine `JsonInput` 基于原生 `textarea`，无法在不自研滚动同步、高亮覆盖层和行号栏的情况下可靠提供这些能力，因此 ADR-055 与 ADR-056 被本决策取代。

编辑器直接使用 CodeMirror 官方 MIT 模块，不引入第三方 React wrapper，也不使用 `codemirror` 聚合包或 `basicSetup`。首批只启用行号、JSON 解析与高亮、括号匹配、历史、格式化、lint 和原生查找/替换；不启用自动补全、折叠、多光标附加 UI 或 IDE 级功能。Mantine 只负责编辑器外层工具栏、加载态和 Modal；CodeMirror 负责代码输入、滚动、选择和搜索面板。

CodeMirror 只能在非规则集资源进入编辑状态后动态加载；资源列表和预览不得请求编辑器 chunk。普通应用 JS gzip 继续不高于 285.81 KiB，CodeMirror 专用懒加载 JS gzip 不高于 120 KiB，总客户端 JS gzip 不高于 405.81 KiB。构建门禁必须分别报告三项；修改预算需要新的显式决策。编辑器实例在一次 Modal 会话中保持稳定，关闭时销毁并释放监听器。

## ADR-060：GitHub 同步保留 JSON 内容顺序

`3.1.1` 修复业务 JSON 在 R2 与 GitHub 之间同步时被递归按键名排序的问题。Profile、节点、模板、Adapter 与 Ruleset 使用保留对象插入顺序的两空格、LF、末尾换行 JSON 输出；数组顺序始终保持。Manifest 仍可使用稳定键排序。

同步继续使用既有的顺序无关语义哈希判断业务冲突，以兼容 `3.1.0` 已保存在 R2 的 `baseContentHash`。另行比较标准化输出的表示指纹；语义相同但字段顺序不同时不制造冲突，但显式 push/pull 必须分别以 R2/GitHub 一侧的顺序为准执行，不能返回 noop。Zod 仍负责完整校验，校验成功后保留原始 JSON 对象而不使用 schema 重建结果。此决策不引入原始源码副本，不保证保留任意空白格式。

## ADR-061：3.1.2 源数据与产物边界、适配器退场

用户批准完整删除适配器，不保留运行时兼容逻辑：删除 Profile adapterUrl、workspace assets.adapters、预设、CRUD、同步支持和前端入口。workspace snapshot 改为 schema v3；旧数据由独立离线升级工具生成 v3 转换基线及其后继 current revision/head 候选和报告，保证 current/previous 均可由新运行时读取，部署前人工应用，不在 Worker 读取路径迁移，不改写历史 revision。需要适配器的旧 Profile 可删除，由用户在新版本重新创建；其他源数据保持原样。升级重置 sync 基线，首次同步由用户显式选择方向，避免旧哈希引发错误覆盖。

Profile 定义仍位于 sing-sub/configs，模板、节点和规则集保持独立。编辑源、R2 revision 和 GitHub 同步保留管理备注；预览与订阅共同使用的构建出口删除配置根与入站/出站对象上的 note、_sing_sub，保留任意键值映射（例如 HTTP headers）中的同名业务键及字段/数组顺序。订阅产物缓存版本随输出语义变更更新。规则集继续使用既有 compiler-source 边界。

筛选器模式属于表单草稿；空关键词不能导致模式重置，空规则仅在预览/提交时规范化掉。

## ADR-063：3.1.3 迁移退场与手动同步方向

用户已确认 3.1.2 生产迁移成功。3.1.3 删除 v2→v3 一次性模块、current 读取触发入口、离线转换工具及专用测试，运行时只读 v3；旧安装必须先经过 3.1.2，已有迁移备份继续保留且不执行 R2 清理。同步 canPush/canPull 表示安全方向而非覆盖权限：已连接时允许选择任一方向，不安全方向使用既有 Mantine 确认弹窗和 overwrite 请求；Worker schema 校验、expectedRevision、GitHub 非强制更新及 SRS 语义不变。

## ADR-064：资源修改时间与来源刷新分离

2026-10-13 用户确认最终布局并授权开发与本地验证。所有资源卡片统一显示“上次修改”，只代表配置本体保存；规则集来源抓取时间保留在 SOURCE 区域左下角，不在卡片重复展示。现有来源抓取由保存触发，因此文案为“来源更新”，周期控件提示当前不执行后台定时刷新。SRS 构建不得更新配置时间，本版不新增调度器。

复用 JsonAsset.updatedAt 与 sources[].last_updated，不改变持久化 schema。列表摘要只新增可选 updatedAt；GitHub 拉取同路径且内容（包括字段顺序）未变时保留原时间，新增/变更时不伪造手动修改时间，显示“未记录”。这取代早期提案中将导入时间作为修改时间的建议。元数据不进入业务 JSON、同步导出或编译源；revision/CAS 和同步覆盖语义不变。

近期使用原生 Intl 相对时间，满 30 天或未来异常时间显示本地绝对时间；完整时间与时区可通过键盘、触摸和预览查看。页面共用一个分钟级时钟，不新增依赖、逐卡请求或历史回填。用户文档与 Agent 文档按 ADR-057 分离，README 徽章展示仓库项目版本，不表示已完成生产部署。

用户验收后的样式收敛：资源卡片名称为主标题，备注最多两行，时间移至低强调页脚，只显示时间值（缺失为“时间未记录”）；完整“上次修改”标签保留在可访问提示及资源窗口。规则集页脚保留构建状态和格式操作，来源更新时间位置不变。主页 Profile 卡片不增加时间，避免混淆定义修改与动态生成结果。实际保存验收使用独立本地 Worker/R2 数据目录，不开放正式后端写入。

## ADR-065：开发文档只保留有效信息

2026-10-13 用户授权准备 3.1.4 并推送 dev、创建到 main 的 PR。完成的版本计划、重复会话流水和被取代决策的实施细节由 Git 历史追溯；保留有效决策索引、当前约束、当前交付范围、最新验证与风险。README 展示仓库项目版本，不据此宣称生产已升级；部署与发布仍需单独授权。

## ADR-066：3.1.5 统一卡片与响应式导航

2026-10-15 用户审阅统一网格草图及双端共用组件方案后授权实施和前端测试。配置、节点、模板、规则集共用名称/两行备注/底部信息的卡片骨架；同级多项共用 dnd-kit、键盘与上下移动、吸顶排序工具栏、保存/取消和离开确认。单项不显示排序控件，失败保留草稿。配置沿用现有 typed saveState/order/revision 流程；资源与配置编辑器的出站筛选卡片仅保存当前浏览器、当前用户范围的展示顺序，不改变规则执行、导出、Worker、shared schema、revision、sync 或 SRS 语义。新增项追加末尾，删除项不占位，资源改名保持已有展示位置。出站筛选展示偏好按模板共享，配置新建或改名不丢失偏好。

桌面 AppShell.Navbar 展开 216px、折叠 64px，并记住偏好；手机使用最大 280px、至少保留 48px 背景的原生 Drawer。导航内容、排序状态和卡片跨端共用。基础控件使用现有锁定的 Mantine 9 API 与本地官方文档复核，不在本次 UI 任务中附带依赖升级；不引入新依赖。排序与样式分别核验；不授权生产部署、R2 写入、推送、合并或发布。

2026-10-15 用户完成人工验收，追加授权提交并推送 dev；到 main 的 PR 由用户手动创建，仍不授权合并、部署或发布。

复用 Rolldown 原生 entries-aware 分组与 strictExecutionOrder，合并过小的 Mantine 公共 chunk 并保持模块初始化顺序；保留路由与 CodeMirror 二级懒加载，原三段 gzip 预算不变，不增加依赖。

verify 的关键 E2E 默认针对生产构建执行，防止仅在打包后出现的模块初始化问题漏过；开发模式测试仍由同一 runner 提供。


## ADR-067：统一元数据文档与正文隔离（ACCEPTED）

2026-10-16 用户要求分类核对保存价值，并避免管理信息混入业务正文和零散文件增加维护成本。详细契约见 [统一元数据设计](./metadata-storage-design.md)，任务见 [3.1.6 计划](./v3.1.6-plan.md)。

每个工作区只新增一个 GitHub metadata.json，按实体路径保存 Profile/资源 note/order/已知时间、display 和恢复编辑能力所需的 editor 定义；Profile 的同步 JSON 保留纯管理定义，资源 JSON 保留纯业务正文。在线 R2 使用同一 immutable revision 的 metadata 区，不额外写元数据对象，不保留原字段持久化副本，不创建逐实体/逐类型 sidecar。

来源/手写规则和明确位置的管理注释在同一文件中类型化保存，不丢弃编辑能力；构建只接收纯定义/资源，合法业务同名字段保留。身份、安全版本、凭据、sync base、编译器部署状态及 build/job/artifact 仍走现有 R2 协议，设备偏好在浏览器，临时/可推导状态不新增持久化。

用户已批准实施与隔离前端测试。本决策取代 ADR-064/066 的元数据格式和排序归属约束，保留其交互与时间语义。新写 v4、兼容读 v3/v4；同步 v3、旧基线按 v2 投影。不改变 revision/CAS、同步覆盖或 SRS 协议，不授权推送、部署或发布。

性能约束：普通读取不新增逐实体哈希、请求或 R2 对象；继续一次快照读取/发布，不新增运行依赖，原三段 gzip 预算不变。

同步导入的原树摘要与清理后的本地投影分开：`sync.baseContentHash` 保留远端原树 B；必要时 `baseWorkspaceContentHash` 校验已保存的本地基线投影，`baseFormatVersion` 指定该投影格式。陈旧时间/编辑定义的修正表现为 local-ahead，不伪造远端摘要或清空基线。内存中的 Profile/资源包装视图可组合管理字段，但只经统一编解码边界持久化为纯正文与唯一 metadata 区。

用户追加约束：3.1.6 兼容转换为一次性代码，3.1.7 移除；集中于 `worker/compat/v3.1.6`，旧 schema/投影入口一并退场。移除前检查活跃 v4 引用，旧历史需要保留的 3.1.6 在隔离副本中恢复，详见 [退场清单](./metadata-compat-retirement.md)。

3.1.6 使用 Rolldown 原生 `$initial` tag 合并本来已需首屏加载的依赖，减少小共享 chunk 的 import/包装开销；保持 strictExecutionOrder、路由与编辑器懒加载，原三段预算不变，不把延迟功能强拉入首屏。

2026-10-16 用户追加授权提交并推送 3.1.6 到 dev；到 main 的 PR 由用户手动创建，仍不授权合并、部署、发布或生产数据操作。
