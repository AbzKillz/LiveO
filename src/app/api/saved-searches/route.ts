import { NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db';
import { FilterSchema } from '@/lib/filters';
import { currentUser } from '@/lib/request';

export async function GET() {
  const user = await currentUser();
  return NextResponse.json(await query('SELECT id, name, filters, created_at FROM saved_search WHERE owner = $1 ORDER BY created_at DESC', [user]));
}

export async function POST(req: Request) {
  const parsed = z.object({ name: z.string().min(1).max(80), filters: FilterSchema }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const rows = await query<{ id: string }>('INSERT INTO saved_search (owner, name, filters) VALUES ($1, $2, $3) RETURNING id',
    [await currentUser(), parsed.data.name, JSON.stringify(parsed.data.filters)]);
  return NextResponse.json({ id: rows[0].id });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  await query('DELETE FROM saved_search WHERE id = $1 AND owner = $2', [id, await currentUser()]);
  return NextResponse.json({ ok: true });
}
