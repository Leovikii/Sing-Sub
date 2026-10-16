import { legacySnapshot } from '../fakes/metadata-fixture';
import { describe, expect, it } from 'vitest';
import { entityMetadataSchema, portableMetadataSchema, persistedWorkspaceSnapshotSchema } from '../../shared';
import { dryRunMetadataMigration, normalizeWorkspace, persistWorkspace, splitAsset } from '../../worker/lib/workspace-metadata';

describe('unified metadata boundary', () => {
  it('keeps one authoritative metadata section and preserves known times and business keys', () => {
    const result = persistWorkspace(legacySnapshot());
    expect(result.schemaVersion).toBe(4);
    expect(result.profiles[0]).not.toHaveProperty('order');
    expect(result.profiles[0]).not.toHaveProperty('note');
    expect(result.assets.templates.base).not.toHaveProperty('updatedAt');
    expect(result.assets.templates.base.content).not.toHaveProperty('note');
    expect(result.metadata.entities['sing-sub/configs/home.json'].createdAt).toBe(new Date(1234567890123).toISOString());
    expect(result.metadata.entities['sing-sub/templates/base.json'].editor?.annotations).toEqual([{ direction: 'outbound', tag: 'proxy', note: 'private-child' }]);
    expect(JSON.stringify(result.assets)).toContain('business');
    expect(JSON.stringify(result.assets)).not.toContain('private');
    expect(persistWorkspace(normalizeWorkspace(legacySnapshot()))).toEqual(result);
  });
  it('blocks ambiguous and unknown management fields without mutating input', () => {
    const source = legacySnapshot();
    source.assets.templates.base.content = { outbounds: [{ tag: 'same', note: 'a' }, { tag: 'same' }] };
    const original = structuredClone(source);
    expect(dryRunMetadataMigration(source).errors[0]).toContain('unique tag');
    expect(source).toEqual(original);
    expect(() => splitAsset({ path: 'sing-sub/nodes/x.json', content: { _sing_sub: { unknown: true } } })).toThrow('unknown');
    expect(() => splitAsset({ path: 'sing-sub/nodes/x.json', content: { note: 'a', _sing_sub: { note: 'b' } } })).toThrow('conflicting');
  });
  it('moves manual/source editor data without keeping a body copy', () => {
    const split = splitAsset({ path: 'sing-sub/rulesets/ad.json', content: { version: 2, rules: [{ domain: ['example.com'] }], _sing_sub: { note: 'ad', manual: { domain: ['example.com'] }, sources: [{ url: 'https://example.com/source.json', interval_hours: 24, last_updated: '2026-10-15T00:00:00.000Z' }] } } });
    expect(split.asset.content).toEqual({ version: 2, rules: [{ domain: ['example.com'] }] });
    expect(split.metadata.editor?.ruleset?.sources[0]).toEqual({ url: 'https://example.com/source.json', intervalHours: 24, lastFetchedAt: '2026-10-15T00:00:00.000Z' });
  });
  it('rejects unknown fields, invalid times and metadata attached to the wrong kind', () => {
    expect(entityMetadataSchema.safeParse({ updatedAt: 'yesterday' }).success).toBe(false);
    expect(entityMetadataSchema.safeParse({ secret: 'no' }).success).toBe(false);
    expect(portableMetadataSchema.safeParse({ schemaVersion: 1, entities: { 'sing-sub/nodes/a.json': { contentHash: 'a'.repeat(64), display: { outboundOrder: [] } } } }).success).toBe(false);
  });
  it('rejects incomplete or mixed v4 snapshots without stripping legal business keys', () => {
    const valid = persistWorkspace(legacySnapshot());
    expect(persistedWorkspaceSnapshotSchema.safeParse(valid).success).toBe(true);
    const missing = structuredClone(valid); delete missing.metadata.entities['sing-sub/templates/base.json'];
    expect(persistedWorkspaceSnapshotSchema.safeParse(missing).success).toBe(false);
    const mixed = structuredClone(valid); mixed.assets.templates.base.content = { note: 'leak', outbounds: [] };
    expect(persistedWorkspaceSnapshotSchema.safeParse(mixed).success).toBe(false);
    const identity = structuredClone(valid); identity.assets.templates.base.path = 'sing-sub/templates/other.json';
    expect(persistedWorkspaceSnapshotSchema.safeParse(identity).success).toBe(false);
  });
});
