# Sing-Sub Guide

[中文文档](WIKI_zh-CN.md)

## Data Model

Profiles, node sets, templates, patches, and rule sets are stored in the private R2 workspace. GitHub is optional and only participates when the user explicitly imports, pushes, pulls, or enables SRS compilation.

A profile is built dynamically from:

1. a workspace template;
2. profile overrides;
3. an optional workspace patch;
4. filtered inbound and outbound nodes.

Saving an asset publishes a new immutable workspace revision. Configuration subscriptions are built from the current revision and may use revision-aware Cache API acceleration.

## Patch Syntax

Patch objects are recursively merged into the selected template. New keys are added, nested objects continue merging, and primitive values overwrite the template value.

```json
{
  "log": {
    "level": "warn",
    "timestamp": true
  }
}
```

For arrays, Sing-Sub supports four explicit operators.

### `$set`

Replace the target value completely:

```json
{
  "dns": {
    "servers": {
      "$set": [{ "type": "udp", "server": "1.1.1.1" }]
    }
  }
}
```

### `$prepend` and `$append`

Insert one item or a list of items before or after the existing array:

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

Remove primitives or objects matching the supplied subset:

```json
{
  "outbounds": {
    "$remove": { "tag": "ads-block" }
  }
}
```

### `$replace`

Replace matching array elements with a complete new value:

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

`$remove` and `$replace` also accept arrays when multiple operations are required. Validate the resulting JSON in Profile preview before saving production changes.

## Rule Sets

Rule-set source JSON is public at `/rules/{name}.json`. When a private GitHub repository is connected and the SRS compiler is enabled, the Worker provisions the compiler workflow automatically and stores the resulting immutable artifact in R2. SRS is then available at `/rules/{name}.srs`.

Rule-set import URLs are independently validated for HTTPS, redirect count, private network targets, timeout, UTF-8, and size. Profile templates do not support external URLs.
