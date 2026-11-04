// OS Open UPRN (OGL, attribution required). Every addressable point, coordinates only.
// Rows outside the region boundaries are dropped. Run load:boundaries first.
import { arg, copyRows, csvRecords, withClient } from './lib';
import { LONDON_BBOX } from '../src/lib/region';

const file = arg(0, 'npm run load:uprn -- <osopenuprn_*.csv>');
const useBbox = (process.env.LIVEO_REGION ?? 'london').toLowerCase() === 'london';

await withClient(async (db) => {
  await db.query('CREATE TEMP TABLE uprn_stage (uprn bigint, lat float8, lng float8)');
  const n = await copyRows(db, 'uprn_stage', ['uprn', 'lat', 'lng'], (async function* () {
    for await (const r of csvRecords(file) as AsyncIterable<Record<string, string>>) {
      const lat = Number(r.LATITUDE), lng = Number(r.LONGITUDE);
      if (useBbox && (lat < LONDON_BBOX.minLat || lat > LONDON_BBOX.maxLat || lng < LONDON_BBOX.minLng || lng > LONDON_BBOX.maxLng)) continue;
      yield [r.UPRN, lat, lng];
    }
  })());
  console.log(`Staged ${n} points inside the bounding box; clipping to boundaries`);
  const res = await db.query(`INSERT INTO property (uprn, geom, la_code)
    SELECT s.uprn, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326), b.la_code
    FROM uprn_stage s JOIN region_boundary b ON ST_Intersects(b.geom, ST_SetSRID(ST_MakePoint(s.lng, s.lat), 4326))
    ON CONFLICT (uprn) DO UPDATE SET geom = EXCLUDED.geom, la_code = EXCLUDED.la_code`);
  console.log(`Upserted ${res.rowCount} properties`);
  // Attach the nearest postcode centroid where we have none (a hint, replaced by EPC or Propalt later).
  await db.query(`UPDATE property p SET postcode = (
      SELECT pc.postcode FROM postcode pc ORDER BY pc.geom <-> p.geom LIMIT 1)
    WHERE p.postcode IS NULL AND EXISTS (SELECT 1 FROM postcode)`);
});
