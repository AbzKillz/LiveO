'use client';
import maplibregl from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LetterRange, RangeSlider } from './RangeSlider';
import { ATTRIBUTION, LONDON_CENTER, resolveStyle } from './mapStyle';

type Range = [number | null, number | null];
type LRange = [string | null, string | null];

interface Filters {
  side: 'sale' | 'let';
  status?: string;
  outcodes: string[];
  price: Range; beds: Range; floorArea: Range; weeksOnMarket: Range;
  reducedWithinWeeks: number | null;
  epc: LRange; taxBand: LRange;
  propertyTypes: string[];
  tenure: 'freehold' | 'leasehold' | null;
  proprietorTypes: string[];
  agent: string | null;
  hmo: boolean; potentialHmo: boolean; retirement: boolean; accessible: boolean;
  minBelowEstimatePct: number | null; minPriceCutPct: number | null;
  page: number;
}

interface Listing {
  property_id: number; address: string; postcode: string; lat: number | null; lng: number | null;
  current_price: number | null; first_listed_price: number | null; predict_price: number | null;
  num_beds: number | null; property_type_std: string | null; property_tenure: string | null;
  brand_name: string | null; current_energy_rating: string | null; total_floor_area: number | null;
  first_listed_date: string | null; first_reduce_date: string | null; tax_band?: string | null;
  weeks_on_market: number | null; below_estimate_pct: number | null; price_cut_pct: number | null;
}

const EMPTY: Filters = {
  side: 'sale', outcodes: [], price: [null, null], beds: [null, null], floorArea: [null, null], weeksOnMarket: [null, null],
  reducedWithinWeeks: null, epc: [null, null], taxBand: [null, null], propertyTypes: [], tenure: null, proprietorTypes: [],
  agent: null, hmo: false, potentialHmo: false, retirement: false, accessible: false, minBelowEstimatePct: null, minPriceCutPct: null, page: 0,
};

const SALE_PRICES = [0, 100e3, 150e3, 200e3, 250e3, 300e3, 350e3, 400e3, 500e3, 600e3, 750e3, 1e6, 1.25e6, 1.5e6, 2e6, 3e6, 5e6, 10e6];
const RENTS = [0, 500, 750, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 4000, 5000, 7500, 10000];
const BEDS = [0, 1, 2, 3, 4, 5, 6];
const AREAS = [0, 30, 40, 50, 60, 75, 90, 110, 130, 160, 200, 250, 300, 400];
const WEEKS = [0, 1, 2, 4, 8, 12, 16, 26, 39, 52, 78, 104];
const STATUSES = {
  sale: [['for_sale', 'For sale'], ['reduction', 'Reduced'], ['sold_sstc', 'Sold STC'], ['withdrawn', 'Withdrawn']],
  let: [['for_rent', 'To let'], ['reduction', 'Reduced'], ['let_agreed', 'Let agreed'], ['withdrawn', 'Withdrawn']],
} as const;
const TYPES = ['Detached', 'Semi-Detached', 'Terraced', 'Flat'];
const OWNERS = [['private', 'Private'], ['business', 'Company'], ['house_association', 'Housing assoc.'], ['local_authority', 'Council']];

const money = (n: number) => (n >= 1e6 ? `£${(n / 1e6).toFixed(n % 1e6 ? 2 : 0).replace(/\.?0+$/, '')}m` : n >= 1e3 ? `£${Math.round(n / 1e3)}k` : `£${n}`);
const fullMoney = (n: number | null | undefined) => (n == null ? '?' : `£${n.toLocaleString('en-GB')}`);
const weeksLabel = (w: number) => (w >= 52 ? `${Math.round((w / 52) * 10) / 10}y` : `${w}w`);

type SortKey = 'newest' | 'price_asc' | 'price_desc' | 'below_estimate' | 'longest' | 'price_cut';

export function Finder({ initialDistrict }: { initialDistrict?: string }) {
  const [f, setF] = useState<Filters>(() => ({ ...EMPTY, outcodes: initialDistrict ? [initialDistrict.toUpperCase()] : [] }));
  const [districtInput, setDistrictInput] = useState('');
  const [suggestions, setSuggestions] = useState<{ outcode: string }[]>([]);
  const [count, setCount] = useState<{ total: number; byOutcode: { outcode: string; count: number }[] } | null>(null);
  const [results, setResults] = useState<Listing[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [loading, setLoading] = useState<'count' | 'search' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('newest');
  const [highlight, setHighlight] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const fRef = useRef(f);
  fRef.current = f;

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    setF((p) => ({ ...p, [k]: v, page: 0 }));
    setCount(null);
  };
  const toggleIn = <K extends 'outcodes' | 'propertyTypes' | 'proprietorTypes'>(k: K, v: string) =>
    set(k, (f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v]) as Filters[K]);

  const addDistrict = useCallback((oc: string) => {
    const o = oc.trim().toUpperCase();
    if (!/^[A-Z]{1,2}\d[A-Z\d]?$/.test(o)) return;
    setF((p) => (p.outcodes.includes(o) || p.outcodes.length >= 20 ? p : { ...p, outcodes: [...p.outcodes, o], page: 0 }));
    setCount(null);
  }, []);

  // Search bar in the top bar can add districts.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { outcode?: string; lat?: number; lng?: number };
      if (d.outcode) addDistrict(d.outcode);
      if (d.lat && d.lng) map.current?.flyTo({ center: [d.lng, d.lat], zoom: 13 });
    };
    window.addEventListener('liveo:add-district', h);
    return () => window.removeEventListener('liveo:add-district', h);
  }, [addDistrict]);

  useEffect(() => {
    if (districtInput.trim().length < 1) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/districts?q=${encodeURIComponent(districtInput)}`);
      if (r.ok) setSuggestions(await r.json());
    }, 150);
    return () => clearTimeout(t);
  }, [districtInput]);

  // Map setup: district polygons you click to add or remove.
  useEffect(() => {
    if (!mapEl.current) return;
    const m = new maplibregl.Map({ container: mapEl.current, style: { version: 8, sources: {}, layers: [] }, center: LONDON_CENTER, zoom: 10, attributionControl: false });
    const ready = resolveStyle().then((st) => new Promise<void>((res) => { m.once('style.load', () => res()); m.setStyle(st, { diff: false }); }));
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.current = m;
    ready.then(async () => {
      const res = await fetch('/api/districts');
      const fc = res.ok ? await res.json() : { type: 'FeatureCollection', features: [] };
      m.addSource('districts', { type: 'geojson', data: fc, promoteId: 'outcode' });
      m.addLayer({ id: 'district-fill', type: 'fill', source: 'districts', paint: {
        'fill-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#0f766e', '#64748b'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.28, ['boolean', ['feature-state', 'hover'], false], 0.12, 0.03],
      } });
      m.addLayer({ id: 'district-line', type: 'line', source: 'districts', paint: {
        'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#0f766e', '#94a3b8'],
        'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2, 0.8],
      } });
      m.addLayer({ id: 'district-label', type: 'symbol', source: 'districts', layout: {
        'text-field': ['get', 'outcode'], 'text-size': 12, 'text-font': ['Noto Sans Bold'],
      }, paint: { 'text-color': '#334155', 'text-halo-color': '#fff', 'text-halo-width': 1.5 }, minzoom: 10 });
      m.addSource('listings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'property_id' });
      m.addLayer({ id: 'listing-dots', type: 'circle', source: 'listings', paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'hl'], false], 9, 6],
        'circle-color': ['case', ['>=', ['coalesce', ['get', 'below'], -999], 10], '#15803d', ['>=', ['coalesce', ['get', 'cut'], -999], 5], '#b45309', '#0f766e'],
        'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
      } });
      let hovered: string | null = null;
      m.on('mousemove', 'district-fill', (e) => {
        const id = e.features?.[0]?.id as string | undefined;
        if (hovered && hovered !== id) m.setFeatureState({ source: 'districts', id: hovered }, { hover: false });
        if (id) { hovered = id; m.setFeatureState({ source: 'districts', id }, { hover: true }); }
        m.getCanvas().style.cursor = 'pointer';
      });
      m.on('mouseleave', 'district-fill', () => {
        if (hovered) m.setFeatureState({ source: 'districts', id: hovered }, { hover: false });
        hovered = null;
        m.getCanvas().style.cursor = '';
      });
      m.on('click', (e) => {
        const dot = m.queryRenderedFeatures(e.point, { layers: ['listing-dots'] })[0];
        if (dot) { setHighlight(Number(dot.properties.property_id)); document.getElementById(`l-${dot.properties.property_id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
        const d = m.queryRenderedFeatures(e.point, { layers: ['district-fill'] })[0];
        const oc = d?.properties?.outcode as string | undefined;
        if (!oc) return;
        const cur = fRef.current.outcodes;
        setF((p) => ({ ...p, outcodes: cur.includes(oc) ? cur.filter((x) => x !== oc) : [...cur, oc], page: 0 }));
        setCount(null);
      });
      syncSelection(m, fRef.current.outcodes, []);
    });
    return () => m.remove();
  }, []);

  const prevSel = useRef<string[]>([]);
  useEffect(() => {
    const m = map.current;
    if (m?.getSource('districts')) syncSelection(m, f.outcodes, prevSel.current);
    prevSel.current = f.outcodes;
  }, [f.outcodes]);

  const sorted = useMemo(() => {
    const r = [...results];
    const by = {
      newest: (a: Listing, b: Listing) => (b.first_listed_date ?? '').localeCompare(a.first_listed_date ?? ''),
      price_asc: (a: Listing, b: Listing) => (a.current_price ?? Infinity) - (b.current_price ?? Infinity),
      price_desc: (a: Listing, b: Listing) => (b.current_price ?? 0) - (a.current_price ?? 0),
      below_estimate: (a: Listing, b: Listing) => (b.below_estimate_pct ?? -999) - (a.below_estimate_pct ?? -999),
      longest: (a: Listing, b: Listing) => (b.weeks_on_market ?? 0) - (a.weeks_on_market ?? 0),
      price_cut: (a: Listing, b: Listing) => (b.price_cut_pct ?? -999) - (a.price_cut_pct ?? -999),
    }[sort];
    return r.sort(by);
  }, [results, sort]);

  // Push results to the map.
  useEffect(() => {
    const src = map.current?.getSource('listings') as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: results.filter((r) => r.lat && r.lng).map((r) => ({
      type: 'Feature', id: r.property_id, geometry: { type: 'Point', coordinates: [r.lng!, r.lat!] },
      properties: { property_id: r.property_id, below: r.below_estimate_pct, cut: r.price_cut_pct },
    })) });
    const pts = results.filter((r) => r.lat && r.lng);
    if (pts.length && f.page === 0) {
      const b = new maplibregl.LngLatBounds();
      pts.forEach((p) => b.extend([p.lng!, p.lat!]));
      map.current?.fitBounds(b, { padding: 60, maxZoom: 14, duration: 600 });
    }
  }, [results]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevHl = useRef<number | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!m?.getSource('listings')) return;
    if (prevHl.current != null) m.setFeatureState({ source: 'listings', id: prevHl.current }, { hl: false });
    if (highlight != null) m.setFeatureState({ source: 'listings', id: highlight }, { hl: true });
    prevHl.current = highlight;
  }, [highlight]);

  async function post<T>(url: string, body: Filters): Promise<T | null> {
    setError(null);
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { setError(typeof j.error === 'string' ? j.error : 'Request failed'); return null; }
    return j as T;
  }

  async function preview() {
    setLoading('count');
    const j = await post<typeof count>('/api/listings/count', f);
    if (j) setCount(j);
    setLoading(null);
  }

  async function search(page = 0) {
    setLoading('search');
    const body = { ...f, page };
    const j = await post<{ results: Listing[]; hasMore: boolean; snapshot: string | null }>('/api/listings/search', body);
    if (j) {
      setSnapshot(j.snapshot);
      setResults((prev) => (page === 0 ? j.results : [...prev, ...j.results]));
      setHasMore(j.hasMore);
      setF(body);
    }
    setLoading(null);
  }

  async function saveSearch() {
    const name = prompt('Name this search');
    if (!name) return;
    await fetch('/api/saved-searches', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, filters: f }) });
  }

  const statuses = STATUSES[f.side];
  const calls = f.outcodes.length;

  return (
    <div className="finder">
      <aside className="panel">
        <div className="section">
          <div className="seg">
            {(['sale', 'let'] as const).map((s) => (
              <button key={s} className={f.side === s ? 'on' : ''} onClick={() => setF((p) => ({ ...p, side: s, status: undefined, price: [null, null], page: 0 }))}>
                {s === 'sale' ? 'For sale' : 'To let'}
              </button>
            ))}
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            {statuses.map(([v, l]) => (
              <button key={v} className={`chip ${(f.status ?? statuses[0][0]) === v ? 'on' : ''}`} onClick={() => set('status', v)}>{l}</button>
            ))}
          </div>
        </div>

        <div className="section">
          <h3>Postcode districts</h3>
          <div style={{ position: 'relative' }}>
            <input className="text" placeholder="Type a district, e.g. NW3, or click the map" value={districtInput}
              onChange={(e) => setDistrictInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { addDistrict(districtInput); setDistrictInput(''); } }} />
            {suggestions.length > 0 && districtInput && (
              <div className="searchbox"><div className="menu" style={{ top: 4, width: '100%' }}>
                {suggestions.map((s) => <button key={s.outcode} onMouseDown={() => { addDistrict(s.outcode); setDistrictInput(''); }}>{s.outcode}</button>)}
              </div></div>
            )}
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            {f.outcodes.length === 0 && <span className="hint">No districts yet. Click areas on the map to add them.</span>}
            {f.outcodes.map((o) => <button key={o} className="chip on" onClick={() => toggleIn('outcodes', o)}>{o}<span className="x">×</span></button>)}
          </div>
        </div>

        <div className="section">
          <h3>Price and size</h3>
          <RangeSlider label={f.side === 'sale' ? 'Price' : 'Rent (pcm)'} stops={f.side === 'sale' ? SALE_PRICES : RENTS} value={f.price} onChange={(v) => set('price', v)} format={money} />
          <RangeSlider label="Bedrooms" stops={BEDS} value={f.beds} onChange={(v) => set('beds', v)} format={(n) => (n === 0 ? 'Studio' : String(n))} />
          <RangeSlider label="Floor area" stops={AREAS} value={f.floorArea} onChange={(v) => set('floorArea', v)} format={(n) => `${n} m²`} />
        </div>

        <div className="section">
          <h3>Market timing</h3>
          <RangeSlider label="Time on market" stops={WEEKS} value={f.weeksOnMarket} onChange={(v) => set('weeksOnMarket', v)} format={weeksLabel} />
          <div className="field">
            <div className="field-head"><span>Reduced in the last</span></div>
            <div className="chips">
              {[null, 1, 2, 4, 8, 12].map((w) => (
                <button key={String(w)} className={`chip ${f.reducedWithinWeeks === w ? 'on' : ''}`} onClick={() => set('reducedWithinWeeks', w)}>{w ? `${w}w` : 'Any'}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="section">
          <h3>Property</h3>
          <div className="field">
            <div className="chips">
              {TYPES.map((t) => <button key={t} className={`chip ${f.propertyTypes.includes(t) ? 'on' : ''}`} onClick={() => toggleIn('propertyTypes', t)}>{t}</button>)}
            </div>
          </div>
          <div className="field">
            <div className="seg">
              {([null, 'freehold', 'leasehold'] as const).map((t) => (
                <button key={String(t)} className={f.tenure === t ? 'on' : ''} onClick={() => set('tenure', t)}>{t ? t[0].toUpperCase() + t.slice(1) : 'Any tenure'}</button>
              ))}
            </div>
          </div>
          <LetterRange label="EPC rating" letters="ABCDEFG" value={f.epc} onChange={(v) => set('epc', v)} />
          {f.side === 'sale' && <LetterRange label="Council tax band" letters="ABCDEFGH" value={f.taxBand} onChange={(v) => set('taxBand', v)} />}
        </div>

        <div className="section">
          <button className="btn block" onClick={() => setShowMore((s) => !s)}>{showMore ? 'Fewer filters' : 'More filters'}</button>
          {showMore && (
            <div style={{ marginTop: 14 }}>
              <div className="field">
                <div className="field-head"><span>Below our estimate by at least</span></div>
                <div className="chips">
                  {[null, 5, 10, 15, 20].map((p) => <button key={String(p)} className={`chip ${f.minBelowEstimatePct === p ? 'on' : ''}`} onClick={() => set('minBelowEstimatePct', p)}>{p ? `${p}%` : 'Any'}</button>)}
                </div>
              </div>
              <div className="field">
                <div className="field-head"><span>Price cut since listing at least</span></div>
                <div className="chips">
                  {[null, 3, 5, 10, 15].map((p) => <button key={String(p)} className={`chip ${f.minPriceCutPct === p ? 'on' : ''}`} onClick={() => set('minPriceCutPct', p)}>{p ? `${p}%` : 'Any'}</button>)}
                </div>
                <p className="hint">These two run on each page of results, so a page can show fewer than 20.</p>
              </div>
              <div className="field">
                <div className="field-head"><span>Owner type</span></div>
                <div className="chips">
                  {OWNERS.map(([v, l]) => <button key={v} className={`chip ${f.proprietorTypes.includes(v) ? 'on' : ''}`} onClick={() => toggleIn('proprietorTypes', v)}>{l}</button>)}
                </div>
              </div>
              <div className="field">
                <div className="field-head"><span>Agent</span></div>
                <input className="text" placeholder="Agent brand name" value={f.agent ?? ''} onChange={(e) => set('agent', e.target.value || null)} />
              </div>
              <div className="field chips">
                {([['hmo', 'HMO'], ['potentialHmo', 'Potential HMO'], ['retirement', 'Retirement'], ['accessible', 'Accessible']] as const).map(([k, l]) => (
                  <button key={k} className={`chip ${f[k] ? 'on' : ''}`} onClick={() => set(k, !f[k])}>{l}</button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky-foot">
          <button className="btn primary block" disabled={!calls || loading !== null} onClick={() => search(0)}>
            {loading === 'search' ? 'Searching…' : 'Show listings'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" style={{ flex: 1 }} disabled={!calls || loading !== null} onClick={preview}>{loading === 'count' ? 'Counting…' : 'Preview count'}</button>
            <button className="btn" disabled={!calls} onClick={saveSearch}>Save</button>
            <button className="btn" onClick={() => { setF(EMPTY); setCount(null); setResults([]); }}>Reset</button>
          </div>
          <span className="hint">{calls ? `${calls} district${calls > 1 ? 's' : ''}: ${calls} Propalt call${calls > 1 ? 's' : ''} per page, cached for an hour.` : 'Pick a district to search.'}</span>
        </div>
      </aside>

      <section className="mapwrap">
        <div ref={mapEl} className="map" />
        <div className="map-legend">
          <div><span className="swatch" style={{ background: '#15803d' }} /> 10%+ below estimate</div>
          <div><span className="swatch" style={{ background: '#b45309' }} /> Price cut 5%+</div>
          <div><span className="swatch" style={{ background: '#0f766e' }} /> Other listings</div>
        </div>
      </section>

      <aside className="panel right">
        <div className="results-head">
          <div>
            <strong>{results.length ? `${results.length} listings` : count ? `${count.total.toLocaleString('en-GB')} match` : 'Results'}</strong>
            {count && <div className="hint">{count.byOutcode.map((c) => `${c.outcode} ${c.count}`).join(' · ')}</div>}
          </div>
          <select className="text" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="newest">Newest</option>
            <option value="price_asc">Price, low to high</option>
            <option value="price_desc">Price, high to low</option>
            <option value="below_estimate">Most below estimate</option>
            <option value="price_cut">Biggest price cut</option>
            <option value="longest">Longest on market</option>
          </select>
        </div>
        {error && <div className="error">{error}</div>}
        {snapshot && (
          <div className="error" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
            Test mode: Propalt listings for NW1 and NW3 captured on {snapshot}, filtered locally. Live listings and property pages start once a Propalt API key is set.
          </div>
        )}
        <div className="results">
          {!results.length && !error && <div className="empty">Pick districts, set your filters, then press Show listings.</div>}
          {sorted.map((r) => (
            <Card key={r.property_id} id={`l-${r.property_id}`} className={`card ${highlight === r.property_id ? 'hl' : ''}`}
              href={snapshot ? undefined : `/api/property/resolve?propalt_id=${r.property_id}`} onMouseEnter={() => setHighlight(r.property_id)}>
              <div className="price">{fullMoney(r.current_price)}{f.side === 'let' ? ' pcm' : ''}</div>
              <div className="addr">{r.address}</div>
              <div className="meta">
                {r.num_beds != null && <span>{r.num_beds} bed</span>}
                {r.property_type_std && <span>{r.property_type_std}</span>}
                {r.total_floor_area && <span>{r.total_floor_area} m²</span>}
                {r.property_tenure && <span>{r.property_tenure}</span>}
                {r.brand_name && <span>{r.brand_name}</span>}
              </div>
              <div className="badges">
                {r.weeks_on_market != null && <span className="badge">{r.weeks_on_market === 0 ? 'New this week' : `${weeksLabel(r.weeks_on_market)} on market`}</span>}
                {r.current_energy_rating && <span className="badge">EPC {r.current_energy_rating}</span>}
                {r.below_estimate_pct != null && r.below_estimate_pct > 0 && <span className={`badge ${r.below_estimate_pct >= 10 ? 'good' : ''}`}>{r.below_estimate_pct}% below estimate</span>}
                {r.price_cut_pct != null && r.price_cut_pct > 0 && <span className="badge warn">Cut {r.price_cut_pct}%</span>}
              </div>
            </Card>
          ))}
          {hasMore && <div style={{ padding: 16 }}><button className="btn block" disabled={loading !== null} onClick={() => search(f.page + 1)}>Load next page</button></div>}
        </div>
      </aside>
    </div>
  );
}

/** A listing card is a link only when it can open a property page. */
function Card({ href, ...rest }: React.HTMLAttributes<HTMLElement> & { href?: string }) {
  return href ? <a href={href} {...rest} /> : <div {...rest} />;
}

function syncSelection(m: maplibregl.Map, now: string[], before: string[]) {
  for (const o of before) if (!now.includes(o)) m.setFeatureState({ source: 'districts', id: o }, { selected: false });
  for (const o of now) m.setFeatureState({ source: 'districts', id: o }, { selected: true });
}
