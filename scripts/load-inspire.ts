// HM Land Registry INSPIRE Index Polygons, one GML file per council (EPSG:27700).
// Licence: "Contains HM Land Registry data © Crown copyright and database right" plus OS
// attribution; shown in the map footer. Parsed with a streaming reader, no GDAL needed.
import fs from 'node:fs';
import { copyRows, withClient } from './lib';
import { parseInspireGml } from '../src/lib/gml';


const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: npm run load:inspire -- <Land_Registry_Cadastral_Parcels.gml> [more.gml ...]');
  process.exit(1);
}

await withClient(async (db) => {
  await db.query('CREATE TEMP TABLE inspire_stage (inspire_id bigint, wkt text)');
  for (const f of files) console.log(`${f}: ${await copyRows(db, 'inspire_stage', ['inspire_id', 'wkt'], parseInspireGml(fs.createReadStream(f, { encoding: 'utf8', highWaterMark: 1 << 20 })))} parcels`);
  const res = await db.query(`INSERT INTO title_polygon (inspire_id, la_code, geom, area_m2)
    SELECT s.inspire_id, b.la_code, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_Transform(ST_SetSRID(ST_GeomFromText(s.wkt), 27700), 4326)), 3)),
           ST_Area(ST_SetSRID(ST_GeomFromText(s.wkt), 27700))
    FROM inspire_stage s
    LEFT JOIN LATERAL (SELECT la_code FROM region_boundary rb
      WHERE ST_Intersects(rb.geom, ST_Transform(ST_PointOnSurface(ST_SetSRID(ST_GeomFromText(s.wkt), 27700)), 4326)) LIMIT 1) b ON true
    ON CONFLICT (inspire_id) DO UPDATE SET geom = EXCLUDED.geom, area_m2 = EXCLUDED.area_m2, la_code = EXCLUDED.la_code`);
  console.log(`Upserted ${res.rowCount} title polygons`);
});
