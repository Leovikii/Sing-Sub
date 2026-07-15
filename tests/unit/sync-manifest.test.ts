import { describe, expect, it } from 'vitest';
import { syncManifestSchema, type WorkspaceSnapshot } from '../../shared';
import { exportWorkspaceForSync, SYNC_MANIFEST_PATH } from '../../worker/application/sync/export-workspace';
import { encodeSyncPath, parseSyncPath } from '../../worker/domain/sync/sync-path';
import { sha256Hex } from '../../worker/domain/revisions/canonical-json';

function snapshot(): WorkspaceSnapshot {
  return {
    schemaVersion: 1,
    workspaceId: 'primary',
    revisionId: 'revision-7',
    previousRevisionId: 'revision-6',
    createdAt: '2026-07-15T04:00:00.000Z',
    settings: {
      owner: 'private-owner',
      repo: 'private-repo',
      userLogin: 'Administrator',
      userAvatar: '',
      defaultBranch: 'main',
      authVersion: 4,
      tokenVersion: 9,
    },
    profiles: [{
      name: 'default', templateUrl: 'sing-sub/templates/default.json', nodesPath: '',
      rules: [], inboundRules: [], order: 0,
    }],
    assets: {
      nodes: {},
      templates: {
        default: { path: 'sing-sub/templates/default.json', content: { log: { level: 'info' } } },
      },
      patches: {},
      rulesets: {
        direct: { path: 'sing-sub/rulesets/direct.json', content: { version: 2, rules: [] } },
      },
    },
    builds: {
      direct: {
        jobId: 'job-private', rulesetId: 'direct', sourceHash: 'a'.repeat(64),
        compilerVersion: '1.13.14', status: 'ready', updatedAt: '2026-07-15T04:00:00.000Z',
      },
    },
    sync: {
      status: 'synced',
      baseWorkspaceRevision: 'revision-6',
      baseRemoteRevision: 'secret-remote-revision',
      baseContentHash: 'b'.repeat(64),
      baseRepository: 'private-owner/private-repo',
    },
  };
}

describe('sync path codec', () => {
  it('roundtrips canonical paths and rejects traversal or nested paths', () => {
    expect(parseSyncPath(encodeSyncPath('rulesets', 'private.domains'))).toEqual({
      kind: 'rulesets', entityId: 'private.domains',
    });
    expect(parseSyncPath('sing-sub/rulesets/../private.json')).toBeNull();
    expect(parseSyncPath('sing-sub/rulesets/nested/private.json')).toBeNull();
    expect(() => encodeSyncPath('configs', '../private')).toThrow('Invalid sync entity ID');
  });
});

describe('workspace sync export', () => {
  it('exports a stable editable tree and manifest without runtime or private metadata', async () => {
    const options = { baseRemoteRevision: 'commit-6', exportedAt: '2026-07-15T05:00:00.000Z' };
    const first = await exportWorkspaceForSync(snapshot(), options);
    const second = await exportWorkspaceForSync(structuredClone(snapshot()), options);

    expect(first).toEqual(second);
    expect(first.files.map(file => file.path)).toEqual([
      'sing-sub/configs/default.json',
      'sing-sub/rulesets/direct.json',
      'sing-sub/templates/default.json',
      SYNC_MANIFEST_PATH,
    ]);
    expect(syncManifestSchema.parse(first.manifest)).toEqual(first.manifest);
    expect(first.manifest.files).toHaveLength(3);
    expect(first.manifest.contentHash).toBe(first.contentHash);
    expect(first.manifestHash).toBe(await sha256Hex(first.files.at(-1)!.content));
    expect(first.files[0].content).toContain('\n  "');
    expect(first.files[0].content.endsWith('\n')).toBe(true);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain('private-owner');
    expect(serialized).not.toContain('job-private');
    expect(serialized).not.toContain('secret-remote-revision');
    expect(serialized).not.toContain('authVersion');
    expect(serialized).not.toContain('tokenVersion');
  });

  it('changes only affected file and manifest hashes when content changes', async () => {
    const options = { baseRemoteRevision: null, exportedAt: '2026-07-15T05:00:00.000Z' };
    const initial = await exportWorkspaceForSync(snapshot(), options);
    const changedSnapshot = snapshot();
    changedSnapshot.assets.templates.default.content = { log: { level: 'warn' } };
    const changed = await exportWorkspaceForSync(changedSnapshot, options);

    const initialHashes = Object.fromEntries(initial.files.map(file => [file.path, file.contentHash]));
    const changedHashes = Object.fromEntries(changed.files.map(file => [file.path, file.contentHash]));
    expect(changedHashes['sing-sub/configs/default.json']).toBe(initialHashes['sing-sub/configs/default.json']);
    expect(changedHashes['sing-sub/rulesets/direct.json']).toBe(initialHashes['sing-sub/rulesets/direct.json']);
    expect(changedHashes['sing-sub/templates/default.json']).not.toBe(initialHashes['sing-sub/templates/default.json']);
    expect(changed.manifestHash).not.toBe(initial.manifestHash);
  });
});
