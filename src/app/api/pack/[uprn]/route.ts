import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { buildContext } from '@/lib/property';
import { buildPack } from '@/lib/pack';
import { currentUser } from '@/lib/request';
import { errorResponse } from '../../_util';

type Params = { params: Promise<{ uprn: string }> };

async function latestPack(uprn: number) {
  const rows = await query<{ id: string; agent_inputs: Record<string, string>; status: string }>(
    'SELECT id, agent_inputs, status FROM pack WHERE uprn = $1 ORDER BY updated_at DESC LIMIT 1', [uprn]);
  return rows[0] ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const uprn = Number((await params).uprn);
  if (!Number.isInteger(uprn)) return NextResponse.json({ error: 'bad uprn' }, { status: 400 });
  try {
    const ctx = await buildContext(uprn, await currentUser());
    if (!ctx) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const saved = await latestPack(uprn);
    return NextResponse.json({ id: saved?.id ?? null, status: saved?.status ?? 'draft', agentInputs: saved?.agent_inputs ?? {}, pack: buildPack(ctx, saved?.agent_inputs ?? {}) });
  } catch (e) {
    return errorResponse(e);
  }
}

const Save = z.object({ agentInputs: z.record(z.string().max(2000)), status: z.enum(['draft', 'ready', 'published']).default('draft') });

export async function PUT(req: Request, { params }: Params) {
  const uprn = Number((await params).uprn);
  const parsed = Save.safeParse(await req.json());
  if (!Number.isInteger(uprn) || !parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const user = (await currentUser()) ?? 'unknown';
  const ctx = await buildContext(uprn, user);
  if (!ctx) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const pack = buildPack(ctx, parsed.data.agentInputs);
  const saved = await latestPack(uprn);
  if (saved) {
    await query('UPDATE pack SET agent_inputs = $2, auto_data = $3, status = $4, updated_at = now() WHERE id = $1',
      [saved.id, parsed.data.agentInputs, JSON.stringify(pack), parsed.data.status]);
  } else {
    await query('INSERT INTO pack (uprn, created_by, agent_inputs, auto_data, status) VALUES ($1, $2, $3, $4, $5)',
      [uprn, user, parsed.data.agentInputs, JSON.stringify(pack), parsed.data.status]);
  }
  return NextResponse.json({ ok: true, pack });
}
