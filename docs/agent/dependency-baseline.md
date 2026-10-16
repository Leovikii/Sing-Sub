# v3.1 前端依赖与包体积基线

记录日期：2026-07-31
当前状态：`v3.1.0` 使用 React 单入口，并按 ADR-058 完成普通应用、CodeMirror 编辑器与全部客户端 JS 的隔离预算；本文件保留迁移初始数据用于同口径比较。

## 依赖许可

当前前端栈使用 React 19.2、Mantine 9.5、React Router、Zustand、i18next、dnd-kit、Lucide React、Zod 与精简的官方 CodeMirror 6 模块。CodeMirror 及其 Lezer 依赖均采用 MIT 许可证，不需要许可证密钥、资格认证或年度续期；没有引入第三方 React wrapper、`codemirror` 聚合包或 `basicSetup`。

`npm run check:licenses` 扫描 lockfile 中所有非 dev 包，只接受当前审核过的宽松许可证表达式。新增其他许可证时检查会失败，必须先人工阅读发布包条款并更新 ADR，不能仅凭项目主页声明放行。

当前非 dev 包许可证分布：

| 许可证 | 包数量 |
|---|---:|
| MIT | 68 |
| BSD-3-Clause | 1 |
| ISC | 1 |
| 0BSD | 1 |
| Apache-2.0 | 1 |
| MIT OR CC0-1.0 | 1 |

PrimeVue 4 仅在旧 Vue 入口迁移期使用；`v3.1.0-beta.1` 的 manifest 与 lockfile 已不包含 PrimeVue、PrimeUI、Vue、Pinia 或 Tailwind。PrimeVue 5 仍禁止引入。

## 构建基线

使用 Vite 8.1.4 的同一次双入口 production build：

| 入口资源 | 原始大小 | gzip |
|---|---:|---:|
| Vue 入口 JS | 522.91 kB | 139.72 kB |
| React 入口 JS | 547.95 kB | 171.09 kB |
| Vue 入口 CSS | 33.28 kB | 7.09 kB |
| React 入口 CSS | 231.73 kB | 33.90 kB |

React 当前只是未做拆分的平台骨架，gzip JS 比 Vue 入口高约 22%。该值不是切换验收结果；后续必须按路由和重型 feature 懒加载，并在 FE-3151 达到计划中的 JS 增幅门槛。Mantine CSS 是静态样式，不允许为追求复刻旧视觉再叠加 Tailwind 或第二套样式系统。

## 业务迁移后拆包检查点

完成 Profile、资源、Ruleset、Sync 与设置迁移后，已按路由拆分重型 feature；以下为 2026-07-30 同一 Vite 构建结果：

| React 资源 | 原始大小 | gzip |
|---|---:|---:|
| 主入口 JS | 292.13 kB | 90.69 kB |
| Profile feature | 64.89 kB | 21.11 kB |
| Resources/Ruleset feature | 24.32 kB | 8.43 kB |
| Sync feature | 4.43 kB | 1.79 kB |
| React CSS | 231.73 kB | 33.90 kB |

主入口单文件已较未拆分状态下降约 65%，Profile、Resources 与 CodeMirror 均不会在认证首屏执行。最终 FE-3151 仍需以浏览器网络依赖链计算真实首屏传输量，不能只相加构建清单或只看入口单文件。

## Beta 单入口验收

使用 `v3.0.0` tag 与当前 `v3.1.0-beta.1` 分别执行干净 `npm ci` 和 production build：

| 指标 | v3.0.0 | v3.1.0-beta.1 | 变化 |
|---|---:|---:|---:|
| 首屏静态 JS gzip | 248.53 kB | 219.72 kB | -11.6% |
| 全部客户端 JS gzip | 248.53 kB | 394.46 kB | +58.7% |
| 全部客户端 JS 原始大小 | 735.72 kB | 1,220.19 kB | +65.8% |
| 入口 CSS gzip | 8.91 kB | 33.90 kB | +280.5% |

Beta 首屏通过原计划“不高于 3.0 入口 10%”的门槛，并通过路由与 CodeMirror lazy 验证；全量加载所有 feature 后的 JS 未达到“总量增幅不超过 15%”的正式版门槛。`FE-3151` 因此继续为 `IN_PROGRESS`，Agent 风险记录必须保留该已知体积问题，正式版前继续评估 Mantine/CodeMirror 与 feature chunk 成本。

## Beta.2 性能收束

`v3.1.0-beta.2` 曾使用 Mantine `JsonInput` 替换 CodeMirror，并从 production dependencies 移除 16 个 CodeMirror/Lezer/辅助包。补齐轻量查找/替换后的相同 Vite 生产构建口径下，全部 `dist/assets/*.js` 为 283.30 KiB gzip，较 `v3.0.0` 的 248.53 KiB 增加约 14.0%，低于当时的单一 15% 上限 285.81 KiB。该阶段方案已由 ADR-058 取代，数据仅保留作同口径对照。

`npm run check:bundle` 在 production build 后重新 gzip 所有客户端 JS chunk；`npm run verify` 已包含该门禁。主路由、资源、Profile 与其他 feature 继续按需加载，但预算不会因懒加载而忽略任何客户端功能代码。

## Beta.2 DevTools 审计

在 CPU 1×、无网络限速的 localhost 上，以 Wrangler production build、已登录资源页采集 Chrome DevTools trace：

| 指标 | 结果 | 判断 |
|---|---:|---|
| LCP | 554 ms | 良好 |
| INP | 13 ms | 良好 |
| CLS | 0.00 | 良好 |
| 最大关键请求链 | 212 ms | 无需专项优化 |

CSS 与 `theme-init.js` 被工具列为 render-blocking，但预计 FCP/LCP 可节省时间均为 0 ms，因此不建议为该提示增加 preload、内联样式或新的拆包复杂度。Vite + 真实后端对照为 LCP 1553 ms、CLS 0.0001，其中 `/api/bootstrap` 约 1.1 秒；Ruleset build 状态请求约 3.5–4.7 秒但发生在 LCP 后，不属于首屏阻塞。

资源弹窗的预览/编辑切换另以连续 12 个 `requestAnimationFrame` 采样，Dialog 的位置与尺寸误差均不超过 1 px。可见运动来自 Mantine `SegmentedControl` 原生指示器，而非 Modal 外框重排；保留该低成本反馈，不增加自定义动画或强制禁用 transition。以上数据没有 CrUX 实际用户样本，不能替代部署后的真实设备观察。

## 3.1.0 精简 CodeMirror 隔离预算与 DevTools 审计

ADR-058 重新引入官方 CodeMirror 6 模块，但只在非规则集资源进入编辑态时动态加载。2026-07-31 的 Vite production build 与 zlib level 9 门禁结果为：

| 范围 | gzip | 门禁 |
|---|---:|---:|
| 普通应用 JS（不含编辑器专用 chunk） | 283.16 KiB | 285.81 KiB |
| `CodeEditor-*.js` 专用 chunk | 113.53 KiB | 120.00 KiB |
| 全部客户端 JS | 396.69 KiB | 405.81 KiB |

`npm run check:bundle` 要求构建结果恰好存在一个 `CodeEditor-*.js`，并分别检查上述三项。资源列表和预览态的 production 网络记录没有编辑器请求；首次切入编辑态才传输 CodeEditor JS 116,847 bytes 与 CSS 1,226 bytes，localhost 无限速下分别耗时约 9.8 ms 与 3.2 ms。

生产构建通过只读真实后端代理，在 CPU 1×、无网络限速、真实大型节点 JSON 下测得 LCP 1647 ms、冷缓存交互 INP 40 ms、CLS 0.00。LCP 主要等待真实 `/api/bootstrap` 后再呈现资源内容，与编辑器 chunk 无关；CodeMirror 首次建立视口时存在约 120 ms 的内部强制布局，但异步发生在已绘制的固定高度加载区内，没有放大模式切换 INP，也没有改变 Dialog 或标题高度。320×900 下 Modal 为 320×900、页面/Dialog/编辑器外框横向溢出均为 0，搜索面板和全部工具栏控件均在视口内；连续三次关闭并重开后 `.cm-editor` 实例数始终为 1，控制台无 error、warn 或 issue。

## 安全审计状态

干净安装后 `npm audit --omit=dev` 报告 2 个 high，均来自 `react-router-dom -> react-router` 的同一项 RSC Mode CSRF 通告。本项目仅使用浏览器端 `createHashRouter`，没有 React Server Components、server action 或 RSC endpoint，通告描述的攻击路径不可达；当前上游没有可用修复版本。

包含开发依赖的 audit 报告 24 个 high，来源包括 Vite/PostCSS、ESLint/minimatch、Vitest、Wrangler/Miniflare/Sharp 及上述 React Router 通告。它们不进入 Worker 静态资源运行时，但 CI 与本地工具链仍需随上游修复持续升级。禁止使用 `npm audit fix --force` 破坏锁定版本。

## 3.1.6 当前验证

未新增/升级运行依赖。生产 gzip：普通应用 285.03 KiB、CodeMirror 114.80 KiB、总计 399.83 KiB，原预算 285.81/120/405.81 KiB 均通过。使用 Rolldown 原生 `$initial` tag 保持初始依赖聚合，路由和编辑器仍懒加载；Chromium/Firefox 生产交互通过。许可证扫描通过。

隔离 Node codec 对照：14,000 个节点、v3 JSON 2,568,589 bytes、v4 2,568,796 bytes（+207 bytes）。5 轮预热后交替执行 15 轮，读取（JSON parse/schema/整体 hash/新投影）中位 69.36→69.77 ms（+0.6%），发布序列化（schema/JSON stringify/整体 hash/新分离）65.78→66.76 ms（+1.5%）。这是本机 CPU 样例，不代表 Cloudflare 线上延迟；不添加脆弱耗时阈值测试。普通读取仍为 head+revision 两次 get、零 put，保存仍为 revision+head 两次 put，不新增逐实体请求或普通读正文 hash。
