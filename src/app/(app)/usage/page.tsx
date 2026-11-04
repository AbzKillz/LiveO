import { Fragment } from 'react';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Usage() {
  const rows = await query<{ source: string; user_email: string | null; paid_calls: string; cache_hits: string }>(`
    SELECT source, user_email, count(*) FILTER (WHERE NOT cached) AS paid_calls, count(*) FILTER (WHERE cached) AS cache_hits
    FROM api_usage WHERE created_at > now() - interval '30 days' GROUP BY source, user_email ORDER BY 3 DESC`);
  const coverage = await query<{ total: string; with_address: string; by_epc: string; by_propalt: string; titles: string }>(`
    SELECT (SELECT count(*) FROM property) AS total,
           (SELECT count(*) FROM property WHERE address IS NOT NULL) AS with_address,
           (SELECT count(*) FROM property WHERE address_source = 'epc') AS by_epc,
           (SELECT count(*) FROM property WHERE address_source = 'propalt') AS by_propalt,
           (SELECT count(*) FROM title_polygon) AS titles`);
  const c = coverage[0];
  const pct = Number(c.total) ? Math.round((Number(c.with_address) / Number(c.total)) * 100) : 0;
  return (
    <main className="page">
      <h1>Usage and coverage</h1>
      <div className="prop-grid">
        <div className="box">
          <h2>Address base</h2>
          <dl className="kv">
            <dt>Address points</dt><dd>{Number(c.total).toLocaleString('en-GB')}</dd>
            <dt>With address text</dt><dd>{Number(c.with_address).toLocaleString('en-GB')} ({pct}%)</dd>
            <dt>From EPC</dt><dd>{Number(c.by_epc).toLocaleString('en-GB')}</dd>
            <dt>From Propalt</dt><dd>{Number(c.by_propalt).toLocaleString('en-GB')}</dd>
            <dt>Title outlines</dt><dd>{Number(c.titles).toLocaleString('en-GB')}</dd>
          </dl>
        </div>
        <div className="box">
          <h2>API calls, last 30 days</h2>
          <dl className="kv">
            {rows.length === 0 && <dd className="hint">No calls yet.</dd>}
            {rows.map((r, i) => (<Fragment key={i}><dt>{r.source} · {r.user_email ?? 'system'}</dt><dd>{r.paid_calls} paid, {r.cache_hits} from cache</dd></Fragment>))}
          </dl>
        </div>
      </div>
    </main>
  );
}
