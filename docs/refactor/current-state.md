# 当前基线

记录日期：2026-07-14。

本文件描述重构前现状，不代表目标架构。最终目标已锁定为：R2 Standard 唯一持久化、Workers Cache API 可丢弃缓存、签名 Cookie 会话、GitHub Actions 无状态编译、GitHub private 可选同步。详见 `data-architecture.md`。

## 仓库概况

- Vue 3 + Vite 8 + TypeScript 6 + Tailwind CSS 4。
- Cloudflare Worker 作为 API、订阅构建和 GitHub 访问层。
- Cloudflare KV 同时保存 session、GitHub 凭据、订阅映射、配置缓存和 dashboard snapshot。
- GitHub 作为配置和资产持久化来源。
- GitHub Actions 负责把规则集 JSON 编译为 SRS。
- 当前约 66 个受 Git 跟踪文件，没有有效测试文件。

## 已确认的高风险问题

### 仓库写入

- 配置保存没有携带读取版本，远端修改可能被静默覆盖。
- 配置 snapshot 没有 TTL 或 ETag，外部 GitHub 修改可能长期不可见。
- 文件重命名不验证源 SHA，也不验证目标路径不存在。
- 创建文件遇到同名文件时可能自动转为覆盖更新。
- `commitMultiFiles` 只能发现提交过程中的 branch race，不能发现用户编辑期间的陈旧数据。
- `putFileContent` 在探测文件时捕获所有异常，错误语义不可靠。

### GitHub 管线耦合

- `worker/lib/github.ts` 同时负责 HTTP、重试、编码、Contents API、Git Data API 和提交策略。
- 规则集保存同时负责规则刷新、文件提交、编译产物删除、GitHub Actions 工作流同步和缓存失效。
- `fetchRawFile` 绕过统一 GitHub 客户端的超时、重试和错误映射。
- route 直接识别 `GithubApiError`，基础设施错误扩散到 HTTP 层。

### 前端

- `App.vue` 同时管理认证、导航、配置列表、资产缓存、草稿、删除队列、冲突弹窗、通知和保存编排。
- `AssetManager.vue` 直接使用 `fetch`，绕过 `useApi` 的认证和错误处理。
- `Button`、`ToolbarButton` 和多个手写按钮拥有不同状态、尺寸与颜色语义。
- Dialog、Popover、Select、Toast、焦点管理和 body scroll lock 存在重复实现。
- `src/components/ui` 混合基础控件、复合模式和业务编辑器，没有清晰层级。
- 前端大量使用 `any`，API client 的通用返回值也是 `any`。

### 契约与错误

- `Profile`、`StateData` 等类型在前后端重复定义。
- API 输入主要通过 TypeScript assertion 读取，没有完整运行时校验。
- Worker 返回中英文混合的自由文本错误，无法可靠支持多语言。
- Worker 顶层将部分客户端输入错误转换为 500。

### CI 与测试

- `npm run build` 通过，只覆盖 Web TypeScript 和 Vite 构建。
- Wrangler dry-run 通过，证明 Worker 可以被打包。
- 独立 Worker TypeScript 检查发现源码错误，但现有 CI 不会执行该检查。
- CI 没有 lint、单元测试、Worker 集成测试或浏览器测试。

### 会话与存储

- GitHub 设置以 `owner/repo` 为键，session 只保存 `owner/repo`。
- 多个 session 连接同一仓库时会共享最后保存的 PAT 和设置。
- 一个 KV namespace 承担多种数据职责，key 与清理规则分散在多个模块。

## 应保留的现有能力

以下实现方向正确，重构时应迁移而非重写行为：

- 受管理资产路径的集中校验。
- 远程规则集 HTTPS、私网地址、重定向和响应体大小限制。
- GitHub GET 请求的有限重试与超时。
- 多文件使用 Git tree/commit 形成单次原子提交。
- branch 更新使用 `force: false`。
- 资产缓存的 ETag、TTL、revision 和并发失效策略。
- `buildProfile` 已支持注入资源加载器，可作为领域逻辑测试边界。
- 批量构建先全部成功再发布 KV，避免半更新。
- CodeMirror、Lucide 和 `vuedraggable` 符合现有需求。

## 重构期间的基线要求

- 每次阶段完成后，当前登录、配置增删改、资产增删改、预览、订阅和规则集下载行为不得无意退化。
- 任何已确认风险的临时兼容必须在 `progress.md` 登记删除任务。
- 不将 `dist`、Wrangler 临时产物或全仓格式化噪音提交到重构 PR。

## 已锁定的迁移终点

- 日常 Profile、Asset、Ruleset CRUD 不调用 GitHub。
- 现有 GitHub 文件在 Phase 3 通过显式 dry-run 导入为首个 R2 workspace revision，并使用条件写入发布 head。
- 不维护 R2/GitHub 长期双写；GitHub 只保留主动 sync/backup。
- SRS 由 GitHub Actions 编译，通过 Worker callback 写入 private R2。
- KV binding 已在迁移完成后删除；热点响应只使用可丢弃的 Workers Cache API。
- 新部署默认创建空 R2 workspace，GitHub 导入与后续同步均为可选功能。
