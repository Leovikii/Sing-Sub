import { describe, expect, it } from 'vitest';
import { analyzeSyncState, diffSyncFiles } from '../../worker/domain/sync/sync-state';
import type { SyncFile } from '../../worker/application/ports/sync-gateway';

function file(path: string, contentHash: string): SyncFile {
  return { path, content: '{}\n', contentHash };
}

function tree(revision: string, contentHash: string, files: SyncFile[]) {
  return { revision, contentHash, files };
}

describe('sync state analysis', () => {
  const baseFiles = [file('sing-sub/nodes/a.json', 'a')];
  const base = { ...tree('workspace-base', 'base', baseFiles), remoteRevision: 'commit-base' };

  it.each([
    ['synced', 'base', 'base', true, true],
    ['local-ahead', 'local', 'base', true, false],
    ['remote-ahead', 'base', 'remote', false, true],
    ['conflict', 'local', 'remote', false, false],
  ] as const)('classifies %s', (status, localHash, remoteHash, canPush, canPull) => {
    const analysis = analyzeSyncState(
      base,
      tree('local-revision', localHash, baseFiles),
      tree('remote-revision', remoteHash, baseFiles),
    );
    expect(analysis).toMatchObject({ status, canPush, canPull });
  });

  it('aligns identical divergent content and requires a choice on the first different sync', () => {
    expect(analyzeSyncState(
      base,
      tree('local', 'same-new', []),
      tree('remote', 'same-new', []),
    )).toMatchObject({ status: 'synced', sameContent: true, canPush: true, canPull: true });

    expect(analyzeSyncState(
      null,
      tree('local', 'local', baseFiles),
      tree('remote', 'remote', []),
    )).toMatchObject({ status: 'never', canPush: false, canPull: false, requiresResolution: true });
  });

  it('reports deterministic additions, modifications, and deletions', () => {
    expect(diffSyncFiles(
      [file('sing-sub/nodes/a.json', 'a'), file('sing-sub/nodes/b.json', 'b')],
      [file('sing-sub/nodes/b.json', 'changed'), file('sing-sub/nodes/c.json', 'c')],
    )).toEqual({
      added: ['sing-sub/nodes/c.json'],
      modified: ['sing-sub/nodes/b.json'],
      deleted: ['sing-sub/nodes/a.json'],
    });
  });
});
