# 独立 Release 分发与部署自动化设想

状态：`DEFERRED`。归属 Phase 9 的通用 Release setup/update/rollback 自动化；SRS workflow 自动 provision 已提前至 Phase 4，不作为本文件的前置条件。

## 用户设想

- CI/CD 由维护仓库的 GitHub Actions 发布正式 GitHub Release，包括仓库源码、版本信息、校验文件和升级说明。
- 提供面向 Windows 的自动化脚本或程序；用户启动后输入必要信息，即可完成 Cloudflare 登录、资源检查、Secret 初始化和首次部署。
- 工具可以检查并拉取新的稳定 Release，展示变更与兼容信息，经用户确认后构建并发布到其 Cloudflare Worker。
- 工具支持查看当前版本、部署指定版本和回滚，不要求用户手工理解 Worker ID、R2 binding、Wrangler 命令或 signing secret 生成细节。
- 普通用户直接下载 Release，不要求 GitHub fork、Git checkout、合并上游分支或维护源码仓库；fork 只面向贡献者和需要自定义源码的高级用户。

## 建议的职责拆分

### Release CI

Release Action 只负责生成可信发布物，不接触任何用户 Cloudflare 账户：

1. tag/release 触发完整 verify、Worker dry-run 和发布检查；
2. 生成源码归档、版本化 release manifest、SHA-256 checksum、变更说明和兼容范围；
3. 标记最低数据 schema、是否需要迁移、最低 Wrangler/Node 版本和已知回滚限制；
4. 发布可独立下载的 GitHub Release，不自动部署任何用户的生产 Worker。

### Windows 部署助手

首次部署流程：

1. 检查运行环境与网络，调用 Wrangler 官方 OAuth 登录；
2. 选择 Cloudflare account、Worker 名称、R2 bucket 和 workers.dev/custom domain/Route；
3. 交互输入管理员口令，在本机内存生成两个独立 signing secret；
4. 创建或确认 R2、上传 Secrets、执行 dry-run、显式确认后部署；
5. 访问 health/bootstrap endpoint，记录 Worker version ID 和本地非敏感 deployment manifest。

更新流程：

1. 查询稳定 Release channel，展示版本、release notes、schema 变化和风险；
2. 下载并校验 release manifest/checksum，不直接执行未经校验的远程脚本；
3. 检查当前已安装版本和本地部署 manifest；普通 Release 安装目录不承担源码合并；
4. 在部署前执行 verify/dry-run 和必要的兼容检查；
5. 用户明确确认后部署，完成 health check，再记录新旧 Worker version ID。

SRS workflow 的自动 provision、短期 ticket 和 pending ruleset reconcile 属于当前 Phase 4：WebUI 对已连接仓库的显式 SRS toggle 调用 Worker command，Worker 自动完成模板 upsert、权限验证与 dispatch。Phase 9 助手只复用该产品能力，不再承担 GitHub Secret/Variable 配置。

回滚流程：

- 应用代码优先使用 Wrangler version rollback 或重新部署指定 Release。
- R2 数据回滚与 Worker 代码回滚分离；涉及 schema migration 时必须声明向前/向后兼容范围。
- 工具不得删除 R2 bucket、覆盖业务数据或修改用户源码仓库来模拟回滚。

## 安全与行为边界

- 维护者开发部署可由其拥有的 `main` 分支自动发布；该约定不扩展到 Release 用户部署。
- 对 Release 用户，上游更新通知或发现新 Release 都不得自动改动其生产部署。
- Cloudflare OAuth/API token、管理员口令和 signing secret 不进入命令参数、日志、release、GitHub issue 或本地明文 manifest。
- Release Action 不持有用户的 Cloudflare token、Worker Secret、R2 credential 或 GitHub sync PAT。
- 首次部署、更新、数据迁移和回滚是四个显式操作，不能由一个不可中断的脚本混合完成。
- 工具失败时保留当前生产版本和 R2 head，不执行破坏性清理。
- GitHub sync 数据仓库与应用代码 Release 是两个独立来源，不能因为更新应用代码而修改用户业务数据仓库。
- 官方发布与部署助手不要求用户 fork，也不把用户 Cloudflare 配置回传到维护仓库。
- 浏览器 WebUI 只调用已认证 Worker 的 enable/disable/status API；PAT 始终保留在 R2 private metadata，ticket 只在 Worker 与私有 Action run 间短期流转，浏览器不读取 PAT 或 ticket。

## 当前重构需要预留的契约

- 应用版本、Worker version、workspace `schemaVersion` 和 migration version 可被工具读取。
- schema migration 幂等、可测试，并声明最低兼容应用版本。
- 提供不泄露数据的 health/version endpoint，用于部署后验证。
- Wrangler 配置和资源命名可参数化，不能把维护者的 account、domain 或 bucket ID 固化进发布物。
- Release manifest、checksum 和回滚说明在 Phase 8 发布收尾时确定。

## Phase 9 再决定

- 先交付 PowerShell + Node CLI，还是直接制作带界面的 Windows 可执行程序。
- GitHub Release asset 的具体结构，以及是否需要独立 release feed/channel。
- Release 签名只使用 checksum，还是增加 Sigstore/GitHub artifact attestation。
- 高级用户自定义源码与普通 Release 安装是否完全分为两种模式；默认部署助手不负责源码合并。
- stable/preview channel、自动检查频率、代理支持和离线安装包。
- 多 Cloudflare account、多部署、custom domain 和现有资源接管的交互模型。
- Phase 9 助手如何展示已有 SRS enablement status、如何协助诊断 PAT 权限和 Action 失败；不再管理 GitHub Secret/Variable。

默认倾向是先实现可审计的 Node CLI 与薄 PowerShell 启动器，验证流程稳定后再评估 GUI/单文件程序；最终选择在 Phase 9 开始时另建 ADR。
