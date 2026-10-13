import { describe, expect, it } from 'vitest';
import { formatResourceTime } from '../../src-react/features/resources/resource-time';

const now = Date.parse('2026-10-13T06:30:00Z');
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

describe('resource timestamps', () => {
  it.each([
    [0, 'now'], [59, 'now'], [60, '1 minute ago'], [3599, '59 minutes ago'],
    [3600, '1 hour ago'], [86399, '23 hours ago'], [86400, '1 day ago'],
    [2591999, '29 days ago'],
  ])('formats %s seconds ago without rounding into the next unit', (seconds, label) => {
    expect(formatResourceTime(ago(seconds), 'en-US', now)?.label).toBe(label);
  });

  it('uses absolute dates after 30 days and for future clocks, and always includes a full time', () => {
    for (const seconds of [2592000, -3600]) {
      const result = formatResourceTime(ago(seconds), 'en-US', now)!;
      expect(result.label).toMatch(/2026/);
      expect(result.absolute).toContain('2026');
      expect(result.absolute).toMatch(/GMT|UTC/);
    }
    expect(formatResourceTime(ago(120), 'zh-CN', now)?.label).toBe('2分钟前');
    expect(formatResourceTime(undefined, 'en-US', now)).toBeNull();
    expect(formatResourceTime('invalid', 'en-US', now)).toBeNull();
  });
});
