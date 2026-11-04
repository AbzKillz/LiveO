'use client';
import maplibregl from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ATTRIBUTION, LONDON_CENTER, resolveStyle } from './mapStyle';
import { addDataLayers, DESIGNATION_LAYERS, WMS_LAYERS } from './layers';

export function ExploreMap() {
  const el = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<((id: string, on: boolean) => void) | null>(null);
  const router = useRouter();
  const [on, setOn] = useState<Record<string, boolean>>({ 'titles-line': true, points: true });

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: { version: 8, sources: {}, layers: [] }, center: LONDON_CENTER, zoom: 12, attributionControl: false });
    const ready = resolveStyle().then((st) => new Promise<void>((res) => { m.once('style.load', () => res()); m.setStyle(st, { diff: false }); }));
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    ready.then(() => { toggleRef.current = addDataLayers(m, { titles: true, points: true, onPointClick: (u) => router.push(`/property/${u}`) }); });
    const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d.lat && d.lng) m.flyTo({ center: [d.lng, d.lat], zoom: 16 }); };
    window.addEventListener('liveo:add-district', h);
    return () => { window.removeEventListener('liveo:add-district', h); m.remove(); };
  }, [router]);

  const flip = (id: string) => { const v = !on[id]; setOn((s) => ({ ...s, [id]: v })); toggleRef.current?.(id, v); };
  const all = [
    { id: 'titles-line', label: 'Title outlines (zoom in)', colour: '#dc2626' },
    { id: 'points', label: 'Addresses (zoom in)', colour: '#0f766e' },
    ...DESIGNATION_LAYERS.map((d) => ({ id: `d-${d.dataset}`, label: d.label, colour: d.colour })),
    ...WMS_LAYERS.map((w) => ({ id: w.id, label: w.label, colour: '#1d4ed8' })),
  ];
  return (
    <div className="mapwrap" style={{ height: 'calc(100vh - 56px)' }}>
      <div ref={el} className="map" />
      <div className="layers">
        <strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)' }}>Layers</strong>
        {all.map((l) => (
          <label key={l.id}><input type="checkbox" checked={!!on[l.id]} onChange={() => flip(l.id)} /><span className="swatch" style={{ background: l.colour }} />{l.label}</label>
        ))}
      </div>
    </div>
  );
}
