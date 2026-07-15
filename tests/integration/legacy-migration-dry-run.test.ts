import { describe, expect, it } from 'vitest';
import type { GithubImportSettings } from '../../worker/application/migration/legacy-migration-model';
import type { LegacyGithubSource } from '../../worker/application/ports/legacy-source-reader';
import { dryRunLegacyMigration } from '../../worker/infrastructure/legacy/legacy-migration-dry-run';

const settings: GithubImportSettings = {
  pat: 'github-token',
  owner: 'owner',
  repo: 'repo',
  userLogin: 'user',
  userAvatar: '',
  defaultBranch: 'main',
};

const profile = {
  name: 'default',
  templateUrl: 'sing-sub/templates/default.json',
  patchUrl: 'sing-sub/patches/default.json',
  nodesPath: 'sing-sub/nodes/default.json',
  rules: [],
  inboundRules: [],
  order: 0,
};

function source(overrides: Partial<LegacyGithubSource> = {}): LegacyGithubSource {
  const contents = [
    ['sing-sub/configs/default.json', JSON.stringify(profile)],
    ['sing-sub/nodes/default.json', '[]'],
    ['sing-sub/templates/default.json', '{}'],
    ['sing-sub/patches/default.json', '{}'],
    ['sing-sub/rulesets/private.json', JSON.stringify({
      version: 2,
      rules: [],
      _sing_sub: { note: 'Private rules', sources: [] },
    })],
  ] as const;
  return {
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    commitSha: 'commit-1',
    files: contents.map(([path, content], index) => ({
      path,
      content,
      blobSha: `blob-${index}`,
      size: new TextEncoder().encode(content).byteLength,
    })),
    ...overrides,
  };
}

describe('dryRunLegacyMigration', () => {
  it('normalizes a complete legacy snapshot without retaining credentials in assets', () => {
    const result = dryRunLegacyMigration(source(), settings);

    expect(result).toMatchObject({
      valid: true,
      fileCount: 5,
      counts: { profiles: 1, nodes: 1, templates: 1, patches: 1, rulesets: 1 },
      issues: [],
      normalized: {
        profiles: [{ name: 'default' }],
        assets: { rulesets: { private: { note: 'Private rules' } } },
      },
    });
    expect(JSON.stringify(result.normalized?.assets)).not.toContain('github-token');
  });

  it('reports malformed profiles and never returns partial normalized data', () => {
    const invalid = source();
    invalid.files[0] = { ...invalid.files[0], content: '{"name":"default"}' };

    const result = dryRunLegacyMigration(invalid, settings);

    expect(result.valid).toBe(false);
    expect(result.normalized).toBeUndefined();
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'INVALID_SCHEMA',
      path: 'sing-sub/configs/default.json',
    }));
  });

  it('reports missing local references', () => {
    const missing = source();
    missing.files = missing.files.filter(file => file.path !== 'sing-sub/nodes/default.json');

    const result = dryRunLegacyMigration(missing, settings);

    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'MISSING_REFERENCE',
      message: expect.stringContaining('sing-sub/nodes/default.json'),
    }));
  });

  it('reports case-insensitive entity collisions', () => {
    const collision = source();
    collision.files.push({
      path: 'sing-sub/templates/Default.json',
      content: '{}',
      blobSha: 'blob-collision',
      size: 2,
    });

    const result = dryRunLegacyMigration(collision, settings);

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'NAME_COLLISION' }));
  });

  it('reports source coordinate mismatches', () => {
    const result = dryRunLegacyMigration(source({ branch: 'other' }), settings);

    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'SOURCE_MISMATCH' }));
  });
});
