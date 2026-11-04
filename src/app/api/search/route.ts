import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { propalt, propaltConfigured } from '@/lib/propalt';
import { currentUser } from '@/lib/request';
import { OUTCODE_RE } from '@/lib/filters';

const POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/;

/** Search box: districts, postcodes and addresses from our own base first, Propalt only as fallback. */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (raw.length < 2) return NextResponse.json({ results: [] });
  const q = raw.toUpperCase();
  const results: { kind: 'district' | 'postcode' | 'address'; label: string; uprn?: string; outcode?: string; lat?: number; lng?: number }[] = [];

  if (OUTCODE_RE.test(q)) {
    const d = await query<{ outcode: string; lat: number; lng: number }>(
      'SELECT outcode, ST_Y(label_pt) AS lat, ST_X(label_pt) AS lng FROM postcode_district WHERE outcode = $1', [q]);
    results.push(...d.map((r) => ({ kind: 'district' as const, label: r.outcode, outcode: r.outcode, lat: r.lat, lng: r.lng })));
  }
  if (POSTCODE_RE.test(q)) {
    const pc = q.replace(/\s+/g, '').replace(/(\d[A-Z]{2})$/, ' $1');
    const p = await query<{ postcode: string; lat: number; lng: number }>(
      'SELECT postcode, ST_Y(geom) AS lat, ST_X(geom) AS lng FROM postcode WHERE postcode = $1', [pc]);
    results.push(...p.map((r) => ({ kind: 'postcode' as const, label: r.postcode, outcode: r.postcode.split(' ')[0], lat: r.lat, lng: r.lng })));
  }
  const a = await query<{ uprn: string; address: string; lat: number; lng: number }>(
    `SELECT uprn::text, address, ST_Y(geom) AS lat, ST_X(geom) AS lng FROM property
     WHERE address ILIKE $1 ORDER BY similarity(address, $2) DESC LIMIT 8`,
    [`%${raw.replace(/[%_]/g, '')}%`, raw],
  );
  results.push(...a.map((r) => ({ kind: 'address' as const, label: r.address, uprn: r.uprn, lat: r.lat, lng: r.lng })));

  if (!results.length && propaltConfigured()) {
    try {
      const { data } = await propalt<{ data: { type: string; text: string; property_id?: number }[] }>(
        'addressLookup', { keyword: raw, limit: 7 }, await currentUser());
      for (const r of data.data ?? []) {
        if (r.type === 'address' && r.property_id) results.push({ kind: 'address', label: r.text, uprn: `pa${r.property_id}` });
      }
    } catch { /* fall through with no results */ }
  }
  return NextResponse.json({ results });
}
