import { query } from './db';
import { propalt } from './propalt';
import { firstRecord, propaltAddressText } from './property';

/** Map a Propalt property id to a UPRN, creating the property row if our base lacks it. */
export async function resolvePropaltProperty(propaltId: number, userEmail?: string): Promise<number | null> {
  const known = await query<{ uprn: string }>('SELECT uprn::text FROM property WHERE propalt_property_id = $1', [propaltId]);
  if (known[0]) return Number(known[0].uprn);
  const { data } = await propalt('property', { property_id: propaltId }, userEmail);
  const rec = firstRecord(data);
  const uprn = Number(rec?.uprn);
  if (!rec || !Number.isFinite(uprn) || uprn <= 0) return null;
  const lat = Number(rec.lat), lng = Number(rec.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  await query(
    `INSERT INTO property (uprn, geom, postcode, address, address_source, propalt_property_id, udprn)
     VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326), $4, $5, 'propalt', $6, $7)
     ON CONFLICT (uprn) DO UPDATE SET propalt_property_id = EXCLUDED.propalt_property_id,
       udprn = COALESCE(property.udprn, EXCLUDED.udprn),
       address = COALESCE(property.address, EXCLUDED.address),
       address_source = COALESCE(property.address_source, EXCLUDED.address_source),
       postcode = COALESCE(property.postcode, EXCLUDED.postcode), updated_at = now()`,
    [uprn, lat, lng, rec.postcode ?? null, propaltAddressText(rec), propaltId, rec.udprn ?? null],
  );
  return uprn;
}
