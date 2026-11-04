// ONS Postcode Directory (OGL). Live postcodes only, clipped to LIVEO_REGION.
import { arg, copyRows, csvRecords, withClient } from './lib';
import { regionLaCodes } from '../src/lib/region';

const file = arg(0, 'npm run load:onspd -- <ONSPD_*.csv>');
const keep = new Set(regionLaCodes());

await withClient(async (db) => {
  await db.query('CREATE TEMP TABLE pc_stage (postcode text, la_code text, lsoa_code text, lat float8, lng float8)');
  const n = await copyRows(db, 'pc_stage', ['postcode', 'la_code', 'lsoa_code', 'lat', 'lng'], (async function* () {
    for await (const r of csvRecords(file) as AsyncIterable<Record<string, string>>) {
      if (r.doterm) continue; // terminated postcode
      const la = r.oslaua ?? r.lad23cd ?? r.lad24cd;
      if (keep.size && !keep.has(la)) continue;
      const lat = Number(r.lat), lng = Number(r.long);
      if (!lat || lat > 90) continue; // 99.999999 marks no grid reference
      yield [r.pcds, la, r.lsoa21 ?? r.lsoa21cd ?? r.lsoa11, lat, lng];
    }
  })());
  await db.query(`INSERT INTO postcode (postcode, la_code, lsoa_code, geom)
    SELECT postcode, la_code, lsoa_code, ST_SetSRID(ST_MakePoint(lng, lat), 4326) FROM pc_stage
    ON CONFLICT (postcode) DO UPDATE SET la_code = EXCLUDED.la_code, lsoa_code = EXCLUDED.lsoa_code, geom = EXCLUDED.geom`);
  console.log(`Loaded ${n} postcodes`);
});
