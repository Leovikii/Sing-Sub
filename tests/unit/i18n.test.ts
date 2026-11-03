import { describe, expect, it } from 'vitest';
import enUS from '../../src/i18n/messages/en-US';
import zhCN from '../../src/i18n/messages/zh-CN';
import { createInstance } from 'i18next';

function messageKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value)
    .flatMap(([key, child]) => messageKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe('i18n catalogs', () => {
  it('keeps Simplified Chinese and English keys in parity', () => {
    expect(messageKeys(enUS)).toEqual(messageKeys(zhCN));
  });
  it('interpolates sync warning counts using the application placeholder syntax', async () => {
    const i18n = createInstance();
    await i18n.init({ resources: { 'zh-CN': { translation: zhCN }, 'en-US': { translation: enUS } },
      lng: 'zh-CN', interpolation: { prefix: '{', suffix: '}', escapeValue: false } });
    for (const lng of ['zh-CN', 'en-US']) {
      const message = i18n.t('sync.metadataWarnings', { lng, count: 3 });
      expect(message).toContain('3');
      expect(message).not.toMatch(/[{}]/);
    }
  });
});
