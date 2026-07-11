# Sing-Sub

[English](README.md)

Sing-Sub 是一个自托管的 [sing-box](https://sing-box.sagernet.org/) 配置管理与分发控制台。它以 GitHub 作为配置源，以 Cloudflare Workers 在边缘构建订阅，并提供面向日常运维的 Web 界面。

## 项目作用

- 在一个界面中管理多个配置、节点集、模板、补丁与规则集。
- 根据模板、筛选后的节点和补丁构建配置 JSON。
- 通过 /sub/{token}/{profile}.json 分发 sing-box 订阅。
- 通过 GitHub Actions 将规则集 JSON 编译为 .srs，并从 /rules/{token}/{ruleset}.srs 分发。
- GitHub PAT 仅保存在 Cloudflare KV 服务端；浏览器只持有安全会话 Cookie。
- 提供可视化编辑、JSON 语法校验、冲突处理，以及桌面和移动端导航。

## 架构

~~~
浏览器界面 -> Cloudflare Worker + KV -> GitHub 配置仓库
                                      -> GitHub Actions（规则集编译）
~~~

Worker 从 GitHub 读取源文件，并按需构建配置订阅。规则集需要生成二进制 .srs，因此由独立的 GitHub Actions 工作流处理。

## 仓库目录

建议使用私有 GitHub 仓库存放配置数据：

~~~
sing-sub/
  configs/                 # 配置源文件
  nodes/                   # 节点集 JSON
  templates/               # 模板 JSON
  patches/                 # 补丁 JSON
  rulesets/                # 规则集源 JSON
    compiled/              # 自动生成的 .srs 文件
~~~

compiled 目录由规则集编译工作流维护，请勿手动编辑其中的 .srs 文件。

## 前置条件

- Node.js 22
- Cloudflare 账户与 KV 命名空间
- 用于存放配置数据的 GitHub 仓库
- 具有 repo 与 workflow 权限的 GitHub PAT
- 可部署 Cloudflare Workers 的 API Token

## 部署

1. 创建 KV 命名空间，并将 ID 写入 wrangler.toml。
2. 在本仓库的 GitHub Actions Secrets 中添加 CLOUDFLARE_API_TOKEN。
3. 安装依赖并完成本地校验：

   ~~~bash
   npm ci
   npm run build
   ~~~

4. 合并到 main。部署工作流会构建项目并发布 Worker。

部署完成后，打开控制台，填写 GitHub owner/repo、PAT 与订阅 Token。应用会在首次需要时创建受管理目录和文件。

## CI 与 main 分支保护

.github/workflows/ci.yml 会在目标为 main 的 PR 上运行 npm ci 和 npm run build，普通开发分支推送不会触发它。

在 GitHub Ruleset 中将 CI / typecheck 添加为 Required Status Check，并启用“合并前要求分支保持最新”。流程如下：

~~~
提交 PR 到 main -> CI 通过 -> 允许合并 -> 推送到 main -> 部署
~~~

部署工作流只会在代码进入 main 后运行，并持有 Cloudflare 部署密钥。PR CI 为只读检查，不接触部署凭据。

## 规则集

首次保存规则集时，应用会在配置仓库创建 .github/workflows/compile-srs.yml。工作流将：

1. 仅编译新增或修改的规则集 JSON；删除规则集时同步删除同名 .srs。
2. 定时任务只下载到期规则集的 HTTPS 来源，校验后仅重建对应规则集。
3. 编译前剔除 _sing_sub 元数据，并使用最新稳定版 sing-box 编译物化后的 version 2 规则集 JSON。
4. 将变更后的来源与产物提交到 sing-sub/rulesets/compiled/。

对应 .srs 尚未成功编译前，规则集 URL 会返回 404。

## 安全说明

- GitHub PAT 仅保存在服务端 KV 中，不会返回浏览器。
- 会话 Cookie 使用 HttpOnly、Secure 与 SameSite=Strict。
- 订阅与规则集接口仅接受受支持的 sing-box User-Agent。
- 订阅 Token 应视为凭据；如发生泄露，请在设置页轮换。

## 开发

~~~bash
npm run dev
npm run build
npm run preview
~~~

补丁语法与详细使用说明请见 [WIKI_zh-CN.md](WIKI_zh-CN.md)。

## 许可证

MIT
