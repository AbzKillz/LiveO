import { NextResponse } from 'next/server';
import { buildContext } from '@/lib/property';
import { currentUser } from '@/lib/request';
import { errorResponse } from '../../_util';

export async function GET(_req: Request, { params }: { params: Promise<{ uprn: string }> }) {
  const { uprn } = await params;
  if (!/^\d{1,12}$/.test(uprn)) return NextResponse.json({ error: 'bad uprn' }, { status: 400 });
  try {
    const ctx = await buildContext(Number(uprn), await currentUser());
    return ctx ? NextResponse.json(ctx) : NextResponse.json({ error: 'not found' }, { status: 404 });
  } catch (e) {
    return errorResponse(e);
  }
}
