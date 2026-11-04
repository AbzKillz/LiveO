import type { StyleSpecification } from 'maplibre-gl';

export const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE ?? 'https://tiles.openfreemap.org/styles/positron';
export const LONDON_CENTER: [number, number] = [-0.118, 51.509];
export const ATTRIBUTION =
  'Contains OS data © Crown copyright and database right 2026. Contains HM Land Registry data © Crown copyright and database right 2026. ' +
  'Open Government Licence v3.0.';

/** Plain background used if the basemap host is unreachable, so our own layers still draw. */
const FALLBACK: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef1f4' } }],
};

export async function resolveStyle(): Promise<string | StyleSpecification> {
  try {
    const r = await fetch(MAP_STYLE, { signal: AbortSignal.timeout(4000) });
    if (r.ok) return (await r.json()) as StyleSpecification;
  } catch { /* fall through */ }
  console.warn('Basemap unavailable, using plain background');
  return FALLBACK;
}
