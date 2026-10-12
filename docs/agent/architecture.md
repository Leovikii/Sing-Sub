# 目标架构

## 系统边界

```text
Browser
  -> React route/page
  -> feature component/hook
  -> Zustand store or local form state
  -> typed API client
  -> Worker HTTP route
  -> application command/query
  -> domain/store port
  -> R2/GitHub infrastructure adapter
```

`shared`、Worker application/domain/infrastructure、HTTP API 和 R2 数据模型不因 3.1 前端迁移改变；3.1.2 适配器移除是 ADR-061 单独批准的功能/数据格式变更。React 只能依赖 shared contract 和 `src/api`，不得导入 Worker 实现。

## 3.1 目录

```text
src/
  api/                     # framework-neutral typed client
  i18n/messages/           # 中英文共享词条
src-react/
  app/                     # Provider、Router、全局错误边界
  api/                     # 复用或转出 framework-neutral typed client
  components/              # 项目语义组件；不包装 Mantine primitive
  features/
    auth/
    profiles/
    resources/
    settings/
    sync/
  i18n/
  stores/
  theme/
  main.tsx
index.html                 # 唯一生产与本地前端入口，挂载 React
shared/                    # 浏览器与 Worker 共用 contract/schema
worker/                    # 后端保持分层结构
```

`v3.1.0` 的默认入口直接指向 `src-react/main.tsx`。旧 Vue、PrimeVue、Pinia、Vue Router、Vue I18n、Tailwind、vuedraggable 与迁移期双入口均已删除；`src-react` 作为明确的浏览器 UI 边界保留，`src/api` 与 `src/i18n/messages` 继续提供框架无关共享模块。精简 CodeMirror 6 只作为非规则集资源进入编辑态后的二级懒加载边界，不进入认证首屏、资源列表或预览态。

## 前端职责

- `app`：只组合 Provider、Router、全局通知/Modal 容器与错误边界。
- `api`：浏览器唯一网络出口，处理 envelope、401、AbortSignal 和稳定错误码。
- `stores`：只存跨页面服务器状态；表单 draft 留在 feature hook 或 Mantine form。
- `features`：按用户能力组织页面和局部状态，不感知 R2/GitHub 基础设施。
- `components`：只保留具有业务语义或第三方边界价值的共享组件，不包装 Mantine primitive。
- `theme`：Mantine theme、颜色方案 manager 和少量全局 token。

## 保留的专业依赖

- CodeMirror 6 官方模块：通用 JSON 编辑的行号、高亮、括号匹配、lint、历史和原生查找/替换；由 Mantine 提供外层工具栏与加载态，不使用第三方 React wrapper。
- Lucide React：统一语义图标。
- dnd-kit：Profile 排序；Mantine 不提供拖拽排序。
- Zod：共享运行时 schema 和表单验证。

