import { describe, expect, it } from 'vitest';
import enUS from '../../src/i18n/messages/en-US';
import zhCN from '../../src/i18n/messages/zh-CN';

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
});
