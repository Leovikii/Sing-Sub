import { describe, expect, it } from 'vitest';
import { buildProfile } from '../../worker/lib/builder';
import { normalizeLegacyRulesetUrls } from '../../worker/lib/workspace-builder';
import type { Profile } from '../../shared';

const profile: Profile = {
  name: 'default',
  templateUrl: 'sing-sub/templates/default.json',
  adapterUrl: 'sing-sub/adapters/default.json',
  nodesPath: 'sing-sub/nodes/default.json',
  rules: [{ group: 'proxy', filters: [{ action: 'include', keyword: 'HK' }] }],
  inboundRules: [{ tag: 'tun', filters: [{ action: 'exclude', keyword: 'blocked' }] }],
  order: 0,
};

describe('profile builder', () => {
  it('preserves template key order and selected node source order', async () => {
    const orderedProfile: Profile = {
      ...profile,
      adapterUrl: '',
      rules: [{ group: 'proxy', filters: [{ action: 'include', keyword: 'node' }] }],
      inboundRules: [
        { tag: 'tun', filters: [{ action: 'include', keyword: 'inbound-a' }] },
        { tag: 'tun', filters: [{ action: 'include', keyword: 'inbound-b' }] },
      ],
    };
    const template = {
      experimental: { cache_file: 'cache.db' },
      log: { level: 'info' },
      inbounds: [{ type: 'tun', tag: 'tun' }],
      outbounds: [{ type: 'selector', tag: 'proxy', outbounds: ['direct'] }],
      route: { final: 'proxy' },
    };
    const nodes = {
      inbounds: [
        { type: 'mixed', tag: 'inbound-a' },
        { type: 'mixed', tag: 'inbound-b' },
      ],
      outbounds: [
        { type: 'vmess', tag: 'node-z' },
        { type: 'vmess', tag: 'node-a' },
      ],
    };

    const result = await buildProfile(orderedProfile, {
      loadTemplate: async () => template,
      loadRepoJson: async () => nodes,
    });

    expect(Object.keys(JSON.parse(result))).toEqual([
      'experimental', 'log', 'inbounds', 'outbounds', 'route',
    ]);
    const parsed = JSON.parse(result);
    expect(parsed.outbounds.map((item: { tag: string }) => item.tag)).toEqual([
      'proxy', 'node-z', 'node-a',
    ]);
    expect(parsed.inbounds.map((item: { tag: string }) => item.tag)).toEqual([
      'tun', 'inbound-a', 'inbound-b',
    ]);
  });

  it('applies strict adapter replacements before inserting filtered nodes', async () => {
    const template = {
      log: { level: 'info' },
      inbounds: [{ type: 'tun', tag: 'tun' }],
      outbounds: [{ type: 'selector', tag: 'proxy', outbounds: ['direct'] }],
      route: { rules: [{ action: 'sniff' }, { action: 'hijack-dns', protocol: 'dns' }] },
    };
    const nodes = {
      inbounds: [
        { type: 'mixed', tag: 'lan' },
        { type: 'mixed', tag: 'blocked-lan' },
      ],
      outbounds: [
        { type: 'vmess', tag: 'HK-1' },
        { type: 'vmess', tag: 'US-1' },
      ],
    };
    const resources = {
      loadTemplate: async () => template,
      loadRepoJson: async (path: string) => path.includes('/adapters/')
        ? {
            schemaVersion: 1,
            name: 'default',
            replacements: [
              { path: ['inbounds'], value: [{ type: 'tun', tag: 'tun' }] },
              {
                path: ['route', 'rules'],
                match: { action: 'hijack-dns' },
                value: { inbound: 'dns-in', action: 'hijack-dns' },
              },
            ],
          }
        : nodes,
    };

    const result = JSON.parse(await buildProfile(profile, resources));

    expect(result.log.level).toBe('info');
    expect(result.route.rules).toEqual([
      { action: 'sniff' },
      { inbound: 'dns-in', action: 'hijack-dns' },
    ]);
    expect(result.inbounds.map((item: { tag: string }) => item.tag)).toEqual(['tun', 'lan']);
    expect(result.outbounds[0].outbounds).toEqual(['direct', 'HK-1']);
    expect(result.outbounds.map((item: { tag: string }) => item.tag)).toEqual(['proxy', 'HK-1']);
    expect(template.log.level).toBe('info');
    expect(nodes.outbounds).toHaveLength(2);
  });

  it('rejects adapter replacements with missing or ambiguous matches', async () => {
    const invalidProfile = { ...profile, nodesPath: '' };
    const resources = {
      loadTemplate: async () => ({
        inbounds: [],
        route: { rules: [{ action: 'hijack-dns' }, { action: 'hijack-dns' }] },
      }),
      loadRepoJson: async (path: string) => path.includes('/adapters/')
        ? {
            schemaVersion: 1,
            name: 'default',
            replacements: [{
              path: ['route', 'rules'],
              match: { action: 'hijack-dns' },
              value: { inbound: 'dns-in', action: 'hijack-dns' },
            }],
          }
        : null,
    };

    await expect(buildProfile(invalidProfile, resources)).rejects.toThrow('expected one match');
  });

  it('normalizes only same-origin legacy tokenized ruleset URLs', () => {
    const config = JSON.stringify({
      route: {
        rule_set: [
          { tag: 'direct', url: 'https://ss.example.com/rules/old-token/direct.srs' },
          { tag: 'source', url: '/rules/old-token/source.json' },
          { tag: 'current', url: 'https://ss.example.com/rules/current.srs' },
          { tag: 'external', url: 'https://other.example.com/rules/token/external.srs' },
        ],
      },
    });

    const normalized = JSON.parse(normalizeLegacyRulesetUrls(config, 'https://ss.example.com'));

    expect(normalized.route.rule_set).toEqual([
      { tag: 'direct', url: 'https://ss.example.com/rules/direct.srs' },
      { tag: 'source', url: 'https://ss.example.com/rules/source.json' },
      { tag: 'current', url: 'https://ss.example.com/rules/current.srs' },
      { tag: 'external', url: 'https://other.example.com/rules/token/external.srs' },
    ]);
    expect(JSON.stringify(normalized)).not.toContain('old-token');
  });
});
