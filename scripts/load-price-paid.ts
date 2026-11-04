// HM Land Registry Price Paid (OGL; contains HMLR data, Crown copyright). No header row.
// Keeps rows whose postcode is in the loaded region, then matches them to UPRNs via EPC addresses.
import fs from 'node:fs';
import path from 'node:path';
import { arg, copyRows, csvRecords, withClient } from './lib';

const file = arg(0, 'npm run load:pricepaid -- <pp-complete.csv | pp-2025.csv>');
const COLS = ['transaction_id', 'price', 'date_of_transfer', 'postcode', 'property_type', 'new_build', 'tenure', 'paon', 'saon', 'street', 'locality', 'town', 'district'];
const TENURE: Record<string, string> = { F: 'Freehold', L: 'Leasehold' };

await withClient(async (db) => {
  await db.query('CREATE TEMP TABLE pp_stage (LIKE price_paid)');
  const n = await copyRows(db, 'pp_stage', COLS, (async function* () {
    for await (const r of csvRecords(file, { columns: false }) as AsyncIterable<string[]>) {
      if (r[15] === 'D') continue; // deleted record
      yield [r[0].replace(/[{}]/g, ''), r[1], r[2].slice(0, 10), r[3] || null, r[4], r[5] === 'Y', TENURE[r[6]] ?? null,
        r[7], r[8], r[9], r[10], r[11], r[12]];
    }
  })());
  console.log(`Staged ${n} transactions`);
  const res = await db.query(`INSERT INTO price_paid SELECT s.* FROM pp_stage s
    WHERE EXISTS (SELECT 1 FROM postcode p WHERE p.postcode = s.postcode)
    ON CONFLICT (transaction_id) DO NOTHING`);
  console.log(`Kept ${res.rowCount} in region`);
  await db.query(fs.readFileSync(path.join(import.meta.dirname, 'match-price-paid.sql'), 'utf8'));
  const m = await db.query('SELECT count(*) FILTER (WHERE uprn IS NOT NULL) AS matched, count(*) AS total FROM price_paid');
  console.log(`Matched ${m.rows[0].matched} of ${m.rows[0].total} sales to a UPRN`);
});
