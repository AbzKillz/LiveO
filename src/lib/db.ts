import pg from 'pg';

/** Our own DATABASE_URL wins; Netlify's built in database sets NETLIFY_DATABASE_URL. */
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
}

// Return DATE columns as 'YYYY-MM-DD' strings, not JS Dates (they render and serialise cleanly).
pg.types.setTypeParser(1082, (v) => v);

const globalForPool = globalThis as unknown as { liveoPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForPool.liveoPool) {
    if (!databaseUrl()) throw new Error('DATABASE_URL (or NETLIFY_DATABASE_URL) is not set');
    globalForPool.liveoPool = new pg.Pool({ connectionString: databaseUrl(), max: 10 });
  }
  return globalForPool.liveoPool;
}

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const res = await pool().query<T>(sql, params);
  return res.rows;
}
