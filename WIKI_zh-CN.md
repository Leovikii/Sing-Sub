# Sing-Sub 使用指南

[English](WIKI.md)

## 数据模型

配置、节点集、模板、适配器和规则集都存储在私有 R2 workspace 中。GitHub 是可选能力，只会在用户显式导入、推送、拉取或启用 SRS 编译时参与。

每个配置动态组合以下内容：

1. workspace 模板；
2. 可选的查找替换适配器；
3. 筛选后的入站和出站节点。

保存资源会发布新的 immutable workspace revision。配置订阅从 current revision 动态构建，并可使用 revision-aware Cache API 加速。

## 适配器

适配器只执行完整替换。每条 replacement 指向模板中已经存在的字段；带 `match` 时，目标必须是数组，并且必须恰好找到一个浅层字段匹配项。

```json
{
  "schemaVersion": 1,
  "name": "momo",
  "replacements": [
    {
      "path": ["inbounds"],
      "value": []
    },
    {
      "path": ["route", "rules"],
      "match": { "action": "hijack-dns" },
      "value": { "inbound": "dns-in", "action": "hijack-dns" }
    }
  ]
}
```

路径不存在、没有匹配项、匹配到多个元素或匹配目标不是数组时，构建会直接失败。适配器不执行合并、追加、删除、表达式，也不会创建缺失字段。每个新 workspace 都会创建一个可编辑的 Momo 预设，用户可以复制它来创建其他适配器。

## 规则集

规则集源 JSON 通过 `/rules/{name}.json` 公开分发。连接私有 GitHub 仓库并启用 SRS 编译器后，Worker 会自动安装编译 workflow，并把 immutable SRS artifact 存入 R2；完成后通过 `/rules/{name}.srs` 分发。

规则集导入 URL 独立校验 HTTPS、重定向次数、私网地址、超时、UTF-8 和大小。Profile 模板不支持外部 URL。
