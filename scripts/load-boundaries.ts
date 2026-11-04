// Local authority boundaries from the ONS Open Geography Portal (OGL), as GeoJSON in WGS84.
// e.g. "Local Authority Districts (May 2024) Boundaries UK BGC". Keeps only LIVEO_REGION.
import fs from 'node:fs';
import { arg, withClient } from './lib';
import { regionLaCodes } from '../src/lib/region';

const file = arg(0, 'npm run load:boundaries -- <lad-boundaries.geojson>');
const fc = JSON.parse(fs.readFileSync(file, 'utf8')) as GeoJSON.FeatureCollection;
const keep = new Set(regionLaCodes());

await withClient(async (db) => {
  let n = 0;
  for (const f of fc.features) {
    const props = f.properties ?? {};
    const codeKey = Object.keys(props).find((k) => /^LAD\d{2}CD$/i.test(k));
    const nameKey = Object.keys(props).find((k) => /^LAD\d{2}NM$/i.test(k));
    if (!codeKey || !nameKey) throw new Error('Expected LADxxCD and LADxxNM properties');
    const code = String(props[codeKey]);
    if (keep.size && !keep.has(code)) continue;
    await db.query(
      `INSERT INTO region_boundary (la_code, name, geom)
       VALUES ($1, $2, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326)), 3)))
       ON CONFLICT (la_code) DO UPDATE SET name = EXCLUDED.name, geom = EXCLUDED.geom`,
      [code, props[nameKey], JSON.stringify(f.geometry)],
    );
    n++;
  }
  console.log(`Loaded ${n} local authority boundaries`);
});
