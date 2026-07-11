export const COMPILE_SRS_WORKFLOW_PATH = '.github/workflows/compile-srs.yml';

export const COMPILE_SRS_WORKFLOW_CONTENT = `name: Compile SRS
on:
  push:
    paths:
      - 'sing-sub/rulesets/*.json'
  schedule:
    - cron: '15 3 * * *'
  workflow_dispatch:
    inputs:
      refresh_sources:
        description: Refresh due external sources before compiling
        type: boolean
        default: true

jobs:
  compile:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    env:
      REFRESH_SOURCES: \${{ github.event_name == 'schedule' || github.event.inputs.refresh_sources == 'true' }}
    steps:
      - uses: actions/checkout@v7
      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 20
      - name: Refresh and normalize rulesets
        run: |
          set -euo pipefail
          rm -rf .ruleset-staging
          mkdir -p .ruleset-staging/sources .ruleset-staging/compiled

          cat << 'EOF' > .ruleset-staging/process.js
          const fs = require('fs');
          const allowedKeys = new Set(['version', 'rules', '_sing_sub']);
          const metadataKeys = new Set(['note', 'sources']);
          const sourceKeys = new Set(['url', 'interval_hours', 'last_updated', 'rules']);
          const maxBytes = 5 * 1024 * 1024;

          function isPrivateHostname(hostname) {
            const host = hostname.toLowerCase();
            if (host === 'localhost' || host.includes(':')) return true;
            const parts = host.split('.').map(Number);
            if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
            const [a, b] = parts;
            return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
              (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
          }

          function parsePublicUrl(raw) {
            const url = new URL(raw);
            if (url.protocol !== 'https:' || url.username || url.password || isPrivateHostname(url.hostname)) {
              throw new Error('only public HTTPS URLs are allowed');
            }
            return url;
          }

          async function fetchPublicRuleset(raw) {
            let current = parsePublicUrl(raw);
            for (let redirects = 0; redirects <= 3; redirects++) {
              const response = await fetch(current, { redirect: 'manual', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
              if (response.status < 300 || response.status >= 400) return response;
              const location = response.headers.get('location');
              if (!location) throw new Error('redirect has no location');
              current = parsePublicUrl(new URL(location, current).toString());
            }
            throw new Error('redirect limit exceeded');
          }

          function normalizeImportedRules(data) {
            if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.rules)) {
              throw new Error('source must be a JSON object with a rules array');
            }
            const domains = [];
            const suffixes = [];
            const seenDomains = new Set();
            const seenSuffixes = new Set();
            for (const rule of data.rules) {
              if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('source rules must be objects');
              const entries = Object.entries(rule);
              if (entries.length !== 1 || (entries[0][0] !== 'domain' && entries[0][0] !== 'domain_suffix')) {
                throw new Error('source rules may only contain domain or domain_suffix');
              }
              const [field, values] = entries[0];
              if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim())) {
                throw new Error('source rule values must be non-empty strings');
              }
              const target = field === 'domain' ? domains : suffixes;
              const seen = field === 'domain' ? seenDomains : seenSuffixes;
              for (const value of values.map(value => value.trim())) {
                if (!seen.has(value)) { seen.add(value); target.push(value); }
              }
            }
            return [
              ...(domains.length ? [{ domain: domains }] : []),
              ...(suffixes.length ? [{ domain_suffix: suffixes }] : []),
            ];
          }

          function validateSource(source, file) {
            if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(file + ' has invalid source metadata');
            for (const key of Object.keys(source)) if (!sourceKeys.has(key)) throw new Error(file + ' has unsupported source field: ' + key);
            parsePublicUrl(source.url);
            if (![0, 24, 168, 720, 8760].includes(source.interval_hours)) {
              throw new Error(file + ' has invalid source update settings');
            }
            if (source.rules !== undefined) normalizeImportedRules({ rules: source.rules });
          }

          function rebuildRules(data, previousSources, sources) {
            const sourceCounts = new Map();
            for (const source of previousSources) for (const rule of source.rules) {
              const key = JSON.stringify(rule);
              sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
            }
            const manualRules = [];
            for (const rule of data.rules) {
              const key = JSON.stringify(rule);
              const count = sourceCounts.get(key) || 0;
              if (count > 0) sourceCounts.set(key, count - 1);
              else manualRules.push(rule);
            }
            data.rules = manualRules.concat(...sources.map(source => source.rules));
          }

          async function processFile(file) {
            const path = 'sing-sub/rulesets/' + file;
            const data = JSON.parse(fs.readFileSync(path, 'utf8'));
            if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.rules)) throw new Error(file + ' must contain a rules array');
            normalizeImportedRules({ rules: data.rules });
            for (const key of Object.keys(data)) if (!allowedKeys.has(key)) throw new Error(file + ' has unsupported top-level field: ' + key);
            const metadata = data._sing_sub;
            if (metadata !== undefined && (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))) throw new Error(file + ' has invalid _sing_sub metadata');
            const sources = metadata && metadata.sources !== undefined ? metadata.sources : [];
            if (!Array.isArray(sources)) throw new Error(file + ' sources must be an array');
            if (metadata) for (const key of Object.keys(metadata)) if (!metadataKeys.has(key)) throw new Error(file + ' has unsupported metadata field: ' + key);
            for (const source of sources) {
              validateSource(source, file);
              if (source.rules === undefined) source.rules = [];
            }
            const previousSources = JSON.parse(JSON.stringify(sources));

            let changed = false;
            if (process.env.REFRESH_SOURCES === 'true' || sources.some(source => !Number.isFinite(Date.parse(source.last_updated || '')))) {
              const now = Date.now();
              for (const source of sources) {
                const lastUpdated = Date.parse(source.last_updated || '');
                const initialImport = !Number.isFinite(lastUpdated);
                const due = initialImport || (source.interval_hours > 0 && now - lastUpdated >= source.interval_hours * 60 * 60 * 1000);
                if (!due) continue;
                const response = await fetchPublicRuleset(source.url);
                if (!response.ok) throw new Error(file + ' source request failed with HTTP ' + response.status);
                const contentLength = Number(response.headers.get('content-length') || '0');
                if (contentLength > maxBytes) throw new Error(file + ' source exceeds 5 MiB');
                const body = await response.text();
                if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new Error(file + ' source exceeds 5 MiB');
                source.rules = normalizeImportedRules(JSON.parse(body));
                source.last_updated = new Date().toISOString();
                changed = true;
              }
            }
            if (changed) {
              rebuildRules(data, previousSources, sources);
              fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\\n');
            }
            const compileData = JSON.parse(JSON.stringify(data));
            delete compileData._sing_sub;
            fs.writeFileSync('.ruleset-staging/sources/' + file, JSON.stringify(compileData));
          }

          async function main() {
            const files = fs.readdirSync('sing-sub/rulesets').filter(file => file.endsWith('.json'));
            for (const file of files) await processFile(file);
          }
          main().catch(error => { console.error(error); process.exit(1); });
          EOF

          node .ruleset-staging/process.js

          SING_BOX_VERSION="v1.9.3"
          curl --fail --location --retry 3 --connect-timeout 10 \\
            "https://github.com/SagerNet/sing-box/releases/download/v1.9.3/sing-box-1.9.3-linux-amd64.tar.gz" \\
            --output sing-box.tar.gz
          tar -xzf sing-box.tar.gz
          mv sing-box-*/sing-box ./sing-box
          chmod +x ./sing-box

          for source in .ruleset-staging/sources/*.json; do
            [ -e "$source" ] || continue
            name=$(basename "$source" .json)
            ./sing-box rule-set compile "$source" -o ".ruleset-staging/compiled/$name.srs"
          done

          rm -rf sing-sub/rulesets/compiled
          mv .ruleset-staging/compiled sing-sub/rulesets/compiled
          rm -rf .ruleset-staging sing-box sing-box.tar.gz
      - name: Commit and push updated sources and SRS files
        run: |
          git config user.name "Sing-Sub Bot"
          git config user.email "bot@sing-sub.local"
          git add -A sing-sub/rulesets
          if ! git diff --cached --quiet; then
            if [ "$REFRESH_SOURCES" = "true" ]; then
              git commit -m "Sing-Sub: ruleset: refresh sources and compile"
            else
              git commit -m "Sing-Sub: ruleset: compile"
            fi
            git push
          fi
`;
