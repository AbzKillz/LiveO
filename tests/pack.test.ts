import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildPack } from '@/lib/pack';
import type { PropertyContext } from '@/lib/property';

const j = (f: string) => JSON.parse(fs.readFileSync(`fixtures/${f}`, 'utf8'));
const ok = <T,>(data: T, source = 'x') => ({ ok: true, data, source });

function ctx(over: Partial<PropertyContext> = {}): PropertyContext {
  return {
    property: { uprn: 5073099, lat: 51.545, lng: -0.156, la_code: 'E09000007', postcode: 'NW3 2DE', address: '11 Eton Rise, Eton College Road, London, NW3 2DE', address_source: 'propalt', propalt_property_id: 19439602 },
    title: null, lastSale: null,
    epc: ok({ lmk_key: 'k', current_energy_rating: 'C', potential_energy_rating: 'B', property_type: 'Flat', built_form: 'Mid-Terrace', total_floor_area: 46, construction_age_band: '1930-1949', main_fuel: 'mains gas', mains_gas_flag: 'Y', main_heating_description: 'Boiler and radiators, mains gas', walls_description: 'Solid brick', roof_description: 'Another dwelling above', windows_description: 'Double glazing', number_habitable_rooms: 2, tenure: 'Rented (private)', lodgement_date: '2021-03-01', address: null, postcode: 'NW3 2DE', source: 'local' }),
    designations: ok([{ entity: 1, dataset: 'conservation-area', name: 'Eton' }, { entity: 2, dataset: 'flood-risk-zone', 'flood-risk-level': '2' }]),
    flood: ok({ warningAreas: [], activeWarnings: [] }),
    broadband: ok({ maxDownloadMbps: 200, maxUploadMbps: 12, superfast: true, ultrafast: true, fullFibre: true, source: 'propalt' as const }),
    mobile: { ok: false, data: null, source: 'Ofcom' },
    crime: ok({ month: '2026-09', total: 10, byCategory: {} }),
    council: ok({ name: 'Camden', code: 'E09000007' }),
    propalt: {
      property: ok(j('propalt-property.json')), leaseholds: ok(j('propalt-leaseholds.json')), coal: ok(j('propalt-coal.json')),
      mining: ok(null), planning: ok({ data: [] }),
    },
    ...over,
  } as PropertyContext;
}

describe('material information pack', () => {
  it('prefills from data and flags what staff must add', () => {
    const p = buildPack(ctx());
    const by = Object.fromEntries(p.items.map((i) => [i.id, i]));
    expect(by.council_tax).toMatchObject({ value: 'Band C', status: 'check' });
    expect(by.tenure.value).toBe('Leasehold');
    expect(by.lease_term.value).toBe('999 years from 25 March 1969, expires 2968-03-25');
    expect(by.conservation.value).toBe('Yes: Eton');
    expect(by.flood_zone.value).toBe('Flood zone 2');
    expect(by.coal.value).toBe('No');
    expect(by.broadband.value).toContain('Full fibre');
    expect(by.parking.status).toBe('needs_input');
    expect(p.completeness.total).toBe(p.items.length);
  });

  it('leaves leasehold questions out for freeholds', () => {
    const c = ctx();
    c.propalt.property = ok({ data: [{ ...j('propalt-property.json').data[0], tenure: 'Freehold' }] });
    expect(buildPack(c).items.find((i) => i.id === 'ground_rent')).toBeUndefined();
  });

  it('does not claim "no designations" when the source failed', () => {
    const p = buildPack(ctx({ designations: { ok: false, data: null, source: 'planning.data.gov.uk', error: 'timeout' } }));
    expect(p.items.find((i) => i.id === 'conservation')!.status).toBe('needs_input');
    expect(p.items.find((i) => i.id === 'flood_zone')!.value).toBeNull();
  });

  it('applies staff inputs', () => {
    const p = buildPack(ctx(), { parking: 'Residents permit, zone CA-H' });
    expect(p.items.find((i) => i.id === 'parking')).toMatchObject({ value: 'Residents permit, zone CA-H', status: 'auto', source: 'Seller or agent' });
  });
});
