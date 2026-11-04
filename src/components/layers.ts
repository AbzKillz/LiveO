import type maplibregl from 'maplibre-gl';

export const DESIGNATION_LAYERS = [
  { dataset: 'conservation-area', label: 'Conservation areas', colour: '#7c3aed' },
  { dataset: 'listed-building-outline', label: 'Listed buildings', colour: '#b45309' },
  { dataset: 'article-4-direction-area', label: 'Article 4 areas', colour: '#db2777' },
  { dataset: 'tree-preservation-zone', label: 'Tree preservation', colour: '#15803d' },
  { dataset: 'flood-risk-zone', label: 'Flood zones', colour: '#2563eb' },
  { dataset: 'scheduled-monument', label: 'Scheduled monuments', colour: '#92400e' },
  { dataset: 'park-and-garden', label: 'Historic parks', colour: '#4d7c0f' },
  { dataset: 'green-belt', label: 'Green belt', colour: '#16a34a' },
  { dataset: 'brownfield-land', label: 'Brownfield land', colour: '#78716c' },
] as const;

export const WMS_LAYERS = [
  { id: 'ea-rivers-sea', label: 'Flood risk: rivers and sea', url: 'https://environment.data.gov.uk/spatialdata/risk-of-flooding-from-rivers-and-sea/wms', layer: 'Risk_of_Flooding_from_Rivers_and_Sea' },
  { id: 'ea-surface', label: 'Flood risk: surface water', url: 'https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-surface-water/wms', layer: 'rofsw' },
] as const;

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const bboxOf = (m: maplibregl.Map) => m.getBounds().toArray().flat().map((v) => v.toFixed(5)).join(',');

/**
 * Adds title outlines and address points (fetched per viewport at street zoom) plus hidden
 * designation and WMS layers. Returns a function to toggle any layer by id.
 */
export function addDataLayers(m: maplibregl.Map, opts: { titles?: boolean; points?: boolean; onPointClick?: (uprn: string) => void } = {}) {
  m.addSource('titles', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'titles-line', type: 'line', source: 'titles', minzoom: 15, layout: { visibility: opts.titles === false ? 'none' : 'visible' },
    paint: { 'line-color': '#dc2626', 'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 19, 1.6], 'line-opacity': 0.8 } });
  m.addSource('points', { type: 'geojson', data: EMPTY });
  m.addLayer({ id: 'points', type: 'circle', source: 'points', minzoom: 16, layout: { visibility: opts.points ? 'visible' : 'none' },
    paint: { 'circle-radius': 4, 'circle-color': ['case', ['get', 'has_address'], '#0f766e', '#94a3b8'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });

  for (const d of DESIGNATION_LAYERS) {
    m.addSource(`d-${d.dataset}`, { type: 'geojson', data: EMPTY });
    m.addLayer({ id: `d-${d.dataset}-fill`, type: 'fill', source: `d-${d.dataset}`, layout: { visibility: 'none' }, paint: { 'fill-color': d.colour, 'fill-opacity': 0.18 } });
    m.addLayer({ id: `d-${d.dataset}-line`, type: 'line', source: `d-${d.dataset}`, layout: { visibility: 'none' }, paint: { 'line-color': d.colour, 'line-width': 1.2 } });
  }
  for (const w of WMS_LAYERS) {
    const tiles = `${w.url}?service=WMS&request=GetMap&version=1.3.0&layers=${w.layer}&styles=&format=image/png&transparent=true&crs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`;
    m.addSource(w.id, { type: 'raster', tiles: [tiles], tileSize: 256 });
    m.addLayer({ id: w.id, type: 'raster', source: w.id, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.6 } });
  }

  const visible = (id: string) => m.getLayer(id) && m.getLayoutProperty(id, 'visibility') !== 'none';
  async function refresh() {
    const z = m.getZoom();
    const bbox = bboxOf(m);
    const jobs: Promise<void>[] = [];
    if (z >= 15 && visible('titles-line')) jobs.push(load('titles', `/api/map/titles?bbox=${bbox}`));
    if (z >= 16 && visible('points')) jobs.push(load('points', `/api/map/properties?bbox=${bbox}`));
    for (const d of DESIGNATION_LAYERS) if (z >= 11 && visible(`d-${d.dataset}-fill`)) jobs.push(load(`d-${d.dataset}`, `/api/map/designations/${d.dataset}?bbox=${bbox}`));
    await Promise.allSettled(jobs);
  }
  async function load(source: string, url: string) {
    const r = await fetch(url);
    if (r.ok) (m.getSource(source) as maplibregl.GeoJSONSource).setData(await r.json());
  }
  let t: ReturnType<typeof setTimeout>;
  m.on('moveend', () => { clearTimeout(t); t = setTimeout(refresh, 250); });
  if (opts.onPointClick) {
    m.on('click', 'points', (e) => { const u = e.features?.[0]?.properties?.uprn; if (u) opts.onPointClick!(String(u)); });
    m.on('mouseenter', 'points', () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', 'points', () => { m.getCanvas().style.cursor = ''; });
  }
  refresh();

  return function toggle(id: string, on: boolean) {
    const ids = id.startsWith('d-') ? [`${id}-fill`, `${id}-line`] : [id];
    for (const l of ids) if (m.getLayer(l)) m.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none');
    if (on) refresh();
  };
}
