# Sing Sub

[中文文档](README_zh-CN.md)

Edge-based multi-environment configuration distribution console for [sing-box](https://sing-box.sagernet.org/). Manage sing-box profiles through a web UI, store configurations in a private GitHub repo, and distribute subscription links via Cloudflare Workers.

## Features

- **Cookie-based auth** — Login with GitHub repo + PAT. Session stored as HttpOnly Secure cookie, no third-party auth required.
- **Server-side security** — GitHub PAT stored in Cloudflare KV (encrypted at rest), never exposed to the browser. Same repo from different devices shares one user entry.
- **Edge config building** — Worker fetches templates and nodes from GitHub, merges them on the fly, and caches in KV. No GitHub Actions or Gist needed.
- **Automated Bot Commits** — Configuration changes via the UI are pushed to your repository under a dedicated "Sing-Sub Bot" identity, keeping your commit history clean and easily distinguishable from manual edits.
- **Subscription distribution** — `/sub/{token}/{name}.json` with User-Agent filtering (sing-box clients only).
- **Next-Gen Glassmorphism UI** — A stunning, fully responsive interface optimized for both desktop and mobile, featuring dynamic layout adaptation, intelligent protocol tag rendering, and seamless mode toggles.
- **Dual-Mode Profile Editor** — Switch instantly between Visual UI Builder and Live JSON Preview with animated segmented controls.
- **Nodes Manager** — Dedicated interface for inspecting node definitions and previewing remote node files instantly.
- **Multi-profile** — Manage multiple environments (e.g. `home`, `office`, `travel`) with independent inbound/outbound rules and templates.
- **Auto-deploy** — Push to `main` triggers GitHub Actions to deploy the Worker automatically.

## Tech Stack

- **Frontend**: Vue 3 (Composition API) + TypeScript + Vite + Tailwind CSS v4
- **Backend**: Cloudflare Workers + KV
- **Auth**: Cookie-based sessions (HttpOnly, Secure, SameSite=Strict)
- **CI/CD**: GitHub Actions (deploy only)

## Prerequisites

1. A **private GitHub repo** with your sing-box data:

   ```
   your-private-repo/
   ├── sing-sub/
   │   ├── configs/             # Configuration profiles managed by UI
   │   ├── nodes/               # Node files (.json)
   │   ├── templates/           # Base templates (.json)
   │   └── patches/             # Patch definitions (.json)
   ```
   *Note: Templates can also be hosted anywhere as public URLs (e.g., raw GitHub links).*

2. A **GitHub Personal Access Token (PAT)** with `repo` and `workflow` permissions. (`repo` is for reading/writing configs, and `workflow` is required for automatically compiling custom rule-sets via Actions). Create one at: https://github.com/settings/tokens
3. A **Cloudflare account** with a custom domain.

## Deployment

### 1. Create KV Namespace
- Cloudflare Dashboard → Storage & Databases → KV → Create a namespace
- Copy the Namespace ID and update `id` under `[[kv_namespaces]]` in `wrangler.toml`

### 2. Set GitHub Secrets
- Go to your repo → Settings → Secrets → Actions
- Add `CLOUDFLARE_API_TOKEN` (use the "Edit Cloudflare Workers" template from Cloudflare Dashboard)

### 3. Push to Deploy
```bash
git push origin main
```

## Usage & Documentation

For detailed usage instructions, how to organize your repository, and a comprehensive guide on the **Patch Syntax** (`$set`, `$append`, `$replace`, `$remove`), please refer to our [WIKI](WIKI.md).

Subscription URL format: `https://your-domain/sub/{token}/{profile_name}.json`

## Security

- PAT is only stored once in KV, keyed by `owner/repo`. No duplication across sessions.
- Session cookies are HttpOnly + Secure + SameSite=Strict (30-day expiry).
- CSP headers restrict scripts and connections to same-origin + GitHub API.
- Login page includes a disclaimer and link to source code, encouraging self-deployment.

## License

MIT
