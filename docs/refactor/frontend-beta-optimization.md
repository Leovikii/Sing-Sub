# Phase 9 前端 Beta 优化计划

状态：`DONE`。对应 `progress.md` 的 RF-910，不改变已定稿的信息架构、PrimeVue 技术选型或 API 边界。

## 目标

- 用 PrimeVue 控件与 Tailwind 响应式布局修复 320px 至桌面视口，不引入新依赖或自研基础控件。
- 消除编辑/预览切换、复制反馈和异步状态造成的控件位移。
- 字段使用名词、按钮使用动词；提示只说明风险或限制，不复述控件，也不暴露实现细节。
- 保持配置、资产、规则集、同步和设置的现有功能与路由不变。

## 实施清单

| ID | 状态 | 内容 | 验收 |
|---|---|---|---|
| FBO-01 | DONE | 重构 EditorModal 信息层级和稳定操作区 | 名称/备注明确；编辑/预览/保存/关闭不跳位；320px 无挤压 |
| FBO-02 | DONE | 修复 Profile 选择器、Ruleset 来源栏和 CodeMirror 搜索面板 | 320/390px 无横向溢出 |
| FBO-03 | DONE | 统一移动端页面留白与 44px 触控目标 | 主要按钮、表单、卡片操作可触控 |
| FBO-04 | DONE | 精简中英文登录、设置、Profile、同步和状态文案 | 两种语言 key 对齐；无重复提示与实现术语 |
| FBO-05 | DONE | 缩短配置订阅复制反馈 | `订阅`/`已复制` 不改变按钮尺寸 |
| FBO-06 | DONE | 合并 ruleset 状态与格式链接 | 每张卡片只有一个 `SRS` 或 `JSON` 链接按钮 |
| FBO-07 | DONE | 补充响应式和关键交互 E2E | 320/390/412/768/1024px 自动或浏览器断言通过 |
| FBO-08 | DONE | 完成桌面/移动端中英文浏览器复核 | 无遮挡、溢出、错位或不可达操作 |
| FBO-09 | DONE | 分离侧栏激活与悬停视觉层级 | 激活项只使用主题色背景/文字和字重，无自定义实线或阴影 |
| FBO-10 | DONE | 为同步操作增加互斥忙碌态 | 当前操作显示加载反馈，刷新/拉取/推送在请求完成前全部禁用 |
| FBO-11 | DONE | 统一导航与资产语义图标 | 同步、仓库不再共用 GitHub；节点集、模板、适配器和规则集在导航/卡片中一致 |
| FBO-12 | DONE | 消除暗色模式首帧白闪 | Vue 挂载前同步应用保存/系统主题；`html/body/#app` 同底色与 `color-scheme` |
| FBO-13 | DONE | 消除 Firefox 桌面端页面切换等待 | 删除串行 `out-in` 路由淡出；桌面 Firefox 内容切换 < 130ms |

## 编辑弹窗

桌面使用三列稳定布局：`metadata 1fr | mode auto | actions 1fr`。名称和备注在 metadata 中上下排列；模式切换保持居中；保存和关闭靠右。移动端 metadata 独占第一行，模式和操作进入第二行。

- 编辑态使用有明确 label 的名称和备注输入；备注不显示“可选”等括号补充。
- 名称仅显示用户可编辑部分，不在弹窗标题尾部拼接 `.json`。
- 预览态名称使用主文本，备注作为左对齐弱化辅助文本；空备注不渲染占位文案。
- 保存按钮在编辑和预览态始终存在；无修改或内容无效时禁用，有未保存草稿时可从预览态保存。
- 模式、保存、关闭和内容区域不得因状态文本长度发生位移。

## 移动端布局

- 页面横向 padding：手机 16px、`sm` 24px，宽屏逐级增加。
- 交互目标最小 44x44 CSS px；紧凑编辑工具栏在触屏断点同样遵守。
- Profile 模板/适配器/节点集在手机端使用 label 上、Select 下的纵向布局。
- Ruleset SOURCE 标识/说明和周期/删除操作在手机端分行。
- CodeMirror 搜索面板宽度不得超过可见编辑区域，输入框使用弹性宽度。
- 长仓库名、文件名、备注和英文文案必须截断或换行，不扩大页面 scroll width。

## 文案标准

- 删除登录副标题、语言/外观重复 hint、空备注占位和重复状态说明。
- `输入文件名称`/`输入配置名称` 统一为 `名称`；`配置模板`/`配置适配器` 简化为 `模板`/`适配器`。
- 订阅复制反馈只显示 `已复制`；保存结果统一为 `已保存`。
- SRS 设置只描述“自动生成 SRS 规则集”，不向普通界面暴露 workflow 安装或升级过程。
- 同步状态使用 `从未同步`、`已同步`、`R2 有新修改`、`GitHub 有新修改`；覆盖确认继续明确数据方向。
- Token 轮换、覆盖、字符限制和数据丢失风险不得为了简短而省略关键后果。

## Ruleset 单链接

- 删除独立 JSON 按钮、SRS 按钮和常驻状态 Tag，使用一个短文本格式按钮。
- `formats.binary === true` 时复制 `/rules/{id}.srs` 并显示 `SRS`；否则复制 `/rules/{id}.json` 并显示 `JSON`。
- pending/dispatching/compiling/failed 通过图标、severity 和 tooltip 表达；failed 仍保留独立 retry。
- 降级只发生在 WebUI 选择的 URL；禁止让 `.srs` endpoint 返回 JSON。
- 格式选择只信任后端 `formats.binary`；编译失败时既有 active SRS 按既定保留策略继续可用，UI 同时显示失败状态和 retry。

## 验证矩阵

- `npm run lint`、三套 typecheck、unit、integration、production build、Chromium desktop/mobile 与 Firefox desktop E2E。
- 视口至少覆盖 320x568、390x844、412x915、768x1024、1440x900。
- 中英文分别验证编辑弹窗、Profile 选择器、Ruleset 单链接、同步按钮和设置页。
- 自动检查 `documentElement.scrollWidth <= clientWidth`，并验证关键触控目标、稳定按钮位置和唯一规则集格式按钮。

## 完成记录

- 2026-07-16 完成 FBO-01 至 FBO-08；未增加依赖，未改动 API 或 ruleset endpoint 语义。
- `npm run verify` 通过：107 unit、66 integration、24 Chromium/Firefox E2E，并包括 lint、三套 typecheck 和 production build。
- 浏览器复核覆盖 320x568、390x844、412x915、768x1024、1024x900 与 1440x900，包含简体中文和英文。
- `npm run worker:dry-run` 通过：Wrangler 4.110.0 打包 23 个静态资源（含同源主题初始化脚本），总上传 749.93 KiB / gzip 122.22 KiB，仅识别 `WORKSPACE_BUCKET` R2 binding，未部署生产。
- 追加 FBO-09/FBO-10：侧栏激活态不再被 PrimeVue 外层悬停背景遮盖；同步慢响应期间按钮互斥，强制重复点击仅产生一条请求。
- 追加 FBO-11 至 FBO-13：导航/资产图标按业务语义统一；主题在应用脚本与 CSS 前同步初始化；删除 Firefox 会串行等待的页面 `out-in` 淡出。
