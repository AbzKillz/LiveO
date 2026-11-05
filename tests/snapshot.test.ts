import { describe, expect, it } from 'vitest';
import { snapshotQuery, SNAPSHOT_OUTCODES } from '@/lib/snapshot';
import { FilterSchema, postFilter, toPropaltQueries } from '@/lib/filters';

const run = (f: object) => toPropaltQueries(FilterSchema.parse(f)).flatMap((q) => snapshotQuery(q as never).data);

describe('snapshot listings', () => {
  it('covers NW1 and NW3', () => {
    expect(SNAPSHOT_OUTCODES).toEqual(['NW1', 'NW3']);
  });
  it('filters by district, price and beds like Propalt', () => {
    const r = run({ outcodes: ['NW3'], price: [1000000, 2000000], beds: [2, 3] });
    expect(r.length).toBeGreaterThan(0);
    for (const x of r) {
      expect(x.postcode.startsWith('NW3 ')).toBe(true);
      expect(x.current_price).toBeGreaterThanOrEqual(1000000);
      expect(x.current_price).toBeLessThanOrEqual(2000000);
      expect(x.num_beds).toBeGreaterThanOrEqual(2);
    }
  });
  it('returns only reductions when asked', () => {
    const r = run({ side: 'let', status: 'reduction', outcodes: ['NW1', 'NW3'] });
    expect(r.map((x) => x.property_id).sort()).toEqual([19389566, 19397567, 19456789]);
  });
  it('compares lettings against predicted rent, not sale value', () => {
    const f = FilterSchema.parse({ side: 'let', outcodes: ['NW1'], minBelowEstimatePct: 40 });
    const kept = postFilter(run(f), f);
    // 1 Bridgeway Street: £899 pcm against a £2,330 predicted rent.
    expect(kept.map((x) => x.property_id)).toContain(19389566);
    expect(kept.length).toBeLessThan(5);
  });
});
