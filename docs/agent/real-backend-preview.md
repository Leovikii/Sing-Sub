# 真实后端本地预览

使用当前工作区的 React 源码连接 `https://ss.vkio.org`，无需部署本地修改：

```text
npm run dev:real-backend
http://127.0.0.1:8787/#/connect
```

需要核对生产构建的代码分块与运行时性能时，先构建并以相同只读代理启动：

```text
npm run preview:real-backend
http://127.0.0.1:8787/#/connect
```

`preview:real-backend` 直接服务 `dist`，不得用尚未重新构建的输出做性能结论。

该入口只监听 `127.0.0.1`，固定代理到正式后端，不接受可配置的任意上游。管理员口令由用户直接输入浏览器，不写入仓库、命令行或日志。

安全策略：

- 转发 `GET`、`HEAD`、`OPTIONS`，用于读取 bootstrap、设置、资源、Profile、GitHub sync 与 SRS 状态。
- 额外转发 `POST /api/login`、`POST /api/logout` 与不持久化的 `POST /api/preview`。
- 阻止设置、文件、Profile、sync、Ruleset build 等持久化或操作性写请求并返回 HTTP 403。
- 不得为方便测试静默放开写请求；真实数据写入需要用户对具体操作重新授权。

验证完成后使用 `Ctrl+C` 停止服务。该工具不替代隔离 staging，也不改变 Worker、Cookie、R2 或 revision 语义。

## 新版后端的隔离保存验收

正式后端未部署新增摘要字段时，只读预览会显示时间未记录。验证保存后的修改时间应使用新版 Worker 的本地模式，不放开正式代理写入。

本轮独立预览位于 http://127.0.0.1:8788 ，使用 .wrangler/resource-preview/wrangler.json、该目录下独立 .dev.vars 以及 state；绑定只运行 local 模拟，不读取原有 .wrangler/state 或生产 R2。示例数据为合成的节点、模板与手写规则。该目录已由 Git 和 lint 忽略，不提交测试口令与密钥。
