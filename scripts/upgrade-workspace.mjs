// Generates local files only; never connects to R2 or GitHub.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const [headPath, snapshotPath, outputPath, ...extra] = process.argv.slice(2);
if (!headPath || !snapshotPath || !outputPath || extra.length) {
  throw new Error('Usage: node scripts/upgrade-workspace.mjs <head.json> <current-revision.json> <new-output-directory>');
}
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, watch: null } });
try {
  const { prepareWorkspaceUpgrade } = await server.ssrLoadModule('/scripts/prepare-workspace-upgrade.ts');
  const [head, snapshot] = await Promise.all([headPath, snapshotPath].map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const result = await prepareWorkspaceUpgrade(head, snapshot);
  const output = resolve(outputPath);
  await mkdir(output); // Refuse an existing directory instead of overwriting a backup.
  const files = [
    ['previous-revision.json', JSON.stringify(result.previousSnapshot, null, 2) + '\n'],
    ['revision.json', JSON.stringify(result.snapshot, null, 2) + '\n'],
    ['head.candidate.json', JSON.stringify(result.head, null, 2) + '\n'],
    ['head.backup.json', JSON.stringify(head, null, 2) + '\n'],
    ['report.json', JSON.stringify(result.report, null, 2) + '\n'],
    ...result.sync.files.map(file => [file.path, file.content]),
  ];
  for (const [name, content] of files) {
    const target = join(output, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { flag: 'wx', mode: 0o600 });
  }
  console.log('Upgrade prepared locally: ' + output);
  console.log('Removed profiles: ' + result.report.removedProfiles.length + '; removed adapters: ' + result.report.removedAdapters.length);
  console.log('Review report.json and the upgrade guide before applying head.candidate.json. No remote data was changed.');
} finally {
  await server.close();
}
