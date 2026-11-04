import { getJson } from '../http';
import { cached } from '../cache';
import { query } from '../db';

/**
 * Energy Performance Certificates. Bulk loaded for the region (see scripts/load-epc.ts);
 * the live API is only used when a UPRN is missing from the local table.
 * The API needs a free account: EPC_API_EMAIL and EPC_API_KEY.
 */
const EPC_BASE = process.env.EPC_API_BASE ?? 'https://epc.opendatacommunities.org/api/v1';

export interface EpcRecord {
  lmk_key: string; current_energy_rating: string | null; potential_energy_rating: string | null;
  property_type: string | null; built_form: string | null; total_floor_area: number | null;
  construction_age_band: string | null; main_fuel: string | null; mains_gas_flag: string | null;
  main_heating_description: string | null; walls_description: string | null; roof_description: string | null;
  windows_description: string | null; number_habitable_rooms: number | null; tenure: string | null;
  lodgement_date: string | null; address: string | null; postcode: string | null;
}

export async function epcForUprn(uprn: number): Promise<(EpcRecord & { source: 'local' | 'api' }) | null> {
  const rows = await query<EpcRecord>(
    'SELECT * FROM epc_certificate WHERE uprn = $1 ORDER BY lodgement_date DESC LIMIT 1',
    [uprn],
  );
  if (rows[0]) return { ...rows[0], source: 'local' };
  if (!process.env.EPC_API_EMAIL || !process.env.EPC_API_KEY) return null;
  const auth = Buffer.from(`${process.env.EPC_API_EMAIL}:${process.env.EPC_API_KEY}`).toString('base64');
  const { data } = await cached('epc', `uprn:${uprn}`, 24 * 30, () =>
    getJson<{ rows: Record<string, string>[] }>('epc', `${EPC_BASE}/domestic/search?uprn=${uprn}&size=1`, {
      headers: { authorization: `Basic ${auth}` },
    }).catch(() => ({ rows: [] })),
  );
  const r = data.rows?.[0];
  if (!r) return null;
  return { ...mapEpcRow(r), source: 'api' };
}

/** Map a row from the EPC API or bulk CSV (both use the same lowercase hyphenated headers). */
export function mapEpcRow(r: Record<string, string>): EpcRecord {
  const n = (v?: string) => (v === undefined || v === '' ? null : Number(v));
  const s = (v?: string) => (v === undefined || v === '' || v === 'NO DATA!' ? null : v);
  return {
    lmk_key: r['lmk-key'],
    current_energy_rating: s(r['current-energy-rating']),
    potential_energy_rating: s(r['potential-energy-rating']),
    property_type: s(r['property-type']),
    built_form: s(r['built-form']),
    total_floor_area: n(r['total-floor-area']),
    construction_age_band: s(r['construction-age-band'])?.replace(/^England and Wales:\s*/i, '') ?? null,
    main_fuel: s(r['main-fuel']),
    mains_gas_flag: s(r['mains-gas-flag']),
    main_heating_description: s(r['mainheat-description']),
    walls_description: s(r['walls-description']),
    roof_description: s(r['roof-description']),
    windows_description: s(r['windows-description']),
    number_habitable_rooms: n(r['number-habitable-rooms']),
    tenure: s(r['tenure']),
    lodgement_date: s(r['lodgement-date']),
    address: [r['address1'], r['address2'], r['address3']].filter(Boolean).join(', ') || null,
    postcode: s(r['postcode']),
  };
}
