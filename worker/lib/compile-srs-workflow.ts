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
    if: "\${{ github.event_name != 'push' || !startsWith(github.event.head_commit.message, 'ruleset: delete ') }}"
    concurrency:
      group: compile-srs-\${{ github.repository }}
      cancel-in-progress: true
    runs-on: ubuntu-latest
    permissions:
      contents: write
    env:
      REFRESH_SOURCES: \${{ github.event_name == 'schedule' || github.event.inputs.refresh_sources == 'true' }}
      EVENT_NAME: \${{ github.event_name }}
      BEFORE_SHA: \${{ github.event.before }}
      CURRENT_SHA: \${{ github.sha }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 20
      - name: Refresh and normalize rulesets
        run: |
          set -euo pipefail
          rm -rf .ruleset-staging
          mkdir -p .ruleset-staging/sources .ruleset-staging/compiled
          touch .ruleset-staging/compile-list .ruleset-staging/delete-list

          cat << 'EOF' > .ruleset-staging/changes.js
          const fs = require('fs');
          const { execFileSync } = require('child_process');
          const rulesetDir = 'sing-sub/rulesets';
          const compile = new Set();
          const remove = new Set();
          const currentFiles = () => fs.readdirSync(rulesetDir).filter(file => file.endsWith('.json'));

          if (process.env.EVENT_NAME === 'workflow_dispatch') {
            for (const file of currentFiles()) compile.add(file);
          } else if (process.env.EVENT_NAME === 'push') {
            const before = process.env.BEFORE_SHA || '';
            if (!before || /^0+$/.test(before)) {
              for (const file of currentFiles()) compile.add(file);
            } else {
              const output = execFileSync('git', [
                'diff', '--name-status', '-z', '--find-renames', before,
                process.env.CURRENT_SHA, '--', rulesetDir + '/*.json'
              ], { encoding: 'utf8' });
              const fields = output.split('\\0').filter(Boolean);
              for (let index = 0; index < fields.length;) {
                const status = fields[index++];
                const oldPath = fields[index++];
                if (status.startsWith('R')) {
                  const newPath = fields[index++];
                  remove.add(oldPath.slice(oldPath.lastIndexOf('/') + 1).replace(/\\.json$/, '.srs'));
                  compile.add(newPath.slice(newPath.lastIndexOf('/') + 1));
                } else if (status === 'D') {
                  remove.add(oldPath.slice(oldPath.lastIndexOf('/') + 1).replace(/\\.json$/, '.srs'));
                } else if (status === 'A' || status === 'M' || status === 'C') {
                  compile.add(oldPath.slice(oldPath.lastIndexOf('/') + 1));
                }
              }
            }
          }

          fs.writeFileSync('.ruleset-staging/compile-list', [...compile].sort().join('\\n') + (compile.size ? '\\n' : ''));
          fs.writeFileSync('.ruleset-staging/delete-list', [...remove].sort().join('\\n') + (remove.size ? '\\n' : ''));
          EOF

          node .ruleset-staging/changes.js

          cat << 'EOF' > .ruleset-staging/process.js
          const fs = require('fs');
          const allowedKeys = new Set(['version', 'rules', '_sing_sub']);
          const metadataKeys = new Set(['note', 'manual', 'sources']);
          const sourceKeys = new Set(['url', 'interval_hours', 'last_updated']);
          const ruleFields = ['domain', 'domain_suffix', 'domain_keyword', 'domain_regex'];
          const maxBytes = 5 * 1024 * 1024;
          const compileFiles = new Set(fs.readFileSync('.ruleset-staging/compile-list', 'utf8').split(/\\r?\\n/).filter(Boolean));
          const repairMissing = process.env.EVENT_NAME !== 'push' || compileFiles.size > 0;

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
              const response = await fetchWithRetry(current);
              if (response.status < 300 || response.status >= 400) return response;
              const location = response.headers.get('location');
              if (!location) throw new Error('redirect has no location');
              current = parsePublicUrl(new URL(location, current).toString());
            }
            throw new Error('redirect limit exceeded');
          }

          async function fetchWithRetry(url) {
            for (let attempt = 0; attempt < 3; attempt++) {
              const response = await fetch(url, { redirect: 'manual', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
              const retryable = response.status === 429 || [502, 503, 504].includes(response.status);
              if (!retryable || attempt === 2) return response;
              await response.body?.cancel();
              const retryAfter = response.headers.get('retry-after');
              const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
              const delay = Number.isFinite(retryAfterSeconds)
                ? Math.min(retryAfterSeconds * 1000, 2000)
                : 350 * (2 ** attempt) + Math.floor(Math.random() * 150);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
            throw new Error('source request retry failed');
          }

          function normalizeImportedRules(data, allowEmptyRules = false) {
            if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.rules)) {
              throw new Error('source must be a JSON object with a rules array');
            }
            const normalized = { domain: [], domain_suffix: [], domain_keyword: [], domain_regex: [] };
            const seen = { domain: new Set(), domain_suffix: new Set(), domain_keyword: new Set(), domain_regex: new Set() };
            for (const rule of data.rules) {
              if (!rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('source rules must be objects');
              const entries = Object.entries(rule);
              if (entries.length === 0 && allowEmptyRules) continue;
              if (entries.length === 0 || entries.some(([field]) => !ruleFields.includes(field))) {
                throw new Error('source rules may only contain domain, domain_suffix, domain_keyword, or domain_regex fields');
              }
              for (const [field, rawValues] of entries) {
                const values = typeof rawValues === 'string' ? [rawValues] : rawValues;
                if (!Array.isArray(values) || values.some(value => typeof value !== 'string' || !value.trim())) {
                  throw new Error('source rule values must be non-empty strings');
                }
                for (const value of values.map(value => {
                  const normalized = field === 'domain_regex' ? value.trim() : value.trim().toLowerCase();
                  return field === 'domain_suffix' ? normalized.replace(/^\\.+/, '') : normalized;
                })) {
                  if (!seen[field].has(value)) { seen[field].add(value); normalized[field].push(value); }
                }
              }
            }
            return normalized;
          }

          function validateSource(source, file) {
            if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error(file + ' has invalid source metadata');
            for (const key of Object.keys(source)) if (!sourceKeys.has(key)) throw new Error(file + ' has unsupported source field: ' + key);
            parsePublicUrl(source.url);
            if (![0, 24, 168, 720, 8760].includes(source.interval_hours)) {
              throw new Error(file + ' has invalid source update settings');
            }
          }

          function materialize(data, manual, imported) {
            const buckets = [manual, ...imported];
            const merged = normalizeImportedRules({ rules: buckets.map(bucket => ({
              domain: bucket.domain || [],
              domain_suffix: bucket.domain_suffix || [],
              domain_keyword: bucket.domain_keyword || [],
              domain_regex: bucket.domain_regex || []
            })) }, true);
            const rule = {};
            for (const field of ruleFields) if (merged[field].length) rule[field] = merged[field];
            data.version = 2;
            data.rules = Object.keys(rule).length ? [rule] : [];
          }

          async function processFile(file) {
            const path = 'sing-sub/rulesets/' + file;
            const data = JSON.parse(fs.readFileSync(path, 'utf8'));
            const originalData = JSON.stringify(data);
            if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.rules)) throw new Error(file + ' must contain a rules array');
            if (data.version !== 2) throw new Error(file + ' must use rule-set version 2');
            normalizeImportedRules(data);
            for (const key of Object.keys(data)) if (!allowedKeys.has(key)) throw new Error(file + ' has unsupported top-level field: ' + key);
            const metadata = data._sing_sub;
            if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error(file + ' has invalid _sing_sub metadata');
            const sources = metadata.sources !== undefined ? metadata.sources : [];
            if (!Array.isArray(sources)) throw new Error(file + ' sources must be an array');
            for (const key of Object.keys(metadata)) if (!metadataKeys.has(key)) throw new Error(file + ' has unsupported metadata field: ' + key);
            const manual = metadata.manual === undefined ? {} : metadata.manual;
            if (!manual || typeof manual !== 'object' || Array.isArray(manual)) throw new Error(file + ' has invalid manual rules');
            normalizeImportedRules({ rules: [manual] }, true);
            for (const source of sources) {
              validateSource(source, file);
            }

            let changed = false;
            const now = Date.now();
            const uninitialized = sources.some(source => !Number.isFinite(Date.parse(source.last_updated || '')));
            const due = sources.some(source => {
              const lastUpdated = Date.parse(source.last_updated || '');
              return !Number.isFinite(lastUpdated) ||
                (source.interval_hours > 0 && now - lastUpdated >= source.interval_hours * 60 * 60 * 1000);
            });
            if (sources.length && (uninitialized || (process.env.REFRESH_SOURCES === 'true' && due))) {
              const imported = [];
              for (const source of sources) {
                const response = await fetchPublicRuleset(source.url);
                if (!response.ok) throw new Error(file + ' source request failed with HTTP ' + response.status);
                const contentLength = Number(response.headers.get('content-length') || '0');
                if (contentLength > maxBytes) throw new Error(file + ' source exceeds 5 MiB');
                const body = await response.text();
                if (Buffer.byteLength(body, 'utf8') > maxBytes) throw new Error(file + ' source exceeds 5 MiB');
                const bucket = normalizeImportedRules(JSON.parse(body));
                if (!ruleFields.some(field => bucket[field].length)) throw new Error(file + ' source contains no supported rules');
                imported.push(bucket);
                source.last_updated = new Date().toISOString();
              }
              materialize(data, manual, imported);
              changed = true;
            }
            const normalized = JSON.stringify(data) !== originalData;
            if (changed || normalized) {
              fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\\n');
            }
            const output = 'sing-sub/rulesets/compiled/' + file.replace(/\\.json$/, '.srs');
            if (compileFiles.has(file) || changed || normalized || (repairMissing && !fs.existsSync(output))) {
              compileFiles.add(file);
              const compileData = JSON.parse(JSON.stringify(data));
              delete compileData._sing_sub;
              fs.writeFileSync('.ruleset-staging/sources/' + file, JSON.stringify(compileData));
            }
          }

          async function main() {
            const files = fs.readdirSync('sing-sub/rulesets').filter(file => file.endsWith('.json'));
            for (const file of files) await processFile(file);
            fs.writeFileSync('.ruleset-staging/compile-list', [...compileFiles].sort().join('\\n') + (compileFiles.size ? '\\n' : ''));
          }
          main().catch(error => { console.error(error); process.exit(1); });
          EOF

          node .ruleset-staging/process.js

          if [ -s .ruleset-staging/compile-list ]; then
            curl --fail --location --retry 3 --connect-timeout 10 \\
              --header "Accept: application/vnd.github+json" \\
              --header "Authorization: Bearer \${{ github.token }}" \\
              --header "X-GitHub-Api-Version: 2022-11-28" \\
              "https://api.github.com/repos/SagerNet/sing-box/releases/latest" \\
              --output sing-box-release.json
            DOWNLOAD_URL=$(node -e '
              const release = require("./sing-box-release.json");
              if (release.draft || release.prerelease) throw new Error("latest release is not stable");
              const asset = release.assets.find(item => /^sing-box-[0-9.]+-linux-amd64\\.tar\\.gz$/.test(item.name));
              if (!asset) throw new Error("linux-amd64 archive not found in latest stable release");
              process.stdout.write(asset.browser_download_url);
            ')
            curl --fail --location --retry 3 --connect-timeout 10 \\
              "$DOWNLOAD_URL" \\
              --output sing-box.tar.gz
            tar -xzf sing-box.tar.gz
            mv sing-box-*/sing-box ./sing-box
            chmod +x ./sing-box
            ./sing-box version

            while IFS= read -r file; do
              [ -n "$file" ] || continue
              name="\${file%.json}"
              ./sing-box rule-set compile ".ruleset-staging/sources/$file" -o ".ruleset-staging/compiled/$name.srs"
            done < .ruleset-staging/compile-list
          fi

          mkdir -p sing-sub/rulesets/compiled
          while IFS= read -r file; do
            [ -n "$file" ] || continue
            rm -f "sing-sub/rulesets/compiled/$file"
          done < .ruleset-staging/delete-list
          for output in .ruleset-staging/compiled/*.srs; do
            [ -e "$output" ] || continue
            mv "$output" sing-sub/rulesets/compiled/
          done
          rm -rf .ruleset-staging sing-box sing-box.tar.gz sing-box-release.json
      - name: Commit and push updated sources and SRS files
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add -A sing-sub/rulesets
          if ! git diff --cached --quiet; then
            if [ "$REFRESH_SOURCES" = "true" ]; then
              git commit -m "ruleset: refresh sources and compile"
            else
              git commit -m "ruleset: compile"
            fi
            git push
          fi
`;
