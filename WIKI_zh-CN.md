# Sing-Sub 使用指南

[English](WIKI.md)

## 数据模型

配置、节点集、模板、补丁和规则集都存储在私有 R2 workspace 中。GitHub 是可选能力，只会在用户显式导入、推送、拉取或启用 SRS 编译时参与。

每个配置动态组合以下内容：

1. workspace 模板；
2. 配置 overrides；
3. 可选 workspace 补丁；
4. 筛选后的入站和出站节点。

保存资产会发布新的 immutable workspace revision。配置订阅从 current revision 动态构建，并可使用 revision-aware Cache API 加速。

## 补丁语法

补丁对象会递归合并到选定模板。新字段会加入，嵌套对象继续合并，普通值覆盖模板中的原值。

```json
{
  "log": {
    "level": "warn",
    "timestamp": true
  }
}
```

数组支持四种显式操作符。

### `$set`

完全替换目标值：

```json
{
  "dns": {
    "servers": {
      "$set": [{ "type": "udp", "server": "1.1.1.1" }]
    }
  }
}
```

### `$prepend` 与 `$append`

在现有数组之前或之后插入一个元素或一组元素：

```json
{
  "route": {
    "rules": {
      "$prepend": { "action": "sniff" },
      "$append": [{ "protocol": "dns", "action": "hijack-dns" }]
    }
  }
}
```

### `$remove`

删除匹配的普通值，或删除符合指定字段子集的对象：

```json
{
  "outbounds": {
    "$remove": { "tag": "ads-block" }
  }
}
```

### `$replace`

匹配数组元素后用完整新值替换：

```json
{
  "outbounds": {
    "$replace": {
      "match": { "tag": "proxy" },
      "with": {
        "type": "urltest",
        "tag": "proxy",
        "outbounds": ["node-1", "node-2"]
      }
    }
  }
}
```

需要多次操作时，`$remove` 和 `$replace` 也可以接收数组。保存生产变更前，应在配置预览中确认最终 JSON。

## 规则集

规则集源 JSON 通过 `/rules/{name}.json` 公开分发。连接私有 GitHub 仓库并启用 SRS 编译器后，Worker 会自动安装编译 workflow，并把 immutable SRS artifact 存入 R2；完成后通过 `/rules/{name}.srs` 分发。

规则集导入 URL 独立校验 HTTPS、重定向次数、私网地址、超时、UTF-8 和大小。Profile 模板不支持外部 URL。
