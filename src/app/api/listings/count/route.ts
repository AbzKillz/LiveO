import { NextResponse } from 'next/server';
import { FilterSchema, toPropaltQueries } from '@/lib/filters';
import { countListings } from '@/lib/propalt';
import { currentUser } from '@/lib/request';
import { errorResponse } from '../../_util';

/** Cheap preview: one count call per district, so staff see the size before pulling records. */
export async function POST(req: Request) {
  const parsed = FilterSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const user = await currentUser();
  try {
    const queries = toPropaltQueries(parsed.data);
    const counts = await Promise.all(queries.map(async (q) => ({ outcode: q.first_postcode!, ...(await countListings(q, user)) })));
    return NextResponse.json({ total: counts.reduce((a, c) => a + c.count, 0), byOutcode: counts });
  } catch (e) {
    return errorResponse(e);
  }
}
