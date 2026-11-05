import snapshot from '../../fixtures/snapshot/listings.json';
import type { ListingQuery, PropaltListing } from './propalt';

/**
 * Listings captured from Propalt through the Claude connector, used when no REST key is set.
 * Filters run locally with the same semantics as Propalt's market activity endpoints.
 */
export const SNAPSHOT_DATE = snapshot.captured_at;
export const SNAPSHOT_OUTCODES = Array.from(
  new Set([...snapshot.sale, ...snapshot.let].map((r) => String(r[1]).split(' ')[0])),
).sort();

function rows(side: 'sale' | 'let'): PropaltListing[] {
  const cols = snapshot.columns;
  return (snapshot[side] as unknown[][]).map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => (o[c] = r[i]));
    o.formatting_address = String(o.address).split(', ').join('||');
    o.address1 = o.address;
    if (side === 'let') o.predict_rental_price = o.predict_price;
    return o as unknown as PropaltListing;
  });
}

function inRange(v: number | null | undefined, spec?: string) {
  if (!spec) return true;
  if (v == null) return false;
  const [lo, hi] = spec.split('-').map(Number);
  return hi === undefined || Number.isNaN(hi) ? v === lo : v >= lo && v <= hi;
}

function inLetters(v: string | null | undefined, spec?: string) {
  if (!spec) return true;
  if (!v) return false;
  const [lo, hi] = spec.split('-');
  return v >= lo && v <= (hi ?? lo);
}

const WEEK = 7 * 86400_000;
function inWeeks(date: string | null | undefined, spec: string | undefined, now: number) {
  if (!spec) return true;
  if (!date) return false;
  const m = /min_week:(\w+)\|max_week:(\w+)/.exec(spec);
  if (!m) return true;
  const age = (now - Date.parse(date)) / WEEK;
  const min = m[1] === 'null' ? -Infinity : Number(m[1]);
  const max = m[2] === 'null' ? Infinity : Number(m[2]);
  return age >= min && age <= max;
}

export function snapshotQuery(q: ListingQuery & Record<string, unknown>, now = Date.parse(SNAPSHOT_DATE)) {
  const progress = (q.progress as string) ?? (q.side === 'sale' ? 'for_sale' : 'for_rent');
  const all = rows(q.side).filter((r) => {
    if (q.first_postcode && !r.postcode.startsWith(`${q.first_postcode} `)) return false;
    if (progress === 'reduction' && r.current_status !== 'Reduction') return false;
    if (['sold_sstc', 'withdrawn', 'let_agreed'].includes(progress)) return false; // snapshot holds live stock only
    if (!inRange(r.current_price, q.listing_price as string)) return false;
    if (!inRange(r.num_beds, q.numbeds as string)) return false;
    if (!inRange(r.total_floor_area, q.internal_size as string)) return false;
    if (!inRange((r as { plot_size?: number }).plot_size, q.plot_size as string)) return false;
    if (!inLetters(r.current_energy_rating, q.epc_rating as string)) return false;
    if (!inLetters(r.tax_band, q.taxband_rating as string)) return false;
    if (!inWeeks(r.first_listed_date, q.first_listed_date as string, now)) return false;
    if (q.reduce_date && r.current_status !== 'Reduction') return false;
    const types = q.property_type_list as string[] | undefined;
    if (types?.length && !types.includes(r.property_type_std ?? '')) return false;
    if (q.tenure && (r.property_tenure ?? '').toLowerCase() !== q.tenure) return false;
    const owners = q.proprietor_type_list as string[] | undefined;
    const owner = String((r as { proprietor_type?: string }).proprietor_type ?? '').toLowerCase().replace(' ', '_');
    if (owners?.length && !owners.includes(owner)) return false;
    if (q.brand_name && !(r.brand_name ?? '').toLowerCase().includes(String(q.brand_name).toLowerCase())) return false;
    return true;
  });
  const page = Number(q.page ?? 0);
  return { data: all.slice(page * 20, page * 20 + 20), count: all.length };
}
