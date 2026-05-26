# Sing-Sub WIKI

[中文文档](WIKI_zh-CN.md)

Welcome to the Sing-Sub documentation. This page contains a comprehensive usage tutorial and an advanced guide to Patch syntax.

## 📖 Usage Tutorial

Sing-Sub allows you to easily manage sing-box configuration files stored in GitHub through a modern Web UI.

### 1. Preparation

*   **Prepare your repository**: Create a private GitHub repository to store your configuration files. You can upload your initial `nodes.json` (node definitions) or `template.json` (base template) here.
*   **Get a GitHub PAT**: Go to GitHub Settings -> Developer settings -> Personal access tokens and create a Token with the `repo` scope.
*   **Login**: Open the Sing-Sub dashboard, input your `owner/repo`, `PAT`, and a custom `SubToken` (a random string used to generate subscription links—keep it safe!).

### 2. Interface Navigation

*   **Profiles**: Here you can create multiple environments (e.g., `home`, `office`). Each profile is dynamically built from a base Template, Node sets, and custom Patches.
*   **Assets**: Centralized management for the `sing-sub/nodes`, `sing-sub/templates`, and `sing-sub/patches` files stored in your repository. You can edit their JSON code directly in the browser.
*   **Settings**: Update your repository details, Token, or securely log out.

### 3. Build Logic

When you click "Save" or "Refresh", the Sing-Sub edge worker executes the following build pipeline:
1.  **Fetch Bases**: Pulls the associated **Template** and **Nodes** from GitHub.
2.  **Apply Overrides**: Injects the basic settings configured in the UI onto the template.
3.  **Apply Patch**: Deep-merges your selected custom Patch files (recursive overwrite or array mutation) into the template.
4.  **Inject Rules**: Dynamically filters nodes from the node sets based on "Node Groups" and "Keyword Filters" set in the UI, and inserts them into the specified `outbounds` or `inbounds` groups of the template.

---

## 🛠️ Patch Syntax Guide

Patches are an advanced feature that allows you to deeply customize an existing JSON template without modifying the original template itself. Sing-Sub implements an internal mechanism called `smartMerge` to handle patches.

### Basic Merge Rules

By default, the Patch object is **recursively merged** with the target object:
*   **New Keys**: If a key in the Patch does not exist in the target, it is added.
*   **Same-name Merging**: If a key exists in both and both are objects, the merge continues deeper.
*   **Primitive Overwrite**: If a key is a primitive type (string, boolean, etc.) in both, the Patch's value will overwrite the target's value.

```json
// Target (Template)
{
  "log": { "level": "info" }
}

// Patch
{
  "log": { "timestamp": true }
}

// Merged Result
{
  "log": { "level": "info", "timestamp": true }
}
```

### Advanced Array Operators

When the target is an **Array**, Sing-Sub provides special operators for precise mutation:

#### 1. Full Replacement: `$set`
Ignores all other rules and forcefully replaces the target array entirely with the specified value.

```json
// Replaces the entire array with a new one
{
  "dns": {
    "servers": { "$set": [ { "address": "8.8.8.8" } ] }
  }
}
```

#### 2. Append and Prepend: `$append` & `$prepend`
Adds one or more elements to the end or beginning of an existing array.

```json
// Prepends a new rule to the outbounds array
{
  "outbounds": {
    "$prepend": {
      "type": "direct",
      "tag": "my-direct"
    }
  }
}
```

#### 3. Element Removal: `$remove`
Removes matching elements from the array. You can use a **subset** of an object for fuzzy matching.

```json
{
  "outbounds": {
    "$remove": { "tag": "ads-block" } // Removes all elements where tag is "ads-block"
  }
}
```
*Note: `$remove` can also accept an array of objects to remove multiple matches at once.*

#### 4. Element Replacement: `$replace`
Replaces a specific element in the array based on a match. The format must be an object (or array of objects) containing `match` and `with`.

```json
{
  "outbounds": {
    "$replace": {
      "match": { "tag": "proxy" },     // Finds the element with tag "proxy"
      "with": {                        // Replaces the entire element with this object
        "type": "urltest",
        "tag": "proxy",
        "outbounds": ["node-1", "node-2"]
      }
    }
  }
}
```
