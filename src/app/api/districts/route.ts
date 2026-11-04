import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/** All district shapes in the region (a few hundred for London), or a typed search. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q')?.trim().toUpperCase();
  if (q) {
    const rows = await query<{ outcode: string; postcodes: number }>(
      `SELECT outcode, postcodes FROM postcode_district WHERE outcode LIKE $1 ORDER BY length(outcode), outcode LIMIT 20`,
      [`${q.replace(/[^A-Z0-9]/g, '')}%`],
    );
    return NextResponse.json(rows);
  }
  const rows = await query<{ fc: GeoJSON.FeatureCollection }>(`
    SELECT json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
      'type', 'Feature', 'id', row_number, 'properties', json_build_object('outcode', outcode, 'postcodes', postcodes),
      'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0002), 6)::json)), '[]'::json)) AS fc
    FROM (SELECT row_number() OVER (), * FROM postcode_district) d`);
  return NextResponse.json(rows[0].fc, { headers: { 'cache-control': 'private, max-age=3600' } });
}
