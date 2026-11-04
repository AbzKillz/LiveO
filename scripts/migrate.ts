import fs from 'node:fs';
import path from 'node:path';
import { withClient } from './lib';

await withClient(async (db) => {
  await db.query(fs.readFileSync(path.join(import.meta.dirname, '..', 'db', 'schema.sql'), 'utf8'));
  console.log('Schema applied');
});
