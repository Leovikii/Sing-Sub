import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const ADMIN_PASSWORD_BUILD_SECRET = 'SING_SUB_ADMIN_PASSWORD';
export const WORKSPACE_BUCKET_NAME = 'sing-sub-data';
export const REQUIRED_WORKER_SECRETS = [
  'ADMIN_PASSWORD',
  'SESSION_SIGNING_SECRET',
  'SUBSCRIPTION_SIGNING_SECRET',
];

const WORKER_NOT_FOUND_PATTERN = /Worker "[^"]+" not found\./;
const R2_BUCKET_NOT_FOUND_PATTERN = /\[code:\s*10006\]/;
const MINIMUM_ADMIN_PASSWORD_BYTES = 12;

function wranglerExecutable() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

export function runWrangler(args, options = {}) {
  const capture = options.capture === true;
  const allowFailure = options.allowFailure === true;

  return new Promise((resolve, reject) => {
    const child = spawn(wranglerExecutable(), ['wrangler', ...args], {
      env: process.env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    if (capture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
    }
    child.on('error', reject);
    child.on('close', code => {
      const result = { code: code ?? 1, stdout, stderr };
      if (result.code !== 0 && !allowFailure) {
        reject(new Error(`Wrangler command failed: wrangler ${args.join(' ')}`));
        return;
      }
      resolve(result);
    });
  });
}

export function parseSecretNames(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item.name !== 'string')) {
    throw new Error('Wrangler returned an invalid Worker secret list');
  }
  return new Set(parsed.map(item => item.name));
}

export function createMissingSecrets(existingNames, environment, generateSecret) {
  const missing = {};
  if (!existingNames.has('ADMIN_PASSWORD')) {
    const password = environment[ADMIN_PASSWORD_BUILD_SECRET];
    if (!password || Buffer.byteLength(password, 'utf8') < MINIMUM_ADMIN_PASSWORD_BYTES) {
      throw new Error(`${ADMIN_PASSWORD_BUILD_SECRET} must be an encrypted build secret containing at least 12 bytes`);
    }
    missing.ADMIN_PASSWORD = password;
  }

  if (!existingNames.has('SESSION_SIGNING_SECRET')) {
    missing.SESSION_SIGNING_SECRET = generateSecret();
  }
  if (!existingNames.has('SUBSCRIPTION_SIGNING_SECRET')) {
    missing.SUBSCRIPTION_SIGNING_SECRET = generateSecret();
  }
  if (missing.SESSION_SIGNING_SECRET &&
      missing.SESSION_SIGNING_SECRET === missing.SUBSCRIPTION_SIGNING_SECRET) {
    throw new Error('Generated signing secrets must be independent');
  }
  return missing;
}

async function withTemporarySecrets(secrets, action) {
  const directory = await mkdtemp(join(tmpdir(), 'sing-sub-deploy-'));
  const path = join(directory, 'secrets.json');
  try {
    await writeFile(path, JSON.stringify(secrets), { encoding: 'utf8', mode: 0o600 });
    await chmod(path, 0o600).catch(() => undefined);
    return await action(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function combinedOutput(result) {
  return `${result.stdout}\n${result.stderr}`;
}

async function readExistingSecretNames(run) {
  const result = await run(['secret', 'list', '--format', 'json'], {
    capture: true,
    allowFailure: true,
  });
  if (result.code === 0) return parseSecretNames(result.stdout);
  if (WORKER_NOT_FOUND_PATTERN.test(combinedOutput(result))) return new Set();
  throw new Error('Unable to inspect existing Worker secrets; deployment stopped without changing secrets');
}

async function ensureWorkspaceBucket(run) {
  const info = await run(['r2', 'bucket', 'info', WORKSPACE_BUCKET_NAME, '--json'], {
    capture: true,
    allowFailure: true,
  });
  if (info.code === 0) return false;
  if (!R2_BUCKET_NOT_FOUND_PATTERN.test(combinedOutput(info))) {
    throw new Error('Unable to inspect the R2 workspace bucket; deployment stopped without creating resources');
  }

  const created = await run(['r2', 'bucket', 'create', WORKSPACE_BUCKET_NAME], {
    capture: true,
    allowFailure: true,
  });
  if (created.code === 0) return true;

  // A concurrent first build may have created the bucket after the info request.
  const retry = await run(['r2', 'bucket', 'info', WORKSPACE_BUCKET_NAME, '--json'], {
    capture: true,
    allowFailure: true,
  });
  if (retry.code !== 0) {
    throw new Error('Unable to create or reuse the R2 workspace bucket');
  }
  return false;
}

export async function deployCloudflare(options = {}) {
  const run = options.run || runWrangler;
  const environment = options.environment || process.env;
  const generateSecret = options.generateSecret || (() => randomBytes(32).toString('base64url'));
  const useSecretFile = options.withSecretFile || withTemporarySecrets;

  const existingNames = await readExistingSecretNames(run);
  const missingSecrets = createMissingSecrets(existingNames, environment, generateSecret);
  const createdBucket = await ensureWorkspaceBucket(run);

  if (Object.keys(missingSecrets).length === 0) {
    await run(['deploy']);
    return { createdSecrets: [], createdBucket };
  }

  await useSecretFile(missingSecrets, path => run(['deploy', '--secrets-file', path]));
  return {
    createdSecrets: REQUIRED_WORKER_SECRETS.filter(name => Object.hasOwn(missingSecrets, name)),
    createdBucket,
  };
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  deployCloudflare().catch(error => {
    console.error(error instanceof Error ? error.message : 'Cloudflare deployment failed');
    process.exitCode = 1;
  });
}
