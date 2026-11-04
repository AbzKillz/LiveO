import type { PropertyContext } from './property';
import { firstRecord } from './property';

/**
 * Material information pack, structured on the National Trading Standards Estate and Letting
 * Agency Team guidance (Parts A, B and C). Each item says where its value came from, so staff
 * know what is verified data and what they must confirm with the seller.
 */
export type PackStatus = 'auto' | 'needs_input' | 'check';

export interface PackItem {
  id: string;
  part: 'A' | 'B' | 'C';
  label: string;
  value: string | null;
  source: string | null;
  status: PackStatus;
  note?: string;
}

export interface Pack {
  generatedAt: string;
  address: string | null;
  uprn: number;
  items: PackItem[];
  completeness: { auto: number; check: number; needsInput: number; total: number };
}

const AGENT = 'Seller or agent';

function item(id: string, part: PackItem['part'], label: string, value: string | null | undefined, source: string | null, note?: string, forceCheck = false): PackItem {
  const v = value === undefined || value === null || value === '' ? null : value;
  return { id, part, label, value: v, source: v ? source : null, status: v ? (forceCheck ? 'check' : 'auto') : 'needs_input', note };
}

function ask(id: string, part: PackItem['part'], label: string, note?: string): PackItem {
  return { id, part, label, value: null, source: AGENT, status: 'needs_input', note };
}

export function buildPack(ctx: PropertyContext, agentInputs: Record<string, string> = {}, now = new Date()): Pack {
  const epc = ctx.epc.data;
  const pa = firstRecord(ctx.propalt.property.data);
  const lease = firstRecord(ctx.propalt.leaseholds.data);
  const designations = ctx.designations.data ?? [];
  const has = (dataset: string) => designations.filter((d) => d.dataset === dataset);
  const yesNo = (list: unknown[], what: string) => (ctx.designations.ok ? (list.length ? `Yes: ${what}` : 'No') : null);

  const tenure = (pa?.tenure as string | undefined) ?? ctx.lastSale?.tenure ?? epc?.tenure ?? null;
  const isLeasehold = /lease/i.test(tenure ?? '');
  const flood = has('flood-risk-zone');
  const floodLevel = flood.map((f) => f['flood-risk-level']).filter(Boolean).sort().pop();
  const conservation = has('conservation-area');
  const listed = has('listed-building-outline');
  const a4 = has('article-4-direction-area');
  const tpo = has('tree-preservation-zone');
  const coal = ctx.propalt.coal.data as { data?: { is_in_coal_zone?: boolean } } | null;
  const planningApps = (ctx.propalt.planning.data?.data as { reference?: string; decision?: string; description?: string }[] | undefined) ?? [];
  const bb = ctx.broadband.data;
  const mobile = ctx.mobile.data;

  const items: PackItem[] = [
    // Part A
    item('council_tax', 'A', 'Council tax band', (pa?.tax_band as string | undefined) ? `Band ${pa!.tax_band}` : null, 'Propalt (VOA derived)',
      'Confirm on the VOA council tax search before publishing.', true),
    item('council', 'A', 'Local authority', ctx.council.data?.name, 'ONS'),
    ask('price', 'A', 'Asking price or rent'),
    item('tenure', 'A', 'Tenure', tenure, pa?.tenure ? 'Propalt (HM Land Registry)' : ctx.lastSale ? 'HM Land Registry Price Paid' : 'EPC register', undefined, true),
    ...(isLeasehold
      ? [
          item('lease_term', 'A', 'Lease term', lease ? `${lease.term ?? `${lease.term_length} years`}, expires ${lease.date_of_lease_expire}` : null,
            'Propalt (HM Land Registry registered leases)', 'Unexpired term must be stated.'),
          ask('ground_rent', 'A', 'Ground rent and review terms'),
          ask('service_charge', 'A', 'Service charge (annual)'),
        ]
      : []),

    // Part B
    item('property_type', 'B', 'Property type', [epc?.built_form, epc?.property_type].filter(Boolean).join(' ') || (pa?.class_description as string | undefined), epc ? 'EPC register' : 'Propalt'),
    item('floor_area', 'B', 'Internal floor area', epc?.total_floor_area ? `${epc.total_floor_area} m²` : pa?.approx_size ? `${pa.approx_size} m² (approx.)` : null, epc ? 'EPC register' : 'Propalt'),
    item('rooms', 'B', 'Rooms', pa?.number_of_bedrooms ? `${pa.number_of_bedrooms} bed, ${pa.number_of_bathrooms ?? '?'} bath, ${pa.number_of_reception_rooms ?? '?'} reception` : epc?.number_habitable_rooms ? `${epc.number_habitable_rooms} habitable rooms` : null, pa?.number_of_bedrooms ? 'Propalt' : 'EPC register', undefined, true),
    item('age', 'B', 'Approximate build period', epc?.construction_age_band ?? (pa?.construction_age_band_std as string | undefined), epc ? 'EPC register' : 'Propalt'),
    item('construction', 'B', 'Construction', [epc?.walls_description, epc?.roof_description].filter(Boolean).join('; '), 'EPC register',
      'State if construction is non standard (timber frame, steel, concrete).', true),
    item('epc', 'B', 'Energy rating', epc?.current_energy_rating ? `${epc.current_energy_rating} (potential ${epc.potential_energy_rating ?? '?'}), lodged ${epc.lodgement_date ?? '?'}` : (pa?.current_energy_rating as string | undefined), epc ? 'EPC register' : 'Propalt'),
    item('heating', 'B', 'Heating', epc?.main_heating_description, 'EPC register', undefined, true),
    item('mains_gas', 'B', 'Mains gas', epc?.mains_gas_flag === 'Y' ? 'Yes' : epc?.mains_gas_flag === 'N' ? 'No' : null, 'EPC register', undefined, true),
    ask('electricity', 'B', 'Electricity supply'),
    ask('water', 'B', 'Water supply'),
    ask('sewerage', 'B', 'Sewerage', 'Mains, septic tank or other.'),
    item('broadband', 'B', 'Broadband', bb ? describeBroadband(bb) : null, bb?.source === 'ofcom' ? 'Ofcom Connected Nations' : 'Propalt (Ofcom derived)'),
    item('mobile', 'B', 'Mobile signal', mobile?.length ? mobile.map((m) => `${m.operator}: ${m.indoor4g ?? '?'} indoor 4G`).join('; ') : null, 'Ofcom Connected Nations'),
    ask('parking', 'B', 'Parking', 'Type of parking and any permit or charge.'),

    // Part C
    ask('building_safety', 'C', 'Building safety', 'Cladding, EWS1, unsafe materials, known defects.'),
    item('conservation', 'C', 'Conservation area', yesNo(conservation, conservation.map((c) => c.name).join(', ')), 'planning.data.gov.uk'),
    item('listed', 'C', 'Listed building', yesNo(listed, listed.map((l) => `${l.name ?? ''} grade ${l['listed-building-grade'] ?? '?'}`.trim()).join(', ')), 'planning.data.gov.uk (Historic England)',
      'Outline match: confirm on the National Heritage List.', true),
    item('article4', 'C', 'Article 4 direction', yesNo(a4, a4.map((a) => a.name).join(', ')), 'planning.data.gov.uk', 'Only councils that publish to planning.data.gov.uk are covered.', true),
    item('tpo', 'C', 'Tree preservation order', yesNo(tpo, `${tpo.length} zone(s)`), 'planning.data.gov.uk', 'Coverage depends on the council publishing its TPO data.', true),
    ask('restrictions', 'C', 'Restrictive covenants', 'From the title register. Order it from HM Land Registry if not held.'),
    ask('easements', 'C', 'Rights of way and easements'),
    item('flood_zone', 'C', 'Flood zone (rivers and sea)', ctx.designations.ok ? (floodLevel ? `Flood zone ${floodLevel}` : 'Flood zone 1 (low)') : null, 'planning.data.gov.uk (Environment Agency)'),
    item('flood_warnings', 'C', 'Flood warning area', ctx.flood.data ? (ctx.flood.data.warningAreas.length ? `Inside ${ctx.flood.data.warningAreas.length} warning area(s)` : 'Not in a warning area') : null, 'Environment Agency'),
    ask('flood_history', 'C', 'Flooding in the last 5 years', 'Seller must answer; also note flood defences.'),
    item('coal', 'C', 'Coal mining area', coal?.data ? (coal.data.is_in_coal_zone ? 'Yes, inside a coalfield' : 'No') : null, 'Propalt (Coal Authority)'),
    item('planning', 'C', 'Planning history', ctx.propalt.planning.ok ? (planningApps.length ? `${planningApps.length} application(s) on record` : 'None found') : null, 'Propalt', 'Review nearby applications on the property page.', true),
    ask('accessibility', 'C', 'Accessibility adaptations'),
    ask('coastal', 'C', 'Coastal erosion', 'Not applicable in London; check NCERM elsewhere.'),
  ];

  for (const it of items) {
    const v = agentInputs[it.id];
    if (v && v.trim()) Object.assign(it, { value: v.trim(), source: it.status === 'needs_input' ? AGENT : `${it.source}; edited by staff`, status: 'auto' as const });
  }

  const count = (s: PackStatus) => items.filter((i) => i.status === s).length;
  return {
    generatedAt: now.toISOString(),
    address: ctx.property.address,
    uprn: ctx.property.uprn,
    items,
    completeness: { auto: count('auto'), check: count('check'), needsInput: count('needs_input'), total: items.length },
  };
}

function describeBroadband(b: NonNullable<PropertyContext['broadband']['data']>): string {
  const tier = b.fullFibre ? 'Full fibre available' : b.ultrafast ? 'Ultrafast available' : b.superfast ? 'Superfast available' : 'Standard';
  return `${tier}; up to ${b.maxDownloadMbps ?? '?'} Mbps down, ${b.maxUploadMbps ?? '?'} Mbps up`;
}
