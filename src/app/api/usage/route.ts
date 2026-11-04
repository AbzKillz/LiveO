import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/** Propalt calls in the last 30 days, split by paid and served from cache. */
export async function GET() {
  return NextResponse.json(await query(`
    SELECT source, user_email, count(*) FILTER (WHERE NOT cached) AS paid_calls, count(*) FILTER (WHERE cached) AS cache_hits
    FROM api_usage WHERE created_at > now() - interval '30 days' GROUP BY source, user_email ORDER BY paid_calls DESC`));
}
