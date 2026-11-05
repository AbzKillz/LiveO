// Runs before every Netlify build. Applies the schema (safe to repeat) and, when
// LIVEO_SEED_SAMPLE=1 is set, loads the small Camden sample so the app has something to show.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { databaseUrl, withClient } from './lib';

if (!databaseUrl()) {
  console.log('No database URL set; skipping schema setup');
  process.exit(0);
}

const root = path.join(import.meta.dirname, '..');
await withClient(async (db) => {
  await db.query(fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8'));
  console.log('Schema applied');
  if (process.env.LIVEO_SEED_SAMPLE !== '1') return;
  const { rows } = await db.query('SELECT count(*)::int AS n FROM property');
  if (rows[0].n > 0) {
    console.log('Database already has properties; not seeding sample');
    return;
  }
  const S = path.join(root, 'fixtures', 'sample');
  const run = (script: string, file: string) =>
    execFileSync('npx', ['tsx', path.join(root, 'scripts', script), path.join(S, file)], { stdio: 'inherit', env: process.env });
  run('load-boundaries.ts', 'boundaries.geojson');
  run('load-onspd.ts', 'onspd.csv');
  run('load-uprn.ts', 'uprn.csv');
  run('load-epc.ts', 'epc.csv');
  run('load-price-paid.ts', 'pp.csv');
  run('load-inspire.ts', 'inspire.gml');
  await db.query(fs.readFileSync(path.join(root, 'scripts', 'build-districts.sql'), 'utf8'));
  console.log('Sample data loaded');
});
