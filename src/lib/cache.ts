import { query } from './db';

/**
 * Read through cache backed by Postgres. `ttlHours` of Infinity means the payload never expires
 * (used for paid lookups that describe a property, not the market).
 */
export async function cached<T>(
  source: string,
  key: string,
  ttlHours: number,
  fetcher: () => Promise<T>,
  userEmail?: string,
): Promise<{ data: T; cached: boolean }> {
  const cacheKey = `${source}:${key}`;
  const rows = await query<{ payload: T; fetched_at: Date }>(
    'SELECT payload, fetched_at FROM api_cache WHERE cache_key = $1',
    [cacheKey],
  );
  const hit = rows[0];
  if (hit && (ttlHours === Infinity || Date.now() - hit.fetched_at.getTime() < ttlHours * 3600_000)) {
    await logUsage(source, key, true, userEmail);
    return { data: hit.payload, cached: true };
  }
  const data = await fetcher();
  await query(
    `INSERT INTO api_cache (cache_key, source, payload, fetched_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (cache_key) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = now()`,
    [cacheKey, source, JSON.stringify(data)],
  );
  await logUsage(source, key, false, userEmail);
  return { data, cached: false };
}

async function logUsage(source: string, endpoint: string, wasCached: boolean, userEmail?: string) {
  await query('INSERT INTO api_usage (source, endpoint, user_email, cached) VALUES ($1, $2, $3, $4)', [
    source,
    endpoint.slice(0, 200),
    userEmail ?? null,
    wasCached,
  ]);
}
