// Domestic EPC bulk download (DLUHC, OGL): certificates.csv, one or many files.
// Fills epc_certificate and gives address text to UPRN points that have none.
import { copyRows, csvRecords, withClient } from './lib';
import { mapEpcRow } from '../src/lib/sources/epc';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: npm run load:epc -- <certificates.csv> [more.csv ...]');
  process.exit(1);
}
const COLS = ['lmk_key', 'uprn', 'address', 'postcode', 'current_energy_rating', 'potential_energy_rating', 'current_energy_efficiency',
  'property_type', 'built_form', 'total_floor_area', 'construction_age_band', 'main_fuel', 'mains_gas_flag', 'main_heating_description',
  'walls_description', 'roof_description', 'windows_description', 'number_habitable_rooms', 'tenure', 'lodgement_date', 'local_authority'];

await withClient(async (db) => {
  await db.query('CREATE TEMP TABLE epc_stage (LIKE epc_certificate)');
  for (const file of files) {
    const n = await copyRows(db, 'epc_stage', COLS, (async function* () {
      for await (const raw of csvRecords(file) as AsyncIterable<Record<string, string>>) {
        const r: Record<string, string> = {};
        for (const [k, v] of Object.entries(raw)) r[k.toLowerCase().replace(/_/g, '-')] = v;
        const e = mapEpcRow(r);
        yield [e.lmk_key, r['uprn'] || null, e.address, e.postcode, e.current_energy_rating, e.potential_energy_rating,
          r['current-energy-efficiency'] || null, e.property_type, e.built_form, e.total_floor_area, e.construction_age_band,
          e.main_fuel, e.mains_gas_flag, e.main_heating_description, e.walls_description, e.roof_description,
          e.windows_description, e.number_habitable_rooms, e.tenure, e.lodgement_date, r['local-authority'] || null];
      }
    })());
    console.log(`${file}: ${n} certificates`);
  }
  await db.query(`INSERT INTO epc_certificate SELECT DISTINCT ON (lmk_key) * FROM epc_stage ON CONFLICT (lmk_key) DO NOTHING`);
  const res = await db.query(`UPDATE property p SET address = e.address || ', ' || e.postcode, postcode = e.postcode,
      address_source = 'epc', updated_at = now()
    FROM (SELECT DISTINCT ON (uprn) uprn, address, postcode FROM epc_certificate WHERE uprn IS NOT NULL
          ORDER BY uprn, lodgement_date DESC) e
    WHERE p.uprn = e.uprn AND (p.address IS NULL OR p.address_source = 'epc')`);
  console.log(`Gave address text to ${res.rowCount} properties`);
});
