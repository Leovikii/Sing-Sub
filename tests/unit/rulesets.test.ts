import { describe, expect, it } from 'vitest';
import {
  createRulesetDocument,
  mergeRuleBuckets,
  parseImportedRules,
  parsePublicJsonUrl,
  readRulesetMetadata,
  validateRulesetSource,
  type RuleBucket,
} from '../../worker/lib/rulesets';

const emptyRules = (): RuleBucket => ({
  domain: [],
  domain_suffix: [],
  domain_keyword: [],
  domain_regex: [],
});

describe('public ruleset URLs', () => {
  it('accepts a public HTTPS URL and normalizes it', () => {
    expect(parsePublicJsonUrl('https://example.com/rules.json').toString())
      .toBe('https://example.com/rules.json');
  });

  it.each([
    'http://example.com/rules.json',
    'https://localhost/rules.json',
    'https://127.0.0.1/rules.json',
    'https://10.0.0.1/rules.json',
    'https://user:secret@example.com/rules.json',
    'https://example.com/rules.json#secret',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => parsePublicJsonUrl(url)).toThrow();
  });
});

describe('ruleset parsing', () => {
  it('normalizes and deduplicates imported domain rules', () => {
    expect(parseImportedRules(JSON.stringify({
      rules: [
        { domain: ['EXAMPLE.com', 'example.com'] },
        { domain_suffix: '.Example.org', domain_keyword: ' CDN ' },
        { domain_regex: '^raw\\.example$' },
      ],
    }))).toEqual({
      domain: ['example.com'],
      domain_suffix: ['example.org'],
      domain_keyword: ['cdn'],
      domain_regex: ['^raw\\.example$'],
    });
  });

  it('rejects unsupported rule fields', () => {
    expect(() => parseImportedRules('{"rules":[{"ip_cidr":"1.1.1.1/32"}]}'))
      .toThrow('Rules may only contain');
  });

  it('merges buckets in stable first-seen order', () => {
    expect(mergeRuleBuckets([
      { ...emptyRules(), domain: ['B.example', 'a.example'] },
      { ...emptyRules(), domain: ['a.example', 'c.example'] },
    ]).domain).toEqual(['b.example', 'a.example', 'c.example']);
  });

  it('round-trips metadata while keeping generated rules sing-box compatible', () => {
    const content = createRulesetDocument({
      note: 'local rules',
      manual: { ...emptyRules(), domain_suffix: ['Example.com'] },
      sources: [{ url: 'https://example.org/rules.json', interval_hours: 24 }],
    }, [{ ...emptyRules(), domain: ['cdn.example.com'] }]);

    expect(JSON.parse(content)).toMatchObject({
      version: 2,
      rules: [{ domain: ['cdn.example.com'], domain_suffix: ['example.com'] }],
    });
    expect(readRulesetMetadata(content)).toEqual({
      note: 'local rules',
      manual: { ...emptyRules(), domain_suffix: ['example.com'] },
      sources: [{ url: 'https://example.org/rules.json', interval_hours: 24 }],
    });
    expect(validateRulesetSource(content)).toBeNull();
  });
});
