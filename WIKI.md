# Sing-Sub Guide

[中文文档](WIKI_zh-CN.md)

## Data Model

Profiles, node sets, templates, adapters, and rule sets are stored in the private R2 workspace. GitHub is optional and only participates when the user explicitly imports, pushes, pulls, or enables SRS compilation.

A profile is built dynamically from:

1. a workspace template;
2. an optional replacement adapter;
3. filtered inbound and outbound nodes.

Saving an asset publishes a new immutable workspace revision. Configuration subscriptions are built from the current revision and may use revision-aware Cache API acceleration.

## Adapters

Adapters only perform complete replacements. Each replacement points to an existing field. When `match` is present, the target must be an array containing exactly one shallow field match.

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

Missing paths, missing matches, duplicate matches, and non-array matched targets fail the build. Adapters do not merge, append, remove, execute expressions, or create missing fields. A writable Momo preset is created with every new workspace and can be copied to create other adapters.

## Rule Sets

Rule-set source JSON is public at `/rules/{name}.json`. When a private GitHub repository is connected and the SRS compiler is enabled, the Worker provisions the compiler workflow automatically and stores the resulting immutable artifact in R2. SRS is then available at `/rules/{name}.srs`.

Rule-set import URLs are independently validated for HTTPS, redirect count, private network targets, timeout, UTF-8, and size. Profile templates do not support external URLs.
