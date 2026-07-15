import { describe, expect, it } from 'vitest';
import { loginRequestSchema, profileSchema, putStateRequestSchema, stateDataSchema } from '../../shared';

const validProfile = {
  name: 'default',
  templateUrl: 'sing-sub/templates/default.json',
  nodesPath: 'sing-sub/nodes/default.json',
  rules: [{ group: 'proxy', filters: [{ action: 'include' as const, keyword: 'HK' }] }],
  inboundRules: [{ tag: 'tun', filters: [{ action: 'exclude' as const, keyword: 'LAN' }] }],
  overrides: { log: { level: 'warn' } },
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

  it('accepts password-only login and requires complete setup coordinates', () => {
    expect(loginRequestSchema.safeParse({ adminPassword: 'password' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ adminPassword: 'password', owner: 'owner', repo: 'repo', pat: 'token' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ adminPassword: 'password', owner: 'owner' }).success).toBe(false);
    expect(loginRequestSchema.safeParse({ adminPassword: 'password', owner: '', repo: '', pat: '' }).success).toBe(false);
  });
});
