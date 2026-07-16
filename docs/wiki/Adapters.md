# Replacement Adapters

[简体中文](AdaptersZH)

An adapter derives a target-specific profile from one shared template. It runs before inbound and outbound node insertion and only performs explicit complete replacements.

## Schema

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

- `schemaVersion` is `1`.
- `name` is the adapter asset name; `note` is optional.
- `replacements` contains 1 to 32 operations.
- `path` contains 1 to 16 safe field names and must resolve to an existing field.
- `value` is the complete replacement value.
- `match`, when present, is a non-empty shallow map of primitive values.

## Replacement rules

Without `match`, the existing field at `path` is replaced in full.

With `match`, the field at `path` must be an array. Exactly one array element must contain every primitive field in `match`; that element is then replaced in full.

The build fails when a path is missing, a matched target is not an array, or a match finds zero or multiple elements. Adapters do not merge, append, delete, create missing fields, execute expressions, run scripts, or support wildcards.

## Momo preset

Every new workspace includes an editable `momo` adapter. Its real preset:

- replaces the complete `inbounds` field with Momo-compatible DNS, redirect, TProxy, HTTP, SOCKS, and TUN inbounds;
- finds the unique `route.rules` element whose `action` is `hijack-dns` and replaces it with a rule bound to `dns-in`.

Select this adapter in a profile that uses the shared client template. Copy or create an adapter when another target needs different replacements. Keep each adapter small and target-specific; continue maintaining common routing, DNS, outbounds, and rule-set references in the base template.

Adapters are ordinary workspace assets. They participate in immutable revisions and optional GitHub synchronization, and can be edited from **Resources > Adapters**.
