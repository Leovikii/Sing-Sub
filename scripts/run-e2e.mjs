import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { createServer, preview } from 'vite';

const cliArguments = process.argv.slice(2);
const production = cliArguments.includes('--production');
const testArguments = cliArguments.filter(argument => argument !== '--production');
const server = production
  ? await preview({ preview: { host: '127.0.0.1', port: 0 } })
  : await createServer({
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
    },
  });

try {
  if (!production) await server.listen();
  const baseURL = server.resolvedUrls?.local[0];
  if (!baseURL) throw new Error('Vite did not expose a local test URL');

  const playwrightCli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
  const child = spawn(process.execPath, [playwrightCli, 'test', ...testArguments], {
    cwd: process.cwd(),
    env: { ...process.env, PLAYWRIGHT_BASE_URL: baseURL },
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  if (production) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  else await server.close();
}
