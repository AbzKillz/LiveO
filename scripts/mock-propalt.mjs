// Tiny stand in for the Propalt REST API that serves recorded responses from fixtures/.
// Used for local development and tests when no real key is configured:
//   node scripts/mock-propalt.mjs  then  PROPALT_API_BASE=http://localhost:4010 PROPALT_API_KEY=dev
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'fixtures');
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const routes = {
  '/property': () => load('propalt-property.json'),
  '/leaseholds': () => load('propalt-leaseholds.json'),
  '/broadband': () => load('propalt-broadband.json'),
  '/coal_area': () => load('propalt-coal.json'),
  '/mining_area': () => ({ data: { is_in_mining_zone: false } }),
  '/planning_applications': () => ({ data: [{ reference: '2019/1234/P', description: 'Replacement windows', decision: 'Granted', start_date: '2019-05-02' }], count: 1 }),
  '/address_lookup': () => ({ status: 'OK', data: [{ type: 'address', text: '11 Eton College Road, London, NW3 2DE', property_id: 19439602 }] }),
  '/market_activity/properties_for_sale': (body) => {
    const all = load('propalt-for-sale.json');
    if (body.return_type === 'count') return { data: [], count: body.first_postcode === 'NW3' ? 564 : 120 };
    return { ...all, data: all.data.filter((r) => r.postcode.startsWith(body.first_postcode + ' ')) };
  },
  '/market_activity/properties_for_let': (body) => (body.return_type === 'count' ? { data: [], count: 42 } : { data: [], count: 0 }),
};
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    const handler = routes[url.pathname];
    if (!req.headers['x-api-key']) { res.writeHead(401); return res.end('{"detail":"missing key"}'); }
    if (!handler) { res.writeHead(404); return res.end('{"detail":"not found"}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(handler(raw ? JSON.parse(raw) : Object.fromEntries(url.searchParams))));
  });
}).listen(Number(process.env.PORT ?? 4010), () => console.log('mock propalt on', process.env.PORT ?? 4010));
