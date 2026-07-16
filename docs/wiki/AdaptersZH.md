# 替换适配器

[English](Adapters)

适配器使用一份共享模板派生目标平台配置。它在入站和出站节点注入前执行，只进行明确的完整替换。

## 格式

```json
{
  "schemaVersion": 1,
  "name": "momo",
  "note": "OpenWrt Momo",
  "replacements": [
    {
      "path": ["inbounds"],
      "value": []
    },
    {
      "path": ["route", "rules"],
      "match": { "action": "hijack-dns" },
      "value": {
        "inbound": "dns-in",
        "action": "hijack-dns"
      }
    }
  ]
}
```

- `schemaVersion` 固定为 `1`。
- `name` 是适配器资源名，`note` 可选。
- `replacements` 包含 1 至 32 条操作。
- `path` 包含 1 至 16 个安全字段名，必须指向已有字段。
- `value` 是完整替换值。
- 可选 `match` 是非空的浅层 primitive 字段映射。

## 替换规则

不含 `match` 时，完整替换 `path` 指向的已有字段。

含 `match` 时，`path` 指向的字段必须是数组。数组中必须恰好有一个元素包含 `match` 的所有 primitive 字段，然后完整替换该元素。

路径缺失、目标不是数组、匹配为零或匹配到多个元素时，构建会失败。适配器不执行合并、追加、删除、缺失字段创建、表达式、脚本或通配符。

## Momo 预设

每个新 workspace 都包含可编辑的 `momo` 适配器。实际预设会：

- 完整替换 `inbounds`，写入 Momo 使用的 DNS、redirect、TProxy、HTTP、SOCKS 和 TUN 入站；
- 在 `route.rules` 中找到唯一一个 `action` 为 `hijack-dns` 的元素，并替换为绑定 `dns-in` 的规则。

在使用共享客户端模板的配置中选择该适配器即可。其他平台需要不同替换时，可复制或新建适配器。适配器应保持简短且只包含目标差异；通用路由、DNS、出站和规则集引用继续在基础模板中维护。

适配器是普通 workspace 资源，会进入不可变 revision 和可选 GitHub 同步，可在**资源 > 适配器**中编辑。

