'use client';
import maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { ATTRIBUTION, resolveStyle } from './mapStyle';
import { addDataLayers } from './layers';

export function PropertyMap({ lat, lng, title }: { lat: number; lng: number; title: GeoJSON.Geometry | null }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: { version: 8, sources: {}, layers: [] }, center: [lng, lat], zoom: 17, attributionControl: false });
    const ready = resolveStyle().then((st) => new Promise<void>((res) => { m.once('style.load', () => res()); m.setStyle(st, { diff: false }); }));
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    ready.then(() => {
      addDataLayers(m, { titles: true });
      if (title) {
        m.addSource('this-title', { type: 'geojson', data: { type: 'Feature', geometry: title, properties: {} } });
        m.addLayer({ id: 'this-title-fill', type: 'fill', source: 'this-title', paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.25 } });
        m.addLayer({ id: 'this-title-line', type: 'line', source: 'this-title', paint: { 'line-color': '#0f766e', 'line-width': 3 } });
      }
      new maplibregl.Marker({ color: '#0f766e' }).setLngLat([lng, lat]).addTo(m);
    });
    return () => m.remove();
  }, [lat, lng, title]);
  return <div ref={el} style={{ position: 'absolute', inset: 0 }} />;
}
