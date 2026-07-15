# Sing-Sub

Sing-Sub is a self-hosted control plane for editing and distributing [sing-box](https://sing-box.sagernet.org/) configurations.

Current pre-release: `v3.0.0-beta.1`

## Current Architecture

- Cloudflare R2 Standard is the only persistent application store.
- The Worker serves the WebUI, authenticated APIs, private JSON subscriptions, and public SRS artifacts.
- Browser sessions use signed `HttpOnly` cookies; no KV session store is required.
- GitHub is optional for initial import and future backup/editable sync.
- Rule-set JSON is always distributed directly from the current R2 revision. A connected private GitHub repository can optionally run the stateless SRS compiler and return binary artifacts to the Worker.

```text
Browser -> Cloudflare Worker -> private R2 workspace/revisions/artifacts
                              -> optional GitHub sync/backup
                              -> GitHub Actions SRS compiler
```

## URLs

- Private configuration: `/sub/{signedToken}/{profile}.json`
- Public source rule set: `/rules/{ruleset}.json`
- Optional compiled rule set: `/rules/{ruleset}.srs`

The private configuration token uses the compact `s2.<22-char-tag>` format. It remains a bearer credential and must not be shared. SRS links intentionally contain no JSON subscription token.

## Prerequisites

- Node.js 22
- A Cloudflare account with Workers and R2 enabled
- Wrangler 4.x (installed by this project)
- A private GitHub data repository and PAT only when importing or enabling optional sync

## Manual Deployment

Create the private R2 bucket declared in `wrangler.toml`:

```powershell
npx wrangler login
npx wrangler r2 bucket create sing-sub-data
```

Configure three different Worker secrets through the interactive prompt:

```powershell
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SIGNING_SECRET
npx wrangler secret put SUBSCRIPTION_SIGNING_SECRET
```

The two signing secrets must each contain at least 32 random bytes. Never commit or print these values.

Verify and deploy:

```powershell
npm ci
npm run verify
npm run worker:dry-run
npm run deploy
```

`workers_dev` is currently disabled. Configure a Custom Domain or Route for the Worker in Cloudflare before opening the WebUI.

On an empty R2 bucket, the WebUI creates a blank workspace with only the administrator password. GitHub import is optional. Once initialized, every device logs in with only the administrator password.

## GitHub Workflows

- `ci.yml` validates pull requests.
- `deploy.yml` automatically deploys the maintainer-owned development deployment from `main` and can also be started manually. It requires the maintainer's `CLOUDFLARE_API_TOKEN`.
- When SRS is enabled for a connected private repository, the Worker automatically provisions the versioned workflow template. It does not commit source or artifacts during normal compilation.
- SRS provisioning uses the repository-scoped PAT already stored in private R2 metadata. Users do not create an Actions Secret or Variable; callbacks use a short-lived job ticket derived from the existing session signing secret.
- Release users deploy locally with Wrangler and do not require Actions, a fork, or a GitHub repository.

The core refactor is complete. `3.0.0-beta.1` now enters Phase 9 Beta stabilization, covering standalone Release deployment, controlled updates, target-based profile adaptation, and frontend polish. Ordinary users will not be required to fork the source repository. Version `3.0.0` will only be published after the Beta release gates pass.

## Development

```powershell
npm run dev
npm run verify
npm run preview
```

Patch syntax is documented in [WIKI.md](WIKI.md). Refactor architecture, decisions, and progress are tracked in [docs/refactor](docs/refactor/README.md).
Release compatibility, production checks, and recovery procedures are documented in [docs/operations/release-and-recovery.md](docs/operations/release-and-recovery.md).

## License

[MIT](LICENSE)
