import { query } from './db';
import { propalt, propaltConfigured } from './propalt';
import { designationsAt, type PlanningEntity } from './sources/planningData';
import { floodAlertsNear } from './sources/environmentAgency';
import { ofcomBroadband, ofcomConfigured, ofcomMobile, type BroadbandSummary, type MobileSummary } from './sources/ofcom';
import { epcForUprn, type EpcRecord } from './sources/epc';
import { lookupPostcode } from './sources/postcodes';
import { crimeSummary } from './sources/police';

export interface PropertyRow {
  uprn: number; lat: number; lng: number; la_code: string | null; postcode: string | null;
  address: string | null; address_source: string | null; propalt_property_id: number | null;
}

export interface SourceResult<T> { ok: boolean; data: T | null; error?: string; source: string }

export interface PropertyContext {
  property: PropertyRow;
  title: { inspire_id: number; area_m2: number; geojson: GeoJSON.Geometry } | null;
  epc: SourceResult<EpcRecord & { source: string }>;
  designations: SourceResult<PlanningEntity[]>;
  flood: SourceResult<Awaited<ReturnType<typeof floodAlertsNear>>>;
  broadband: SourceResult<BroadbandSummary>;
  mobile: SourceResult<MobileSummary[]>;
  crime: SourceResult<Awaited<ReturnType<typeof crimeSummary>>>;
  council: SourceResult<{ name: string; code: string }>;
  lastSale: { price: number; date: string; tenure: string | null } | null;
  propalt: {
    property: SourceResult<Record<string, unknown>>;
    leaseholds: SourceResult<unknown>;
    coal: SourceResult<unknown>;
    mining: SourceResult<unknown>;
    planning: SourceResult<{ data?: unknown[] } & Record<string, unknown>>;
  };
}

async function settle<T>(source: string, fn: () => Promise<T | null>): Promise<SourceResult<T>> {
  try {
    const data = await fn();
    return { ok: data !== null, data, source };
  } catch (e) {
    return { ok: false, data: null, source, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getProperty(uprn: number): Promise<PropertyRow | null> {
  const rows = await query<PropertyRow>(
    `SELECT uprn, ST_Y(geom) AS lat, ST_X(geom) AS lng, la_code, postcode, address, address_source, propalt_property_id
     FROM property WHERE uprn = $1`,
    [uprn],
  );
  return rows[0] ?? null;
}

/**
 * Fill in address text for a bare UPRN point using Propalt, then store it so the next
 * visitor gets it free. Only called when a user actually opens the property.
 */
export async function enrichAddress(p: PropertyRow, userEmail?: string): Promise<PropertyRow> {
  if (p.address || !propaltConfigured()) return p;
  try {
    const { data } = await propalt<{ data?: Record<string, unknown>[] }>('property', { uprn: p.uprn }, userEmail);
    const rec = firstRecord(data);
    const address = propaltAddressText(rec);
    if (!rec || !address) return p;
    // Never attach another property's record to this UPRN.
    if (rec.uprn != null && Number(rec.uprn) !== Number(p.uprn)) return p;
    const postcode = (rec.postcode as string | undefined) ?? null;
    await query(
      `UPDATE property SET address = $2, address_source = 'propalt', postcode = COALESCE(postcode, $3),
         propalt_property_id = COALESCE(propalt_property_id, $4), updated_at = now() WHERE uprn = $1`,
      [p.uprn, address, postcode, (rec.property_id as number | undefined) ?? null],
    );
    return { ...p, address, address_source: 'propalt', postcode: p.postcode ?? postcode, propalt_property_id: p.propalt_property_id ?? ((rec.property_id as number) || null) };
  } catch {
    return p;
  }
}

export function firstRecord(d: unknown): Record<string, unknown> | null {
  if (!d || typeof d !== 'object') return null;
  const inner = (d as { data?: unknown }).data;
  if (Array.isArray(inner)) return (inner[0] as Record<string, unknown>) ?? null;
  if (inner && typeof inner === 'object') return inner as Record<string, unknown>;
  return d as Record<string, unknown>;
}

/** Propalt property records carry address parts in PAF style; build "11 Eton Rise, Eton College Road, London, NW3 2DE". */
export function propaltAddressText(r: Record<string, unknown> | null): string | null {
  if (!r) return null;
  const title = (v: unknown) => (typeof v === 'string' ? v.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : null);
  const first = [r.sub_building_name, r.building_name].map(title).filter(Boolean).join(', ');
  const numbered = [r.building_number, title(r.dependent_thoroughfare) ?? title(r.thoroughfare)].filter(Boolean).join(' ');
  const street = r.dependent_thoroughfare ? title(r.thoroughfare) : null;
  const parts = [first, numbered, street, title(r.dependent_locality), title(r.town), r.postcode].filter((x) => x && String(x).trim());
  if (parts.length >= 2) return parts.join(', ');
  return (r.address_text as string | undefined) ?? null;
}

export async function buildContext(uprn: number, userEmail?: string): Promise<PropertyContext | null> {
  const base = await getProperty(uprn);
  if (!base) return null;
  const property = await enrichAddress(base, userEmail);
  const { lat, lng, postcode } = property;
  const pa = propaltConfigured();
  const id = property.propalt_property_id ? { property_id: property.propalt_property_id } : { uprn };

  const [title, lastSale, epc, designations, flood, broadband, mobile, crime, council, paProperty, leaseholds, coal, mining, planning] =
    await Promise.all([
      query<{ inspire_id: number; area_m2: number; geojson: GeoJSON.Geometry }>(
        `SELECT inspire_id, area_m2, ST_AsGeoJSON(geom)::json AS geojson FROM title_polygon
         WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326)) ORDER BY area_m2 ASC LIMIT 1`,
        [lng, lat],
      ).then((r) => r[0] ?? null),
      query<{ price: number; date: string; tenure: string | null }>(
        `SELECT price, to_char(date_of_transfer, 'YYYY-MM-DD') AS date, tenure FROM price_paid WHERE uprn = $1
         ORDER BY date_of_transfer DESC LIMIT 1`,
        [uprn],
      ).then((r) => r[0] ?? null),
      settle('EPC register', () => epcForUprn(uprn)),
      settle('planning.data.gov.uk', () => designationsAt(lat, lng)),
      settle('Environment Agency', () => floodAlertsNear(lat, lng)),
      settle(ofcomConfigured() ? 'Ofcom' : 'Propalt', async () => {
        if (ofcomConfigured() && postcode) return ofcomBroadband(postcode, uprn);
        if (pa && postcode) {
          const { data } = await propalt<Record<string, unknown>>('broadband', { postcode }, userEmail);
          return propaltBroadband(data);
        }
        return null;
      }),
      settle('Ofcom', async () => (ofcomConfigured() && postcode ? ofcomMobile(postcode, uprn) : null)),
      settle('data.police.uk', () => crimeSummary(lat, lng)),
      settle('ONS boundaries', async () => {
        // Our own boundary table first (no network), postcodes.io as a fallback.
        if (property.la_code) {
          const r = await query<{ name: string }>('SELECT name FROM region_boundary WHERE la_code = $1', [property.la_code]);
          if (r[0]) return { name: r[0].name, code: property.la_code };
        }
        if (!postcode) return null;
        const pc = await lookupPostcode(postcode);
        return pc ? { name: pc.admin_district, code: pc.codes.admin_district } : null;
      }),
      settle('Propalt', async () => (pa ? (await propalt<Record<string, unknown>>('property', id, userEmail)).data : null)),
      settle('Propalt', async () => (pa ? (await propalt('leaseholds', id, userEmail)).data : null)),
      settle('Propalt', async () => (pa ? (await propalt('coalArea', { latitude: lat, longitude: lng }, userEmail)).data : null)),
      settle('Propalt', async () => (pa ? (await propalt('miningArea', { latitude: lat, longitude: lng }, userEmail)).data : null)),
      settle('Propalt', async () => (pa ? (await propalt<{ data?: unknown[] }>('planningApplications', id, userEmail)).data : null)),
    ]);

  return {
    property, title, lastSale, epc, designations, flood, broadband, mobile, crime, council,
    propalt: { property: paProperty, leaseholds, coal, mining, planning },
  };
}

/** Propalt broadband is postcode level; speeds arrive as strings. */
export function propaltBroadband(d: Record<string, unknown>): BroadbandSummary {
  const rec = firstRecord(d) ?? {};
  const num = (k: string) => {
    const v = rec[k];
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const down = num('max_download_speed');
  const pct = (k: string) => { const v = num(k); return v == null ? null : v > 0; };
  return {
    maxDownloadMbps: down,
    maxUploadMbps: num('max_upload_speed'),
    superfast: pct('sfbb_availability') || (down != null && down >= 30) || null,
    ultrafast: pct('ufbb_availability'),
    fullFibre: pct('fttp_availability'),
    source: 'propalt',
  };
}
