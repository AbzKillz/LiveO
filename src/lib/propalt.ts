import { cached } from './cache';
import { UpstreamError } from './http';

/**
 * Propalt REST client.
 *
 * Paths for the two market activity endpoints and planning constraints are inferred from the
 * operation ids the Propalt connector exposes (FastAPI style "<fn>_<path>_<method>"). The rest
 * are best guesses. Override any of them without a code change by setting PROPALT_PATHS to JSON,
 * e.g. PROPALT_PATHS='{"property":"/v1/property"}'.
 */
const DEFAULT_PATHS = {
  addressLookup: { method: 'GET', path: '/address_lookup' },
  property: { method: 'GET', path: '/property' },
  propertyHistory: { method: 'GET', path: '/property/history' },
  epcByProperty: { method: 'GET', path: '/epc_fabric/property_id' },
  leaseholds: { method: 'GET', path: '/leaseholds' },
  broadband: { method: 'GET', path: '/broadband' },
  coalArea: { method: 'GET', path: '/coal_area' },
  miningArea: { method: 'GET', path: '/mining_area' },
  planningApplications: { method: 'GET', path: '/planning_applications' },
  planningConstraints: { method: 'GET', path: '/planning_constraints' },
  comparables: { method: 'POST', path: '/comparable/property_id' },
  valuation: { method: 'POST', path: '/valuation/property_id' },
  forSale: { method: 'POST', path: '/market_activity/properties_for_sale' },
  forLet: { method: 'POST', path: '/market_activity/properties_for_let' },
} as const satisfies Record<string, { method: 'GET' | 'POST'; path: string }>;

export type PropaltEndpoint = keyof typeof DEFAULT_PATHS;

function endpoint(name: PropaltEndpoint): { method: 'GET' | 'POST'; path: string } {
  const overrides = process.env.PROPALT_PATHS ? (JSON.parse(process.env.PROPALT_PATHS) as Record<string, string>) : {};
  return { method: DEFAULT_PATHS[name].method, path: overrides[name] ?? DEFAULT_PATHS[name].path };
}

export function propaltConfigured(): boolean {
  return Boolean(process.env.PROPALT_API_BASE && process.env.PROPALT_API_KEY);
}

/** Cache lifetimes. Property facts barely change; the market does. */
const TTL_HOURS: Record<PropaltEndpoint, number> = {
  addressLookup: 24 * 30,
  property: 24 * 30,
  propertyHistory: 24,
  epcByProperty: 24 * 30,
  leaseholds: 24 * 30,
  broadband: 24 * 30,
  coalArea: Infinity,
  miningArea: Infinity,
  planningApplications: 24,
  planningConstraints: 24 * 7,
  comparables: 24,
  valuation: 24,
  forSale: 1,
  forLet: 1,
};

export async function propalt<T = unknown>(
  name: PropaltEndpoint,
  params: Record<string, unknown>,
  userEmail?: string,
): Promise<{ data: T; cached: boolean }> {
  if (!propaltConfigured()) throw new UpstreamError('propalt', 503, 'PROPALT_API_BASE and PROPALT_API_KEY are not set');
  const { method, path } = endpoint(name);
  const key = `${name}:${stableStringify(params)}`;
  return cached<T>('propalt', key, TTL_HOURS[name], async () => {
    const base = process.env.PROPALT_API_BASE!.replace(/\/$/, '');
    const header = process.env.PROPALT_AUTH_HEADER ?? 'x-api-key';
    const headers: Record<string, string> = {
      accept: 'application/json',
      [header]: header.toLowerCase() === 'authorization' ? `Bearer ${process.env.PROPALT_API_KEY}` : process.env.PROPALT_API_KEY!,
    };
    let url = base + path;
    let body: string | undefined;
    if (method === 'GET') {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.set(k, String(v));
      url += `?${qs}`;
    } else {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(params);
    }
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new UpstreamError('propalt', res.status, (await res.text()).slice(0, 300));
    return (await res.json()) as T;
  }, userEmail);
}

function stableStringify(o: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(o).sort().reduce<Record<string, unknown>>((acc, k) => {
    if (o[k] !== undefined && o[k] !== null) acc[k] = o[k];
    return acc;
  }, {}));
}

/** Shape of one record from the for sale / for let endpoints (fields we use). */
export interface PropaltListing {
  property_id: number;
  udprn?: number | null;
  postcode: string;
  lat: number | null;
  lng: number | null;
  address1: string;
  town?: string | null;
  formatting_address?: string | null;
  first_listed_date?: string | null;
  first_listed_price?: number | null;
  first_reduce_date?: string | null;
  first_sold_date?: string | null;
  current_status?: string | null;
  property_type_std?: string | null;
  num_beds?: number | null;
  property_tenure?: string | null;
  current_price?: number | null;
  brand_name?: string | null;
  predict_price?: number | null;
  current_energy_rating?: string | null;
  total_floor_area?: number | null;
  tax_band?: string | null;
}

export interface ListingQuery {
  side: 'sale' | 'let';
  first_postcode?: string;
  polygon_str?: string;
  progress?: string;
  listing_price?: string;
  numbeds?: string;
  property_type_list?: string[];
  first_listed_date?: string;
  page?: number;
}

export async function searchListings(q: ListingQuery, userEmail?: string) {
  const { side, ...body } = q;
  const progress = body.progress ?? (side === 'sale' ? 'for_sale' : 'for_rent');
  return propalt<{ data: PropaltListing[]; count: number }>(
    side === 'sale' ? 'forSale' : 'forLet',
    { ...body, progress, limit: 20, page: body.page ?? 0, return_type: 'data' },
    userEmail,
  );
}

/** "11 Eton Rise||Eton College Road||London||NW3 2DE" becomes "11 Eton Rise, Eton College Road, London, NW3 2DE". */
export function formatPropaltAddress(l: Pick<PropaltListing, 'formatting_address' | 'address1' | 'town' | 'postcode'>): string {
  if (l.formatting_address) return l.formatting_address.split('||').map((s) => s.trim()).filter(Boolean).join(', ');
  return [l.address1, l.town, l.postcode].filter(Boolean).join(', ');
}

export async function countListings(q: ListingQuery, userEmail?: string) {
  const { side, ...body } = q;
  const progress = body.progress ?? (side === 'sale' ? 'for_sale' : 'for_rent');
  const { data, cached: wasCached } = await propalt<{ count: number }>(
    side === 'sale' ? 'forSale' : 'forLet',
    { ...body, progress, page: 0, limit: 1, return_type: 'count' },
    userEmail,
  );
  return { count: data.count ?? 0, cached: wasCached };
}
