import { getJson } from '../http';
import { cached } from '../cache';

/**
 * planning.data.gov.uk (DLUHC, OGL). One API for many England wide designations.
 * https://www.planning.data.gov.uk/docs
 */
export const PLANNING_BASE = process.env.PLANNING_DATA_BASE ?? 'https://www.planning.data.gov.uk';

export const DESIGNATIONS = [
  { dataset: 'conservation-area', label: 'Conservation area', colour: '#7c3aed' },
  { dataset: 'listed-building-outline', label: 'Listed building', colour: '#b45309' },
  { dataset: 'article-4-direction-area', label: 'Article 4 direction', colour: '#db2777' },
  { dataset: 'tree-preservation-zone', label: 'Tree preservation order', colour: '#15803d' },
  { dataset: 'flood-risk-zone', label: 'Flood risk zone (rivers and sea)', colour: '#2563eb' },
  { dataset: 'scheduled-monument', label: 'Scheduled monument', colour: '#92400e' },
  { dataset: 'world-heritage-site', label: 'World heritage site', colour: '#a16207' },
  { dataset: 'park-and-garden', label: 'Registered park or garden', colour: '#4d7c0f' },
  { dataset: 'green-belt', label: 'Green belt', colour: '#16a34a' },
  { dataset: 'site-of-special-scientific-interest', label: 'SSSI', colour: '#0f766e' },
  { dataset: 'brownfield-land', label: 'Brownfield land', colour: '#78716c' },
] as const;

export type DesignationDataset = (typeof DESIGNATIONS)[number]['dataset'];

export interface PlanningEntity {
  entity: number;
  dataset: string;
  name?: string;
  reference?: string;
  'start-date'?: string;
  'flood-risk-level'?: string;
  'listed-building-grade'?: string;
  'documentation-url'?: string;
}

/** Every designation that covers a point, in one request. */
export async function designationsAt(lat: number, lng: number) {
  const qs = new URLSearchParams({ latitude: String(lat), longitude: String(lng), limit: '100' });
  for (const d of DESIGNATIONS) qs.append('dataset', d.dataset);
  // Point lookups are free and cheap but still cached a week to be polite.
  const { data } = await cached('planning-data', `at:${lat.toFixed(6)},${lng.toFixed(6)}`, 24 * 7, () =>
    getJson<{ entities: PlanningEntity[] }>('planning-data', `${PLANNING_BASE}/entity.json?${qs}`),
  );
  return data.entities ?? [];
}

/** GeoJSON for one dataset within a bounding box, for map overlays. */
export async function designationGeojson(dataset: DesignationDataset, bbox: [number, number, number, number]) {
  const [w, s, e, n] = bbox;
  const wkt = `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`;
  const qs = new URLSearchParams({ dataset, geometry: wkt, geometry_relation: 'intersects', limit: '500' });
  const key = `geo:${dataset}:${bbox.map((v) => v.toFixed(3)).join(',')}`;
  const { data } = await cached('planning-data', key, 24 * 7, () =>
    getJson<GeoJSON.FeatureCollection>('planning-data', `${PLANNING_BASE}/entity.geojson?${qs}`),
  );
  return data;
}
