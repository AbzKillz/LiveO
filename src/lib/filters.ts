import { z } from 'zod';
import type { ListingQuery, PropaltListing } from './propalt';

/** A [min, max] pair where either end may be null for "no limit". */
const range = z.tuple([z.number().nullable(), z.number().nullable()]).default([null, null]);
const letterRange = z.tuple([z.string().nullable(), z.string().nullable()]).default([null, null]);

export const OUTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?$/;

export const FilterSchema = z.object({
  side: z.enum(['sale', 'let']).default('sale'),
  status: z.enum(['for_sale', 'for_rent', 'reduction', 'withdrawn', 'sold_sstc', 'let_agreed']).optional(),
  outcodes: z.array(z.string().toUpperCase().regex(OUTCODE_RE)).max(20).default([]),
  price: range,
  beds: range,
  floorArea: range,
  plotSize: range,
  /** Time on market, in weeks since first listed. */
  weeksOnMarket: range,
  /** Only listings reduced within the last N weeks. */
  reducedWithinWeeks: z.number().int().positive().nullable().default(null),
  epc: letterRange,
  taxBand: letterRange,
  propertyTypes: z.array(z.enum(['Detached', 'Flat', 'Semi-Detached', 'Terraced'])).default([]),
  tenure: z.enum(['freehold', 'leasehold']).nullable().default(null),
  proprietorTypes: z.array(z.enum(['private', 'business', 'house_association', 'local_authority'])).default([]),
  agent: z.string().trim().max(100).nullable().default(null),
  hmo: z.boolean().default(false),
  potentialHmo: z.boolean().default(false),
  retirement: z.boolean().default(false),
  accessible: z.boolean().default(false),
  // Computed locally on the fetched page, because Propalt has no such filter.
  minBelowEstimatePct: z.number().min(0).max(90).nullable().default(null),
  minPriceCutPct: z.number().min(0).max(90).nullable().default(null),
  page: z.number().int().min(0).max(500).default(0),
});

export type Filters = z.infer<typeof FilterSchema>;

/** Propalt expects "N" or "N-M". An open top end becomes a large sentinel. */
export function numericRange([min, max]: [number | null, number | null], ceiling = 1_000_000_000): string | undefined {
  if (min == null && max == null) return undefined;
  const lo = Math.max(0, Math.round(min ?? 0));
  const hi = Math.round(max ?? ceiling);
  return `${Math.min(lo, hi)}-${Math.max(lo, hi)}`;
}

export function letterRangeParam([a, b]: [string | null, string | null], scale: string): string | undefined {
  if (!a && !b) return undefined;
  const lo = (a ?? scale[0]).toUpperCase();
  const hi = (b ?? scale[scale.length - 1]).toUpperCase();
  return scale.indexOf(lo) <= scale.indexOf(hi) ? `${lo}-${hi}` : `${hi}-${lo}`;
}

/**
 * Time on market maps to Propalt's first_listed_date window, where min_week:X means
 * "first listed at least X weeks ago" (verified: NW3 count drops as min rises).
 */
export function weeksParam([min, max]: [number | null, number | null]): string | undefined {
  if (min == null && max == null) return undefined;
  return `min_week:${min ?? 'null'}|max_week:${max ?? 'null'}`;
}

/** Build one Propalt request body per selected outcode. */
export function toPropaltQueries(f: Filters): ListingQuery[] {
  const status = f.status ?? (f.side === 'sale' ? 'for_sale' : 'for_rent');
  const base: Omit<ListingQuery, 'first_postcode'> & Record<string, unknown> = {
    side: f.side,
    progress: status,
    listing_price: numericRange(f.price),
    numbeds: numericRange(f.beds, 20),
    internal_size: numericRange(f.floorArea, 100000),
    plot_size: numericRange(f.plotSize, 10_000_000),
    first_listed_date: weeksParam(f.weeksOnMarket),
    reduce_date: f.reducedWithinWeeks ? `min_week:0|max_week:${f.reducedWithinWeeks}` : undefined,
    epc_rating: letterRangeParam(f.epc, 'ABCDEFG'),
    taxband_rating: f.side === 'sale' ? letterRangeParam(f.taxBand, 'ABCDEFGH') : undefined,
    property_type_list: f.propertyTypes.length ? f.propertyTypes : undefined,
    tenure: f.tenure ?? undefined,
    proprietor_type_list: f.proprietorTypes.length ? f.proprietorTypes : undefined,
    brand_name: f.agent || undefined,
    HMO_property: f.hmo ? 1 : undefined,
    potential_HMO: f.potentialHmo ? 1 : undefined,
    retirement_property: f.retirement ? 1 : undefined,
    disabled_access_property: f.accessible ? 1 : undefined,
    page: f.page,
  };
  for (const k of Object.keys(base)) if (base[k] === undefined) delete base[k];
  return f.outcodes.map((first_postcode) => ({ ...base, first_postcode }) as ListingQuery);
}

/** Filters Propalt cannot apply server side, run on each returned page. */
export function postFilter(rows: PropaltListing[], f: Filters): PropaltListing[] {
  return rows.filter((r) => {
    if (f.minBelowEstimatePct != null) {
      if (!r.current_price || !r.predict_price) return false;
      if ((1 - r.current_price / r.predict_price) * 100 < f.minBelowEstimatePct) return false;
    }
    if (f.minPriceCutPct != null) {
      if (!r.current_price || !r.first_listed_price) return false;
      if ((1 - r.current_price / r.first_listed_price) * 100 < f.minPriceCutPct) return false;
    }
    return true;
  });
}

export function weeksListed(firstListed: string | null | undefined, now = new Date()): number | null {
  if (!firstListed) return null;
  const t = Date.parse(firstListed);
  return Number.isNaN(t) ? null : Math.floor((now.getTime() - t) / (7 * 86400_000));
}
