import { describe, expect, it } from 'vitest';
import {
  adapterPresetSchema,
  loginRequestSchema,
  profileSchema,
  putStateRequestSchema,
  stateDataSchema,
} from '../../shared';

const validProfile = {
  name: 'default',
  templateUrl: 'sing-sub/templates/default.json',
  nodesPath: 'sing-sub/nodes/default.json',
  rules: [{ group: 'proxy', filters: [{ action: 'include' as const, keyword: 'HK' }] }],
  inboundRules: [{ tag: 'tun', filters: [{ action: 'exclude' as const, keyword: 'LAN' }] }],
  adapterUrl: 'sing-sub/adapters/momo.json',
  order: 0,
};

describe('shared request schemas', () => {
  it('parses a complete nested profile', () => {
    expect(profileSchema.parse(validProfile)).toEqual(validProfile);
  });

  it('rejects invalid nested filter actions', () => {
    const profile = structuredClone(validProfile) as Record<string, any>;
    profile.rules[0].filters[0].action = 'allow';
    expect(profileSchema.safeParse(profile).success).toBe(false);
  });

  it('rejects external profile templates', () => {
    const profile = { ...validProfile, templateUrl: 'https://example.com/template.json' };
    expect(profileSchema.safeParse(profile).success).toBe(false);
  });

  it('only accepts workspace adapter references', () => {
    expect(profileSchema.safeParse({ ...validProfile, adapterUrl: 'sing-sub/templates/momo.json' }).success).toBe(false);
    expect(profileSchema.safeParse({ ...validProfile, adapterUrl: 'https://example.com/momo.json' }).success).toBe(false);
  });

  it('accepts replacement-only adapters and rejects unknown operations', () => {
    expect(adapterPresetSchema.safeParse({
      schemaVersion: 1,
      name: 'momo',
      replacements: [{ path: ['inbounds'], value: [] }],
    }).success).toBe(true);
    expect(adapterPresetSchema.safeParse({
      schemaVersion: 1,
      name: 'momo',
      replacements: [{ op: 'append', path: ['inbounds'], value: [] }],
    }).success).toBe(false);
  });

  it('rejects duplicate profile names', () => {
    expect(stateDataSchema.safeParse({ profiles: [validProfile, validProfile] }).success).toBe(false);
  });

  it('rejects unknown request fields', () => {
    expect(putStateRequestSchema.safeParse({
      state: { profiles: [validProfile] },
      expectedRevision: 'revision-1',
      force: true,
    }).success).toBe(false);
  });

  it('accepts only password-based login', () => {
    expect(loginRequestSchema.safeParse({ adminPassword: 'password' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ adminPassword: 'password', owner: 'owner', repo: 'repo', pat: 'token' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ adminPassword: 'password', owner: 'owner' }).success).toBe(false);
  });
});
