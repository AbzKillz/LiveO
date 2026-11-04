import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { FilterSchema, letterRangeParam, numericRange, postFilter, toPropaltQueries, weeksListed, weeksParam } from '@/lib/filters';
import { formatPropaltAddress } from '@/lib/propalt';

const sale = JSON.parse(fs.readFileSync('fixtures/propalt-for-sale.json', 'utf8'));

describe('filters to Propalt', () => {
  it('sends nothing for untouched sliders', () => {
    const [q] = toPropaltQueries(FilterSchema.parse({ outcodes: ['nw3'] }));
    expect(q).toEqual({ side: 'sale', progress: 'for_sale', page: 0, first_postcode: 'NW3' });
  });

  it('builds N-M ranges Propalt accepts (it rejects "N-null")', () => {
    expect(numericRange([500000, null])).toBe('500000-1000000000');
    expect(numericRange([null, 3], 20)).toBe('0-3');
    expect(numericRange([4, 2])).toBe('2-4');
  });

  it('maps time on market to a first_listed_date week window', () => {
    expect(weeksParam([4, null])).toBe('min_week:4|max_week:null');
    expect(weeksParam([null, 2])).toBe('min_week:null|max_week:2');
  });

  it('orders letter bands', () => {
    expect(letterRangeParam(['E', 'C'], 'ABCDEFG')).toBe('C-E');
    expect(letterRangeParam([null, 'C'], 'ABCDEFG')).toBe('A-C');
  });

  it('fans out one query per district and drops tax band for lettings', () => {
    const qs = toPropaltQueries(FilterSchema.parse({ side: 'let', outcodes: ['SW18', 'SW11'], taxBand: ['B', 'D'], beds: [2, 3] }));
    expect(qs.map((q) => q.first_postcode)).toEqual(['SW18', 'SW11']);
    expect(qs[0]).toMatchObject({ progress: 'for_rent', numbeds: '2-3' });
    expect(qs[0]).not.toHaveProperty('taxband_rating');
  });

  it('rejects bad outcodes', () => {
    expect(FilterSchema.safeParse({ outcodes: ['NW3 1AA'] }).success).toBe(false);
  });

  it('post filters on discount to estimate', () => {
    const f = FilterSchema.parse({ outcodes: ['NW3'], minBelowEstimatePct: 15 });
    // 435k vs 550k estimate is 20.9% below; 5.5m vs 5.5875m is 1.6% below.
    expect(postFilter(sale.data, f).map((r: { property_id: number }) => r.property_id)).toEqual([19439602]);
  });

  it('formats Propalt addresses and weeks listed', () => {
    expect(formatPropaltAddress(sale.data[0])).toBe('11 Eton Rise, Eton College Road, London, NW3 2DE');
    expect(weeksListed('2026-10-01', new Date('2026-11-04'))).toBe(4);
  });
});
