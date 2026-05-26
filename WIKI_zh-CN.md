# Sing-Sub WIKI

[English](WIKI.md)

欢迎查阅 Sing-Sub 的详细文档。本页面包含完整的使用教程以及高级的 Patch（补丁）语法指南。

## 📖 使用教程

Sing-Sub 允许您通过 Web UI 轻松管理存储在 GitHub 中的 sing-box 配置文件。

### 1. 准备工作

*   **准备您的配置仓库**：创建一个私有 GitHub 仓库用于存放配置。在初始阶段，您可以上传您的 `nodes.json` (节点信息) 或 `template.json` (基础模板)。
*   **获取 GitHub PAT**：前往 GitHub Settings -> Developer settings -> Personal access tokens，创建一个具有 `repo` 权限的 Token。
*   **登录**：打开 Sing-Sub 面板，输入您的 `用户名/仓库名`、`PAT` 以及自定义的 `SubToken` (用于生成订阅链接的随机字符串，请妥善保管)。

### 2. 界面导览

*   **配置管理 (Profiles)**：您可以在这里创建多个环境（如 `home`, `office`）。每个配置都由基础模板 (Template)、节点集 (Nodes) 和自定义补丁 (Patch) 动态合成。
*   **资源库 (Assets)**：集中管理您存放在仓库里的 `sing-sub/nodes`、`sing-sub/templates` 和 `sing-sub/patches` 文件。您可以直接在面板里对其进行在线代码编辑。
*   **系统设置 (Settings)**：用于更新您的仓库信息、Token，或安全登出。

### 3. 配置生成逻辑

当您点击“保存”或“刷新”时，Sing-Sub 的边缘计算节点会执行以下构建流程：
1.  **获取基础**：拉取配置对应的 **Template (模板)** 和 **Nodes (节点集)**。
2.  **应用重写 (Overrides)**：将界面上填写的基础设置覆盖到模板上。
3.  **应用补丁 (Patch)**：将您选定的自定义 Patch 文件深度合并（递归覆盖或数组变异）到模板中。
4.  **注入入站/出站规则**：根据 UI 界面中设定的“节点分组”与“关键词过滤”，动态从 Nodes 中筛选出节点，并插入到模板指定的 `outbounds` 或 `inbounds` 组中。

---

## 🛠️ Patch (补丁) 语法指南

补丁 (`Patch`) 是一种高级功能，允许您对现有的 JSON 模板进行深度定制，而无需直接修改原始模板。Sing-Sub 内部实现了一套名为 `smartMerge` 的机制来处理 Patch。

### 基础合并规则

默认情况下，Patch 对象会与目标对象进行**递归合并 (Recursive Merge)**：
*   **新增字段**：如果 Patch 中的键在原模板中不存在，则直接添加。
*   **同名合并**：如果键在两边都存在且都是对象，则继续深入合并。
*   **普通覆盖**：如果键在两边都是基本类型（字符串、布尔值等），Patch 的值将覆盖模板的值。

```json
// 目标 (模板)
{
  "log": { "level": "info" }
}

// 补丁 (Patch)
{
  "log": { "timestamp": true }
}

// 合并结果
{
  "log": { "level": "info", "timestamp": true }
}
```

### 高级操作符

当目标是一个**数组**时，Sing-Sub 提供了特殊的操作符来进行精准变异：

#### 1. 全局替换: `$set`
无视所有其他规则，强制将当前节点完全替换为指定的值。

```json
// 替换整个数组为新数组
{
  "dns": {
    "servers": { "$set": [ { "address": "8.8.8.8" } ] }
  }
}
```

#### 2. 追加和前置: `$append` & `$prepend`
向现有数组的末尾或开头添加一个或多个元素。

```json
// 在 outbounds 数组开头添加一个新规则
{
  "outbounds": {
    "$prepend": {
      "type": "direct",
      "tag": "my-direct"
    }
  }
}
```

#### 3. 数组元素删除: `$remove`
从数组中移除匹配的元素。可以使用对象的**子集**进行模糊匹配。

```json
{
  "outbounds": {
    "$remove": { "tag": "ads-block" } // 移除所有 tag 为 ads-block 的元素
  }
}
```
*注：`$remove` 也可以接受一个数组，以同时移除多个匹配项。*

#### 4. 数组元素替换: `$replace`
通过匹配规则精准替换数组中的某个元素。格式必须是一个包含 `match` 和 `with` 的对象（或对象数组）。

```json
{
  "outbounds": {
    "$replace": {
      "match": { "tag": "proxy" },     // 找到 tag 为 proxy 的元素
      "with": {                        // 将其整个替换为以下对象
        "type": "urltest",
        "tag": "proxy",
        "outbounds": ["node-1", "node-2"]
      }
    }
  }
}
```
