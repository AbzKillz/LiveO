import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { parseBbox } from '../../_util';

/** Address points in view. Only at street zoom, so a viewport never returns more than a few thousand. */
export async function GET(req: Request) {
  const bbox = parseBbox(new URL(req.url).searchParams.get('bbox'));
  if (!bbox || bbox[2] - bbox[0] > 0.02) return NextResponse.json({ type: 'FeatureCollection', features: [] });
  const rows = await query<{ fc: GeoJSON.FeatureCollection }>(`
    SELECT json_build_object('type', 'FeatureCollection', 'features', coalesce(json_agg(json_build_object(
      'type', 'Feature', 'id', uprn, 'properties', json_build_object('uprn', uprn::text, 'address', address, 'has_address', address IS NOT NULL),
      'geometry', ST_AsGeoJSON(geom, 7)::json)), '[]'::json)) AS fc
    FROM (SELECT uprn, address, geom FROM property WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326) LIMIT 8000) p`, bbox);
  return NextResponse.json(rows[0].fc);
}
