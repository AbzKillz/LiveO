import { NextResponse } from 'next/server';
import { UpstreamError } from '@/lib/http';

export function parseBbox(v: string | null): [number, number, number, number] | null {
  if (!v) return null;
  const p = v.split(',').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n))) return null;
  const [w, s, e, n] = p;
  if (w >= e || s >= n || e - w > 2 || n - s > 2) return null;
  return [w, s, e, n];
}

export function errorResponse(e: unknown) {
  if (e instanceof UpstreamError) return NextResponse.json({ error: e.message, source: e.source }, { status: e.status === 503 ? 503 : 502 });
  console.error(e);
  return NextResponse.json({ error: 'internal error' }, { status: 500 });
}
