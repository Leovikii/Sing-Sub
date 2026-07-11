# Sing-Sub

[简体中文](README_zh-CN.md)

Sing-Sub is a self-hosted control plane for managing and distributing [sing-box](https://sing-box.sagernet.org/) configurations. It stores configuration sources in GitHub, builds subscriptions at the edge with Cloudflare Workers, and provides a focused web interface for daily operations.

## What It Does

- Manage multiple profiles, node sets, templates, patches, and rule sets.
- Build profile JSON from templates, filtered nodes, and patches.
- Serve sing-box subscriptions at /sub/{token}/{profile}.json.
- Compile managed rule-set JSON into .srs through GitHub Actions and serve it at /rules/{token}/{ruleset}.srs.
- Keep GitHub PATs server-side in Cloudflare KV; the browser receives only a secure session cookie.
- Provide visual editors, JSON validation, conflict handling, and responsive desktop and mobile navigation.

## Architecture

~~~
Browser UI -> Cloudflare Worker + KV -> GitHub configuration repository
                                      -> GitHub Actions (rule-set compilation)
~~~

The Worker reads source files from GitHub and builds profile subscriptions on demand. Rule-set source files are compiled by a separate workflow because .srs is a binary sing-box artifact.

## Repository Layout

Use a private GitHub repository for your configuration data:

~~~
sing-sub/
  configs/                 # Profile source files
  nodes/                   # Node-set JSON files
  templates/               # Template JSON files
  patches/                 # Patch JSON files
  rulesets/                # Rule-set source JSON files
    compiled/              # Generated .srs artifacts
~~~

The compiled directory is maintained by the rule-set compilation workflow. Do not edit its .srs files manually.

## Prerequisites

- Node.js 20
- A Cloudflare account and KV namespace
- A GitHub repository for configuration data
- A GitHub PAT with repo and workflow permissions
- A Cloudflare API token with permission to deploy Workers

## Deployment

1. Create a KV namespace and set its ID in wrangler.toml.
2. Add CLOUDFLARE_API_TOKEN to this repository's GitHub Actions secrets.
3. Install dependencies and verify the application:

   ~~~bash
   npm ci
   npm run build
   ~~~

4. Merge to main. The deployment workflow builds the project and deploys the Worker.

After deployment, open the dashboard and provide the GitHub owner/repo, PAT, and a subscription token. The application creates managed paths when they are first needed.

## CI And Main-Branch Protection

.github/workflows/ci.yml runs npm ci and npm run build for pull requests targeting main. It does not run for ordinary pushes to development branches.

In the repository ruleset, add CI / typecheck as a required status check and enable Require branches to be up to date before merging:

~~~
Pull request to main -> CI passes -> merge allowed -> push to main -> deploy
~~~

The deployment workflow runs only after a commit reaches main and has access to the Cloudflare deployment secret. PR CI is read-only and receives no deployment credentials.

## Rule Sets

The first rule-set save creates .github/workflows/compile-srs.yml in the configuration repository. That workflow:

1. Reads every sing-sub/rulesets/*.json source file.
2. Optionally merges HTTPS sources listed in _urls.
3. Compiles each source with sing-box.
4. Commits changed artifacts under sing-sub/rulesets/compiled/.

Rule-set URLs return 404 until the corresponding .srs artifact has been compiled successfully.

## Security

- GitHub PATs are stored server-side in KV and are never returned to the browser.
- Sessions use HttpOnly, Secure, and SameSite=Strict cookies.
- Subscription and rule-set endpoints accept supported sing-box user agents only.
- Treat the subscription token as a credential and rotate it from Settings if it is exposed.

## Development

~~~bash
npm run dev
npm run build
npm run preview
~~~

See [WIKI.md](WIKI.md) for patch syntax and detailed usage notes.

## License

MIT
