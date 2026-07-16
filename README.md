<h1>
  <img src="./public/favicon.svg" width="34" height="34" alt="Sing Sub"> Sing Sub
</h1>

[简体中文](README_zh-CN.md) · [Wiki](https://github.com/Leovikii/Sing-Sub/wiki) · [License](LICENSE)

Sing-Sub is a self-hosted control plane for editing and distributing [sing-box](https://sing-box.sagernet.org/) configurations.

Version: `v3.0.0`

## Features

- Edit profiles, node sets, templates, adapters, and rule sets in a responsive bilingual WebUI.
- Build profiles dynamically from one template, an optional replacement adapter, and filtered nodes.
- Store the workspace, immutable revisions, and SRS artifacts in a private Cloudflare R2 bucket.
- Distribute private configuration subscriptions with compact signed tokens and public rule sets as JSON or SRS.
- Optionally import, back up, and explicitly synchronize data with a private GitHub repository.
- Optionally provision a repository-scoped GitHub Actions workflow to compile SRS artifacts.

## Deployment

The recommended deployment uses a GitHub fork and Cloudflare Workers Builds:

1. Enable Workers and R2 in Cloudflare, then fork this repository.
2. Connect the fork under the Worker's `Settings > Builds` and track `main`.
3. Set the build command to `npm run build` and the deploy command to `npm run deploy:cloudflare`.
4. Add the encrypted build secret `SING_SUB_ADMIN_PASSWORD` with at least 12 UTF-8 bytes.
5. Deploy, open the generated Worker URL, and sign in with that password.

The initializer creates or reuses `sing-sub-data`, generates missing runtime signing secrets, and creates an empty workspace with the Momo adapter on first login. GitHub data sync, PAT, and SRS compilation are optional after deployment.

See the [complete deployment guide](https://github.com/Leovikii/Sing-Sub/wiki/Deployment) or its [version-controlled source](docs/wiki/Deployment.md).

## Technology

- Vue 3, PrimeVue, Pinia, Vue Router, and Vue I18n
- TypeScript, Vite, CodeMirror, and Zod
- Cloudflare Workers, Static Assets, Cache API, and R2
- Vitest and Playwright

## Development

```powershell
npm ci
npm run dev
npm run verify
npm run worker:dry-run
```

Architecture decisions and release history are tracked in [docs/refactor](docs/refactor/README.md). Operational guides are indexed in [docs](docs/README.md).

## License

[GNU GPL v3](LICENSE)
