import { NextResponse } from 'next/server';
import { resolvePropaltProperty } from '@/lib/resolve';
import { currentUser } from '@/lib/request';
import { errorResponse } from '../../_util';

/** Turn a Propalt property id (from a listing or address search) into our UPRN, then open it. */
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get('propalt_id'));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  try {
    const uprn = await resolvePropaltProperty(id, await currentUser());
    if (!uprn) return NextResponse.json({ error: 'Propalt has no UPRN for this property' }, { status: 404 });
    return NextResponse.redirect(new URL(`/property/${uprn}`, req.url), 303);
  } catch (e) {
    return errorResponse(e);
  }
}
