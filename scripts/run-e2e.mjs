import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false,
  },
});

try {
  await server.listen();
  const baseURL = server.resolvedUrls?.local[0];
  if (!baseURL) throw new Error('Vite did not expose a local test URL');

  const playwrightCli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
  const child = spawn(process.execPath, [playwrightCli, 'test', ...process.argv.slice(2)], {
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
  await server.close();
}
