# 元数据统一文件与正文隔离设计（3.1.6）

2026-10-16 · ACCEPTED / 开发及隔离验证完成。目标为 workspace v4、editable-sync v3，兼容读取历史格式。实施范围见 [3.1.6 计划](./v3.1.6-plan.md)。

## 1. 先区分 Profile、资源 JSON 与最终产物

- “配置”页面维护的是表单化的 Profile：选择模板、节点集、筛选规则等，没有让用户编写完整 sing-box 配置 JSON。GitHub 的 configs/<name>.json 是程序序列化的 Profile 管理定义。
- 资源库的节点、模板、规则集才是用户编辑或导入的 JSON 内容。其正文与 Sing-Sub 的备注、排序、编辑辅助信息应明确隔离。
- 最终 sing-box 配置由 Profile + 模板 + 节点等构建，既不是 Profile 同步文件，也不是 metadata.json。公开规则集和 SRS 有各自的生成出口。

在一个工作区内只维护一个可移植元数据文档。文件内部按实体路径和有类型的字段分区；不按实体、资源类型、字段或设备拆文件。统一数据模型和保存规则，不把部署凭据、运行状态和浏览器偏好塞进同一文件。

## 2. 升级前的 3.1.5 基线

| 入口 | 升级前实现事实 |
|---|---|
| [profile.schema.ts](../../shared/schemas/profile.schema.ts)、[ProfilesPage.tsx](../../src-react/features/profiles/ProfilesPage.tsx)、[save-profiles.ts](../../worker/application/commands/profiles/save-profiles.ts) | Profile 定义与 note/order/created_at/updated_at 混放；时间当前由前端生成 |
| [workspace.schema.ts](../../shared/schemas/workspace.schema.ts)、[mutate-asset.ts](../../worker/application/commands/assets/mutate-asset.ts) | 资源包装层有 updatedAt/note/content；备注也存在正文；时间来自服务端 |
| [entity-order.ts](../../src-react/components/entity-order.ts) | 资源与模板筛选卡片展示顺序仅在 localStorage |
| [rulesets.ts](../../worker/lib/rulesets.ts)、[规则集保存入口](../../worker/routes/rulesets.ts) | _sing_sub 含 note/manual/sources；来源含 url/interval_hours/last_updated；保存时刷新来源，没有后台定时刷新 |
| [builder.ts](../../worker/lib/builder.ts)、[compiler-source.ts](../../worker/domain/rulesets/compiler-source.ts) | 最终配置目前删除特定位置的 note/_sing_sub；规则编译出口只取 version/rules；任意 headers 映射中的同名字段属于合法业务数据 |
| [export-workspace.ts](../../worker/application/sync/export-workspace.ts)、[import-sync-tree.ts](../../worker/application/sync/import-sync-tree.ts) | Profile 整体导出；资源只导出 content，所以包装层时间不会同步 |
| [sync-workspace.ts](../../worker/application/sync/sync-workspace.ts) | 旧 base 通过重新导出历史快照校验 hash；必须保留旧格式投影 |
| [r2-object-keys.ts](../../worker/infrastructure/r2/r2-object-keys.ts)、[r2-workspace-store.ts](../../worker/infrastructure/r2/r2-workspace-store.ts) | 业务数据以完整 immutable revision/head CAS 保存；FileContent.sha 实际为工作区 revision |
| [session](../../src-react/stores/session.ts)、[assets](../../src-react/stores/assets.ts)、[sync](../../src-react/stores/sync.ts)、[AppShell](../../src-react/app/shell/AppShell.tsx)、[theme](../../src-react/theme/theme.ts) | 临时请求/检查状态在内存；主题、语言、侧栏折叠在浏览器 |

## 3. 文件方案：每个工作区一个 metadata.json

### 3.1 GitHub/可移植同步格式

```text
sing-sub/
  configs/<name>.json           # 纯 Profile 定义，不是最终 sing-box 配置
  nodes/<name>.json             # 用户业务 JSON，管理字段已分离
  templates/<name>.json         # 用户业务 JSON，管理字段已分离
  rulesets/<name>.json          # version/rules 正文
  metadata.json                # 唯一的业务管理元数据文件
  manifest.json                # 已有机器生成的同步清单
```

不另建 resource-metadata.json、profile-meta.json、各类型 meta、逐实体 sidecar 或来源 meta 文件。manifest 的职责是文件清单、大小和 hash，不复制备注/排序等管理内容；它不是第二个业务元数据文件。

metadata.json schema v1 示例（hash 为格式示意）：

```json
{
  "schemaVersion": 1,
  "entities": {
    "sing-sub/configs/home.json": {
      "contentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "note": "日常使用",
      "order": 0,
      "createdAt": "2026-10-15T02:00:00.000Z",
      "updatedAt": "2026-10-16T02:00:00.000Z"
    },
    "sing-sub/templates/base.json": {
      "contentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "note": "通用模板",
      "order": 0,
      "updatedAt": "2026-10-16T02:00:00.000Z",
      "display": { "outboundOrder": ["proxy", "direct"] }
    },
    "sing-sub/rulesets/ad.json": {
      "contentHash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "note": "广告规则",
      "order": 0,
      "editor": {
        "ruleset": {
          "manual": { "domain": ["example.com"] },
          "sources": [
            { "url": "https://example.com/rules.json", "intervalHours": 24 }
          ]
        }
      }
    }
  }
}
```

这里的 note/order/时间为通用管理字段，display 是展示偏好，editor 是恢复编辑过程必需的定义。来源成功更新时间可选保存为 sources[].lastFetchedAt；它是历史观测值，不表示当前部署已经执行过抓取。来源地址、周期、顺序和手写规则不是可随意丢弃的展示状态，即使它们位于同一元数据文件也有独立类型和保存规则。

不保存可从路径推导的 kind/name，不新建 UUID/路径双重映射。元数据数量随实体记录增长，文件数量固定为一个。保留嵌套分区的可读格式，不把每个字段变成一个文件，也不使用任意自定义扩展属性袋。

### 3.2 在线 R2：一个 snapshot 内分区，避免额外写入事务

```text
workspaces/primary/
  head.json
  revisions/<revisionId>.json    # definitions/assets 与 metadata 分区，原子发布
  private/credentials.json
  jobs/<jobId>.json
  artifacts/srs/<id>/<hash>.srs
```

新快照 v4 内保留 Profile 纯定义与资源纯 content，并新增唯一 metadata 区（schemaVersion/entities）。不再在 profiles 和 JsonAsset 包装层保留 note/order/更新时间的持久化副本。path 仍是资源定位信息；类型从集合/路径确定。

GitHub metadata.json 由此区序列化导出，不再在 R2 额外写一个 metadata.json 对象。内容/元数据分区与 settings/builds/sync 等原运行字段同处 immutable revision；保存成功仍仅以 head CAS 为准。

contentHash 为同步表示中根据正文生成的只读完整性字段，不在 R2 元数据区再缓存一份。共用 EntityMetadata schema，导出层只扩展正文版本绑定字段；不要为每个文件建立独立存储服务。

## 4. 哪些进入统一文件，哪些不进入

| 数据 | 唯一权威位置/同步表示 | 本版处理与理由 |
|---|---|---|
| Profile 的名称、节点/模板引用、rules/inboundRules | 纯 Profile 定义 / configs JSON | 业务管理定义，构建需要；不混进 metadata |
| Profile 管理 note/order/created_at/updated_at | metadata.entities[配置路径] | 从原定义迁移；时间统一为 UTC ISO，保留已知时间值 |
| 节点/模板/规则集业务字段和数组 | 资源 content / 原资源 JSON | 保持字段/数组顺序及合法嵌套业务键 |
| 资源管理备注、已知 updatedAt、资源排序 | metadata.entities[资源路径] | 跨端保留，去掉正文和包装层的重复存储 |
| 模板筛选卡片展示顺序 | 同一实体的 display.outboundOrder | 按模板共享；不改变 Profile.rules 或业务数组顺序 |
| 规则集手写输入、来源 URL/周期/顺序 | 同一实体的 editor.ruleset | 从 _sing_sub 分离，但保留恢复编辑能力；仅公开 version/rules |
| 来源已知 last_updated | 同一 source 的 lastFetchedAt | 迁移已有值，保存成功观测历史；不当作资源修改时间或调度承诺 |
| 根与明确 inbounds/outbounds 对象上的管理注释 | 同一实体的 editor.annotations | 仅对已定义的管理位置做类型化提取，见下文迁移规则 |
| revision/head 身份、hash、createdAt/updatedAt | 原 R2 revision/head | 事务/历史协议，不可移植，不进入 metadata.json |
| sync 状态、base revision/commit/hash/repo、baseFormatVersion | 原 revision.sync | 与当前部署/仓库绑定，不能从业务备份直接恢复运行基线 |
| userLogin/avatar、owner/repo/branch、authVersion/tokenVersion | 原 settings/连接位置 | 保持部署身份和安全协议，不随业务拉取覆盖 |
| PAT、连接/编译器启用及安装状态、workflowHash/errorCode | 原 private/credentials.json | 部署级设置和秘密，不能通过统一文件导出 |
| build/job 状态、attempts、sourceHash、activeArtifact、二进制 | 原 builds/jobs/artifacts | 有独立完整性和生命周期，不能从 GitHub 导入 ready 状态冒充可用 |
| 现有 migration 溯源、R2 对象 customMetadata | 原 revision/存储层 | 历史与基础设施索引，不作为业务编辑数据重新导入 |
| 语言/主题/侧栏折叠 | 浏览器 localStorage | 设备偏好；电脑和手机可不同 |
| 旧资源/筛选排序键 | 显式导入前暂留 localStorage | 成功后清理，不长期双写 |
| Cookie、订阅 token/链接、ticket、signing secret | 原签名 Cookie/secret/派生协议 | 不备份为业务字段，不存入 metadata 或 localStorage |
| loading/saving/dirty/错误、未保存编辑/排序草稿、Modal/Accordion/选择/搜索 | 内存 | 生命周期临时状态，本版不加草稿同步 |
| lastCheckedAt、请求 promise、匹配列表、数量、Badge/格式可用性、相对时间 | 内存/计算 | 可可靠推导，不增加持久化失效成本 |
| FileContent.sha、HTTP ETag/Git blob SHA、差异列表、预览/订阅缓存 | 协议上下文/原 Cache API | 不是实体元数据，不复制到统一文件 |

不新增资源 createdAt、访问统计、修改人、设备历史、收藏/颜色/任意标签、删除墓碑或永久审计日志。Profile 已知创建时间保留，不据此回填所有资源的创建时间。来源已知时间保留，新增未知值留空。

private.updatedAt、revision/head 时间、实体修改时间、source.lastFetchedAt 和 build/job 时间各有语义，不合并为一个万能更新时间。

## 5. 防止元数据进入产物

- Profile builder 只接收 ProfileDefinition 和纯资源加载器；不接收整个 workspace 或 metadata 文档。共用的预览/订阅出口使用同一边界，元数据不能因对象 spread 被带入输出。
- 规则编辑保存流程可以显式读取 editor.ruleset 计算新的 version/rules；公开 JSON 与 SRS compiler 只接收计算后的正文。重构输入边界，不改变手写/来源合并规则、sourceHash 定义或编译协议。
- 节点/模板管理位置上的 note/_sing_sub 从正文分离后，新增编辑数据在保存边界校验，不能依赖最后一步递归删字段。保留针对已定义管理位置的输出防御断言和回归测试。
- 不建立“所有 sing-box 字段完整白名单”来截断用户自定义业务 JSON，也不递归删除任意 note/_sing_sub；transport.headers 等映射内的同名键必须原样保留。
- 给每类管理字段放入可识别测试值，验证预览、订阅、公开规则集 JSON、SRS 输入均无泄漏，同时验证 headers 等合法同名业务字段不丢失。

子对象管理注释优先按方向（inbound/outbound）与已有唯一 tag 关联，存于 editor.annotations；不直接按数组索引挂备注，避免重排错位。没有唯一 tag、存在未知保留字段或多处备注冲突时，迁移 dry-run 必须列出歧义并阻止该次转换，不能删掉、猜测或新建通用任意属性袋。修复输入后再迁移；历史 revision 原样保留。

## 6. 保存规则与降低维护成本

### 6.1 一份数据、局部 command、一次提交

前端不上传整个 metadata.json 覆盖所有实体。只通过 src/api 的 typed command 保存当前实体或当前类型完整排序，携带 expectedRevision；服务端读取现有快照，只更新目标记录，严格校验允许字段，保留其他实体信息。

正文+备注/编辑定义在同一业务 command 中保存到同一 revision；排序 command 只改 order/display，不刷新来源、不 dispatch SRS、不提交尚未保存的 Profile 草稿。新建同时建立记录，改名原子迁移路径键，删除同时移除记录；不维护额外索引或独立元数据 GC。

同一字段只有一个持久化权威。前端卡片、表单、资产摘要所需的扁平视图在 API/selector 中组合，不把兼容显示对象再持久化为正文。迁移结束后停止旧混合格式双写。

排序 order 为同类实体内的非负整数，明确保存时生成连续值；缺失/重复使用固定的稳定路径比较兜底，不依赖对象键顺序或设备语言。新增追加，改名保留，删除不改其他实体时间。模板 display 数组只控制展示，清理无效 tag，新项追加。

### 6.2 时间各司其职

| 操作 | 元数据时间规则 |
|---|---|
| 新建/复制 | 服务端生成 updatedAt；Profile 同时生成 createdAt，新实体不继承原创建时间 |
| 改正文、备注、名称或有效编辑定义 | 服务端更新 updatedAt，保留已有 createdAt |
| 仅排序/展示顺序、无实际变化重复保存 | 保留实体时间；revision/head 操作时间可变化 |
| 来源成功刷新 | 保存 lastFetchedAt；只有实际规则/编辑定义变化才更新实体时间 |
| 来源失败或 head CAS 冲突 | 不部分落入正文/元数据，不伪造成功观测时间 |
| SRS job/回调/重试 | 只更新对应运行状态时间 |
| 同步/恢复 | 保留已知内容版本时间，不把操作时刻填成实体修改时间 |

服务端维护正常保存时间，普通客户端不得直接覆盖；历史导入单独校验，不作为可信审计证据。旧 Profile 毫秒时间无损转换为 UTC ISO；缺失保持缺失，异常值出报告，不以当前时间回填。

修改判断包含有效 editor 定义和备注，排除 order/display/观测时间；不能因为正文 JSON 没变就忽略 manual/sources 编辑变更。现有保存时抓取来源的行为保留，不新增 Cron 或自动调度。

### 6.3 一个 schema 和少量明确边界

共用 EntityMetadata 的基础字段，display/editor 使用固定类型、按路径类型约束。只在新增已批准字段或不兼容语义时演进文档版本，不给每个实体一份 schema。一个编解码边界负责纯正文与元数据组合，一个同步表示负责导出，避免 JSON.stringify 散落后各自过滤字段。

当前一个管理员、primary 工作区、约 2–3 MiB、低频保存适合单文件。若将来出现多人高频并发或达到既有 32 MiB 架构复审阈值，再评估拆分；本版不预建分片、锁服务或数据库。单文件 Git 冲突通过稳定键序、清晰差异和现有整侧覆盖处理，不承诺自动合并。

## 7. 同步格式和一致性

- metadata.json 对新格式为固定控制文件，即使 entities 为空也生成；manifest 继续独立，两个控制文件不计入 200 个业务实体，但均受 4 MiB 单文件/32 MiB 总量约束。路径稳定排序、两空格、LF、末尾换行，不写逐次 exportedAt/lastSyncedAt 到实体元数据。
- records 必须关联存在的受管 Profile/资源，路径和类型严格校验；拒绝未知字段、重复原始 JSON 键/路径/大小写身份碰撞、非法时间、非法 display/editor 类型和超限。
- 内容文件仍保留业务字段与数组顺序。contentHash 对应纯定义/正文的标准化输出，不是 Git SHA、R2 revision 或 SRS sourceHash。它是内容版本检查，不用于判断谁较新。
- 正文+metadata+manifest 在一次 Git tree/commit 中发布，不 force push、不触碰其他路径。同步差异应显示正文与元数据影响；仅备注/排序变化也必须能同步。
- manifest 是生成清单，不决定 IDE 修改后的远端真相。旧基线按 v2 导出器验证，新的 manifest/同步表示 v3；sync.baseFormatVersion 缺失按 v2，成功后记录采用格式，不重置旧 base 绕过冲突。
- 新旧格式结构差异是一次真实变更，首次升级同步明确展示。旧 B、旧远端和新的纯正文/metadata 比较使用版本化投影；不能用新投影与旧 base hash 直接比较而误报损坏。

| 情形 | 处理 |
|---|---|
| 新格式记录和正文 hash 匹配 | 导入管理信息，按类型恢复 editor 能力 |
| IDE 改正文，hash 不匹配 | 保留有效备注/排序；旧 updatedAt 不再冒充新版本时间；有本地完全相同正文时可用该版本已知时间，否则未记录 |
| hash 不匹配且规则集 editor 已不能解释正文 | 标记编辑来源待确认，不自动用旧来源/手写输入覆盖当前 rules；可预览纯正文，结构化再生成前明确选择保留正文为手写基线或采用已有来源定义 |
| 模板 tag 被改/删 | 清理失效 display；有管理注释无法唯一关联时保留并提示，不悄悄附到别的对象 |
| 手动删除实体但留下记录 | 忽略孤立记录并 warning，下次导出清理；不靠元数据重建实体 |
| 新格式漏掉尚存实体的记录 | 拒绝不完整导入；可选字段省略表示无值，实体记录本身必须存在 |
| 已有新格式/base v3 或有效 v3 manifest，metadata 文件缺失/损坏 | 阻止导入并指出恢复文件路径，不能按空数据清掉备注、来源和手写编辑定义 |
| 旧 v2 混合格式且没有 metadata | 通过显式旧格式转换器提取正文与元数据，不当作新格式元数据删除 |
| 两侧同时变化 | 延用整体 B/L/G 和明确覆盖方向，不按时间戳选赢家、不增加逐字段自动合并 |

导入远端原树 hash、落入 R2 的校验结果和下一次导出分开处理。剔除陈旧时间或清理孤立项要暴露本地待同步修正，不能伪造远端 hash、静默覆盖 IDE 修改或形成循环差异。非法结构不能自动降级为空 metadata。

## 8. 升级、恢复和回滚

新写 workspace schema v4，读取兼容历史 v3/v4。v3 的原始 schema/hash 校验后，通过类型化转换得到分离视图；读取不写 R2、不改历史。在明确保存时才发布 v4。

迁移从 Profile 提取 note/order/时间，从资产提取顶层管理备注及已定义子对象注释，从 _sing_sub 提取规则编辑定义与已知来源时间，从包装层提取 updatedAt；纯正文保持业务字段和数组顺序。记录冲突、未知管理字段或无唯一 tag 不能无声丢弃，必须有 dry-run 报告和阻断测试。旧顺序 localStorage 只由用户明确选择导入，成功后清理，不让旧设备自动覆盖。

兼容读/旧同步导入集中在转换边界，不在每个 feature 中散落两套判断。原 v3 混合表示和新 v4 分离表示都必须能够用于历史读、restore、recoverHead、retention 和 sync base 校验；前端只用规范化的新视图。

| 恢复来源 | 可恢复 | 不包括 |
|---|---|---|
| GitHub 纯正文 + metadata + manifest | Profile/资源、备注/时间/排序、来源/手写规则编辑能力 | 凭据、Cookie、部署身份、安全版本、旧同步基线、编译器安装状态、job、SRS 二进制 |
| 同部署 R2 revision | 同一快照正文与元数据、原 settings/运行摘要 | 外部 private secret、已经清理的 artifact/job；引用须校验 |
| 原运维备份 | 按既有对象/secret 恢复流程 | 本版不创建把秘密打包入业务同步的新功能 |

正文与 metadata 必须同批恢复。新部署恢复后重新建立连接与同步基线，按内容 reconcile 派生构建。旧代码回滚须配套恢复兼容 current/previous、sync base 和远端 v2 树；不能只回退代码。先在隔离副本演练，不自动修改生产 R2 或执行部署。

## 9. 范围和实施状态

本版统一分离 Profile/资源管理信息，迁移规则集编辑定义，提供一个 metadata 文件和一个快照内 metadata 区；保留原 revision/CAS、同步覆盖、来源合并结果和 SRS 运行协议。与较小的增量排序方案相比，这是数据格式升级，需要迁移和输出隔离测试，不只是 UI 改动。

不建立多个元数据文件、不长期混合格式双写、不导出部署/临时状态、不新增访问统计/资源创建时间、不实现实时同步、多人审计、自动合并、来源调度、分片数据库或新运行时依赖。保持现有包体积预算。

用户已批准；现行架构、验证结果与运维说明已更新，交付证据见 [当前进度](./progress.md)。

兼容代码仅服务 3.1.6，本机排序导入与旧格式读取在 3.1.7 按[退场清单](./metadata-compat-retirement.md)移除。
