import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildContext } from '@/lib/property';
import { firstRecord } from '@/lib/property';
import { currentUser } from '@/lib/request';
import { PropertyMap } from '@/components/PropertyMap';

export const dynamic = 'force-dynamic';

export default async function PropertyPage({ params }: { params: Promise<{ uprn: string }> }) {
  const { uprn } = await params;
  if (!/^\d{1,12}$/.test(uprn)) notFound();
  const ctx = await buildContext(Number(uprn), await currentUser());
  if (!ctx) notFound();
  const { property: p, epc, designations, flood, broadband, crime, council, lastSale } = ctx;
  const pa = firstRecord(ctx.propalt.property.data);
  const lease = firstRecord(ctx.propalt.leaseholds.data);
  const planning = (ctx.propalt.planning.data?.data as Record<string, string>[] | undefined) ?? [];
  const e = epc.data;

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (v === null || v === undefined || v === '' ? null : <><dt>{k}</dt><dd>{v}</dd></>);
  const Unavailable = ({ r }: { r: { ok: boolean; error?: string; source: string } }) =>
    r.ok ? null : <p className="hint">{r.error ? `${r.source} unavailable: ${r.error.slice(0, 120)}` : `No ${r.source} data.`}</p>;

  return (
    <main className="page">
      <div className="title-row">
        <div>
          <h1>{p.address ?? `UPRN ${p.uprn}`}</h1>
          <div className="hint">UPRN {p.uprn}{council.data ? ` · ${council.data.name}` : ''}{p.address_source ? ` · address from ${p.address_source.replace('_', ' ')}` : ''}</div>
        </div>
        <Link className="btn primary" href={`/property/${p.uprn}/report`} style={{ display: 'inline-flex', alignItems: 'center' }}>Open report</Link>
      </div>

      <div className="prop-grid">
        <div className="stack">
          <div className="prop-map"><PropertyMap lat={p.lat} lng={p.lng} title={ctx.title?.geojson ?? null} /></div>
          <div className="box">
            <h2>Designations and risk</h2>
            <Unavailable r={designations} />
            <div className="badges" style={{ marginBottom: 12 }}>
              {(designations.data ?? []).length === 0 && designations.ok && <span className="badge good">No designations found</span>}
              {(designations.data ?? []).map((d) => (
                <span key={d.entity} className={`badge ${d.dataset === 'flood-risk-zone' ? 'bad' : 'warn'}`}>
                  {d.dataset.replace(/-/g, ' ')}{d.name ? `: ${d.name}` : ''}{d['flood-risk-level'] ? ` (zone ${d['flood-risk-level']})` : ''}
                </span>
              ))}
            </div>
            <dl className="kv">
              <Row k="Flood warning areas" v={flood.data ? (flood.data.warningAreas.length ? flood.data.warningAreas.map((a) => a.label).join('; ') : 'None') : null} />
              <Row k="Active flood warnings" v={flood.data ? (flood.data.activeWarnings.length ? flood.data.activeWarnings.map((w) => w.severity).join(', ') : 'None') : null} />
              <Row k="Crime (1 mile, latest month)" v={crime.data ? `${crime.data.total} reports in ${crime.data.month}` : null} />
              <Row k="Coal mining area" v={(ctx.propalt.coal.data as { data?: { is_in_coal_zone?: boolean } } | null)?.data ? ((ctx.propalt.coal.data as { data: { is_in_coal_zone: boolean } }).data.is_in_coal_zone ? 'Yes' : 'No') : null} />
            </dl>
          </div>
          <div className="box">
            <h2>Planning applications</h2>
            <Unavailable r={ctx.propalt.planning} />
            {planning.length === 0 && ctx.propalt.planning.ok && <p className="hint">None on record.</p>}
            {planning.slice(0, 10).map((a, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 14 }}>
                <div>{a.description ?? a.proposal ?? 'Application'}</div>
                <div className="hint">{[a.reference, a.decision ?? a.status, a.start_date ?? a.received_date].filter(Boolean).join(' · ')}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="box">
            <h2>Key facts</h2>
            <dl className="kv">
              <Row k="Type" v={[e?.built_form, e?.property_type].filter(Boolean).join(' ') || (pa?.class_description as string)} />
              <Row k="Tenure" v={(pa?.tenure as string) ?? lastSale?.tenure} />
              <Row k="Bedrooms" v={pa?.number_of_bedrooms as number} />
              <Row k="Floor area" v={e?.total_floor_area ? `${e.total_floor_area} m²` : pa?.approx_size ? `${pa.approx_size} m²` : null} />
              <Row k="Built" v={e?.construction_age_band ?? (pa?.construction_age_band_std as string)} />
              <Row k="Council tax" v={pa?.tax_band ? `Band ${pa.tax_band}` : null} />
              <Row k="Title numbers" v={pa?.title_number_list as string} />
              <Row k="Title outline" v={ctx.title ? `INSPIRE ${ctx.title.inspire_id}, ${Math.round(ctx.title.area_m2)} m²` : 'Not loaded for this area'} />
              <Row k="Last sale" v={lastSale ? `£${lastSale.price.toLocaleString('en-GB')} on ${lastSale.date}` : null} />
              <Row k="Estimated value" v={pa?.avm ? `£${Number(pa.avm).toLocaleString('en-GB')} (Propalt)` : null} />
              <Row k="Lease" v={lease ? `${lease.term ?? `${lease.term_length} years`}, expires ${lease.date_of_lease_expire}` : null} />
            </dl>
            <Unavailable r={ctx.propalt.property} />
          </div>
          <div className="box">
            <h2>Energy</h2>
            <Unavailable r={epc} />
            <dl className="kv">
              <Row k="Rating" v={e ? `${e.current_energy_rating ?? '?'} now, ${e.potential_energy_rating ?? '?'} potential` : null} />
              <Row k="Heating" v={e?.main_heating_description} />
              <Row k="Walls" v={e?.walls_description} />
              <Row k="Roof" v={e?.roof_description} />
              <Row k="Windows" v={e?.windows_description} />
              <Row k="Certificate date" v={e?.lodgement_date} />
            </dl>
          </div>
          <div className="box">
            <h2>Connectivity</h2>
            <Unavailable r={broadband} />
            <dl className="kv">
              <Row k="Broadband" v={broadband.data ? `Up to ${broadband.data.maxDownloadMbps ?? '?'} Mbps down, ${broadband.data.maxUploadMbps ?? '?'} up` : null} />
              <Row k="Full fibre" v={broadband.data?.fullFibre == null ? null : broadband.data.fullFibre ? 'Available' : 'Not available'} />
              <Row k="Mobile" v={ctx.mobile.data?.length ? ctx.mobile.data.map((m) => `${m.operator} ${m.indoor4g ?? '?'}`).join(', ') : null} />
            </dl>
          </div>
        </div>
      </div>
    </main>
  );
}
