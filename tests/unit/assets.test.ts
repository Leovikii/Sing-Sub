import { describe, expect, it } from 'vitest';
import { parseManagedAssetPath } from '../../worker/domain/assets/managed-asset-path';

describe('managed asset paths', () => {
  it.each([
    'sing-sub/nodes/home.json',
    'sing-sub/templates/default.json',
    'sing-sub/adapters/mobile-v2.json',
    'sing-sub/rulesets/private_domains.json',
  ])('accepts %s', (path) => {
    expect(parseManagedAssetPath(path)).not.toBeNull();
  });

  it.each([
    'nodes/home.json',
    'sing-sub/nodes/nested/home.json',
    'sing-sub/nodes/.hidden.json',
    'sing-sub/nodes/home.yaml',
    'sing-sub/unknown/home.json',
  ])('rejects %s', (path) => {
    expect(parseManagedAssetPath(path)).toBeNull();
  });
});
