import { describe, expect, it } from 'vitest';
import { reconcileOrder, readOrder } from '../../src-react/components/entity-order';

describe('browser display order', () => {
  it('keeps surviving choices, removes duplicates/deletions, and appends new items', () => {
    expect(reconcileOrder(['a', 'b', 'c'], ['b', 'deleted', 'b', 'a'])).toEqual(['b', 'a', 'c']);
  });
  it('ignores malformed saved preferences without losing server items', () => {
    expect(readOrder('broken', { getItem: () => '{' })).toEqual([]);
    expect(readOrder('broken', { getItem: () => '[1,"b"]' })).toEqual([]);
    expect(readOrder('blocked', { getItem: () => { throw new Error('blocked'); } })).toEqual([]);
  });
});
