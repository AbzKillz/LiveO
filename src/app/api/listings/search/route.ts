import { NextResponse } from 'next/server';
import { FilterSchema, postFilter, toPropaltQueries, weeksListed } from '@/lib/filters';
import { estimateFor, formatPropaltAddress, searchListings, usingSnapshot } from '@/lib/propalt';
import { SNAPSHOT_DATE } from '@/lib/snapshot';
import { currentUser } from '@/lib/request';
import { errorResponse } from '../../_util';

export async function POST(req: Request) {
  const parsed = FilterSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const f = parsed.data;
  if (!f.outcodes.length) return NextResponse.json({ error: 'Pick at least one postcode district' }, { status: 400 });
  const user = await currentUser();
  try {
    const pages = await Promise.all(toPropaltQueries(f).map(async (q) => ({ outcode: q.first_postcode!, ...(await searchListings(q, user)) })));
    const rows = pages.flatMap((p) => p.data.data ?? []);
    const kept = postFilter(rows, f).map((r) => ({
      ...r,
      address: formatPropaltAddress(r),
      weeks_on_market: weeksListed(r.first_listed_date),
      below_estimate_pct: r.current_price && estimateFor(r, f.side) ? Math.round((1 - r.current_price / estimateFor(r, f.side)!) * 1000) / 10 : null,
      price_cut_pct: r.current_price && r.first_listed_price ? Math.round((1 - r.current_price / r.first_listed_price) * 1000) / 10 : null,
    }));
    return NextResponse.json({
      results: kept,
      page: f.page,
      snapshot: usingSnapshot() ? SNAPSHOT_DATE : null,
      // A district has more pages while it returned a full page of 20.
      hasMore: pages.some((p) => (p.data.data?.length ?? 0) >= 20),
      calls: pages.filter((p) => !p.cached).length,
      totals: pages.map((p) => ({ outcode: p.outcode, count: p.data.count })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
