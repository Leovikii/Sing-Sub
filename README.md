# Sing-Sub

Sing-Sub is a self-hosted control plane for editing and distributing [sing-box](https://sing-box.sagernet.org/) configurations.

Current pre-release: `v3.0.0-beta.1`

## Current Architecture

- Cloudflare R2 Standard is the only persistent application store.
- The Worker serves the WebUI, authenticated APIs, private JSON subscriptions, and public SRS artifacts.
- Browser sessions use signed `HttpOnly` cookies; no KV session store is required.
- GitHub is optional for data import, backup, and editable sync.
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

- A Cloudflare account with Workers enabled and an active R2 subscription
- A GitHub account for the source fork
- A private GitHub data repository and PAT only when importing or enabling optional sync

## Cloudflare Deployment

1. Fork this repository.
2. In Cloudflare Workers, connect the fork under `Settings > Builds` and select `main`.
3. Disable non-production branch builds.
4. Set the build command to `npm run build` and the deploy command to `npm run deploy:cloudflare`.
5. Let Cloudflare create the Builds API token.
6. Add an encrypted build secret named `SING_SUB_ADMIN_PASSWORD` with at least 12 UTF-8 bytes.
7. Connect the repository and wait for the build to finish.
8. Open the generated `workers.dev` URL and sign in with the administrator password.

The deployment initializer automatically creates or reuses the private `sing-sub-data` bucket and generates the two independent signing secrets. Existing buckets, objects, and runtime secrets are never cleared or rotated during normal code updates. The administrator password is the only deployment credential the user needs to choose or remember.

After the first successful deployment, the build secret can be removed. GitHub data sync, PAT, and SRS compilation remain optional settings inside the WebUI.

For local maintenance, Wrangler remains available:

```powershell
npm ci
npm run verify
npm run worker:dry-run
npm run deploy
```

On an empty R2 bucket, the WebUI creates a blank workspace and the built-in Momo adapter using only the administrator password. GitHub connection is configured later from repository settings.

## GitHub Workflows

- `ci.yml` validates pull requests.
- Cloudflare Workers Builds deploys the tracked `main` branch; there is no GitHub website deployment workflow or user-managed Cloudflare API token.
- When SRS is enabled for a connected private repository, the Worker automatically provisions the versioned workflow template. It does not commit source or artifacts during normal compilation.
- SRS provisioning uses the repository-scoped PAT already stored in private R2 metadata. Users do not create an Actions Secret or Variable; callbacks use a short-lived job ticket derived from the existing session signing secret.
- Ordinary users update explicitly with GitHub's `Sync fork`; the resulting `main` commit triggers their own Cloudflare build.

The core refactor is complete. `3.0.0-beta.1` is in Phase 9 Beta stabilization, covering Cloudflare onboarding, controlled updates, target-based profile adaptation, and frontend polish. Version `3.0.0` will only be published after the Beta release gates pass.

## Development

```powershell
npm run dev
npm run verify
npm run preview
```

Adapter syntax is documented in [WIKI.md](WIKI.md). Refactor architecture, decisions, and progress are tracked in [docs/refactor](docs/refactor/README.md).
Release compatibility, production checks, and recovery procedures are documented in [docs/operations/release-and-recovery.md](docs/operations/release-and-recovery.md).

## License

[MIT](LICENSE)
