import fs from 'node:fs';
import pg from 'pg';

/** Our own DATABASE_URL wins; Netlify's built in database sets NETLIFY_DATABASE_URL. */
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
}
import { from as copyFrom } from 'pg-copy-streams';
import { parse } from 'csv-parse';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export function client() {
  if (!databaseUrl()) throw new Error('DATABASE_URL (or NETLIFY_DATABASE_URL) is not set');
  return new pg.Client({ connectionString: databaseUrl() });
}

export function arg(i: number, usage: string): string {
  const v = process.argv[2 + i];
  if (!v) {
    console.error(`Usage: ${usage}`);
    process.exit(1);
  }
  return v;
}

/** Escape one value for COPY text format. */
function cell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '\\N';
  return String(v).replace(/\\/g, '\\\\').replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
}

/** Stream rows into a table with COPY. `rows` can be any (async) iterable of arrays. */
export async function copyRows(db: pg.Client, table: string, columns: string[], rows: AsyncIterable<unknown[]> | Iterable<unknown[]>) {
  const stream = db.query(copyFrom(`COPY ${table} (${columns.join(', ')}) FROM STDIN`));
  let n = 0;
  async function* lines() {
    for await (const r of rows) {
      n++;
      if (n % 500000 === 0) console.log(`  ${n.toLocaleString()} rows`);
      yield r.map(cell).join('\t') + '\n';
    }
  }
  await pipeline(Readable.from(lines()), stream);
  return n;
}

export function csvRecords(file: string, opts: { columns: boolean | string[]; delimiter?: string } = { columns: true }) {
  return fs.createReadStream(file).pipe(
    parse({ columns: opts.columns as never, delimiter: opts.delimiter ?? ',', relax_quotes: true, relax_column_count: true, skip_empty_lines: true, bom: true }),
  ) as AsyncIterable<Record<string, string> | string[]>;
}

export async function withClient<T>(fn: (db: pg.Client) => Promise<T>) {
  const db = client();
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}
