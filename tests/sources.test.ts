import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { firstRecord, propaltAddressText, propaltBroadband } from '@/lib/property';
import { summariseOfcomBroadband } from '@/lib/sources/ofcom';
import { mapEpcRow } from '@/lib/sources/epc';
import { parseInspireGml, parseParcel } from '@/lib/gml';
import { LONDON_LA_CODES, regionLaCodes } from '@/lib/region';

const j = (f: string) => JSON.parse(fs.readFileSync(`fixtures/${f}`, 'utf8'));

describe('Propalt parsing', () => {
  it('reads broadband strings', () => {
    expect(propaltBroadband(j('propalt-broadband.json'))).toMatchObject({ maxDownloadMbps: 200, maxUploadMbps: 12, fullFibre: true, ultrafast: true, superfast: true });
  });
  it('builds an address from PAF parts', () => {
    expect(propaltAddressText(firstRecord(j('propalt-property.json')))).toBe('11 Eton Rise, Eton College Road, London, NW3 2DE');
  });
});

describe('Ofcom', () => {
  it('prefers the exact UPRN row', () => {
    const s = summariseOfcomBroadband([{ UPRN: 1, MaxPredictedDown: 80, MaxPredictedUp: 20 }, { UPRN: 2, MaxPredictedDown: 1000, MaxPredictedUp: 1000 }], 1);
    expect(s).toMatchObject({ maxDownloadMbps: 80, superfast: true, ultrafast: false });
  });
});

describe('EPC', () => {
  it('maps bulk CSV style rows', () => {
    const r = mapEpcRow({ 'lmk-key': 'abc', 'current-energy-rating': 'D', 'total-floor-area': '71.5', address1: 'Flat 2', address2: '10 High St', 'mains-gas-flag': 'Y', 'walls-description': 'NO DATA!' });
    expect(r).toMatchObject({ lmk_key: 'abc', current_energy_rating: 'D', total_floor_area: 71.5, address: 'Flat 2, 10 High St', walls_description: null });
  });
});

describe('INSPIRE GML', () => {
  const block = `<LR:PREDEFINED gml:id="x"><LR:INSPIREID>12345</LR:INSPIREID><LR:GEOMETRY><gml:Polygon gml:id="p"><gml:exterior><gml:LinearRing><gml:posList srsDimension="2" count="4">530000 180000 530010 180000 530010 180010 530000 180000</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></LR:GEOMETRY></LR:PREDEFINED>`;
  it('parses one parcel', () => {
    expect(parseParcel(block)).toEqual(['12345', 'MULTIPOLYGON(((530000 180000,530010 180000,530010 180010,530000 180000)))']);
  });
  it('streams parcels split across chunks', async () => {
    const two = block + block.replace('12345', '67890');
    const chunks = [two.slice(0, 50), two.slice(50, 400), two.slice(400)];
    const out: string[] = [];
    for await (const [id] of parseInspireGml((async function* () { yield* chunks; })())) out.push(id);
    expect(out).toEqual(['12345', '67890']);
  });
});

describe('region', () => {
  it('defaults to the 33 London authorities', () => {
    expect(LONDON_LA_CODES).toHaveLength(33);
    expect(LONDON_LA_CODES[0]).toBe('E09000001');
    expect(LONDON_LA_CODES[32]).toBe('E09000033');
    expect(regionLaCodes('E06000001, e06000002')).toEqual(['E06000001', 'E06000002']);
  });
});
