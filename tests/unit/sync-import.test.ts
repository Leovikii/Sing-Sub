import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../worker/domain/revisions/canonical-json';
import { importSyncTree, SyncTreeValidationError } from '../../worker/application/sync/import-sync-tree';

async function file(path: string, content: string) {
  return { path, content, contentHash: await sha256Hex(content) };
}

describe('sync tree import', () => {
  it('normalizes formatting and validates profile references', async () => {
    const imported = await importSyncTree([
      await file('sing-sub/configs/default.json', JSON.stringify({
        name: 'default', templateUrl: 'sing-sub/templates/default.json', nodesPath: '',
        rules: [], inboundRules: [], order: 0,
      })),
      await file('sing-sub/templates/default.json', '{"route":{},"log":{"level":"info"}}'),
    ]);
    const formattedDifferently = await importSyncTree([
      await file('sing-sub/templates/default.json', '{\n  "log": { "level": "info" },\n  "route": {}\n}\n'),
      await file('sing-sub/configs/default.json', '{"order":0,"inboundRules":[],"rules":[],"nodesPath":"","templateUrl":"sing-sub/templates/default.json","name":"default"}'),
    ]);

    expect(imported.contentHash).toBe(formattedDifferently.contentHash);
    expect(imported.files[0].content.endsWith('\n')).toBe(true);
    expect(imported.files[1].content).toContain('  "log"');
  });

  it('rejects name mismatches, duplicate case variants, and missing references', async () => {
    await expect(importSyncTree([
      await file('sing-sub/configs/default.json', JSON.stringify({
        name: 'other', templateUrl: '', nodesPath: '', rules: [], inboundRules: [], order: 0,
      })),
    ])).rejects.toMatchObject<Partial<SyncTreeValidationError>>({ code: 'NAME_MISMATCH' });

    await expect(importSyncTree([
      await file('sing-sub/nodes/a.json', '[]'),
      await file('sing-sub/nodes/A.json', '[]'),
    ])).rejects.toMatchObject<Partial<SyncTreeValidationError>>({ code: 'DUPLICATE_PATH' });

    await expect(importSyncTree([
      await file('sing-sub/configs/default.json', JSON.stringify({
        name: 'default', templateUrl: 'sing-sub/templates/missing.json', nodesPath: '',
        rules: [], inboundRules: [], order: 0,
      })),
    ])).rejects.toMatchObject<Partial<SyncTreeValidationError>>({ code: 'MISSING_REFERENCE' });
  });
});
