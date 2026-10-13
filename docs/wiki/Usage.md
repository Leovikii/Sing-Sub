# Resources, profiles and sync

[简体中文](UsageZH) · [Home](Home)

## Resources and profiles

Store node sets, templates and rule sets in Resources. Click a card to preview it, or use Edit to change its name, note or content. Changes take effect after saving. A profile combines a template and a node set, using filters to generate its subscription.

The JSON editor for nodes and templates supports formatting, validation, find and replace. Rule sets use a structured editor: add remote HTTPS sources under SOURCE and manual rules under their domain sections.

## Two different timestamps

- Every resource card shows a compact timestamp in its footer: the time this configuration file was successfully saved locally, including name, note and content changes. This is neither per-node history nor a compilation timestamp.
- **Source updated** stays at the bottom left of the SOURCE section in the rule set editor, beside the interval setting. It means the latest successful fetch, not necessarily a change upstream. Multiple sources also show their individual times below.
- Recent times appear as minutes, hours or days ago. At 30 days, they switch to the local date and time. Focus or touch a timestamp to see its precise time and time zone; the resource dialog also displays the full configuration modification time.
- Missing history shows **Not recorded**. GitHub pulls preserve known times for unchanged resources. New or changed imports have no reliable original modification time; the pull time is not substituted. Saving locally starts a new record.

**Remote sources currently refresh when the rule set is saved; interval settings do not yet trigger background scheduled fetches.** Failed or conflicting saves publish no new timestamp. SRS compilation and retries do not change configuration modification times.

## Subscription and rule set links

Configuration subscriptions contain an access token. Share them only with clients that need access. Resetting the subscription token invalidates existing configuration links; copy new links afterwards. Rule set JSON/SRS links are public, so do not include private rules.

JSON works without SRS. With SRS enabled, cards show compilation status and the available format. Failed builds can be retried, while an existing active SRS remains available. See the [SRS compiler guide](https://github.com/Leovikii/Sing-Sub/blob/main/docs/operations/srs-compiler.md) for setup and permissions.

## GitHub sync

GitHub is an optional private backup and editing channel; normal resource editing does not require it. Connect a private repository in Settings, then choose a direction on the Sync page:

- **Push** updates managed GitHub files from local data.
- **Pull** updates local data from GitHub, then refreshes the displayed profiles and resources.

First sync, changes on both sides and reverse overwrites require confirmation of the destination. Review the differences before confirming; canceling performs no sync. Sync does not merge both sides automatically, and invalid files are rejected. See [GitHub sync](https://github.com/Leovikii/Sing-Sub/blob/main/docs/operations/github-sync.md) for permissions and recovery.
