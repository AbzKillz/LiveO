import { getJson } from '../http';
import { cached } from '../cache';

/** Environment Agency real time flood monitoring API (OGL, no key). */
const EA_BASE = 'https://environment.data.gov.uk/flood-monitoring';

interface FloodArea { notation: string; label: string; description?: string; riverOrSea?: string }
interface FloodWarning { description: string; severity: string; severityLevel: number; message?: string; timeRaised?: string }

export async function floodAlertsNear(lat: number, lng: number) {
  const { data } = await cached('ea-flood', `${lat.toFixed(4)},${lng.toFixed(4)}`, 1, async () => {
    const [areas, floods] = await Promise.all([
      getJson<{ items: FloodArea[] }>('ea-flood', `${EA_BASE}/id/floodAreas?lat=${lat}&long=${lng}&dist=1`),
      getJson<{ items: FloodWarning[] }>('ea-flood', `${EA_BASE}/id/floods?lat=${lat}&long=${lng}&dist=1`),
    ]);
    return {
      warningAreas: areas.items.map((a) => ({ id: a.notation, label: a.label, source: a.riverOrSea ?? null })),
      activeWarnings: floods.items.map((f) => ({ description: f.description, severity: f.severity, level: f.severityLevel, raised: f.timeRaised ?? null })),
    };
  });
  return data;
}

/**
 * Map overlays served as WMS by the EA. These URLs are from the EA spatial data catalogue;
 * they are display only (no per property lookup) so a wrong URL only blanks the layer.
 */
export const EA_WMS_LAYERS = {
  riversAndSea: {
    label: 'Flood risk: rivers and sea',
    url: 'https://environment.data.gov.uk/spatialdata/risk-of-flooding-from-rivers-and-sea/wms',
    layer: 'Risk_of_Flooding_from_Rivers_and_Sea',
  },
  surfaceWater: {
    label: 'Flood risk: surface water',
    url: 'https://environment.data.gov.uk/spatialdata/nafra2-risk-of-flooding-from-surface-water/wms',
    layer: 'rofsw',
  },
};
