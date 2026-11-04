import pg from 'pg';

// Return DATE columns as 'YYYY-MM-DD' strings, not JS Dates (they render and serialise cleanly).
pg.types.setTypeParser(1082, (v) => v);

const globalForPool = globalThis as unknown as { liveoPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!globalForPool.liveoPool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    globalForPool.liveoPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return globalForPool.liveoPool;
}

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  const res = await pool().query<T>(sql, params);
  return res.rows;
}
