// The 33 London local authorities (32 boroughs plus the City of London), ONS codes.
export const LONDON_LA_CODES = Array.from({ length: 33 }, (_, i) => `E09${String(i + 1).padStart(6, '0')}`);

/** Local authority codes the bulk loaders keep. Set LIVEO_REGION to "london" or a comma list. */
export function regionLaCodes(value = process.env.LIVEO_REGION ?? 'london'): string[] {
  const v = value.trim().toLowerCase();
  if (v === '' || v === 'london') return LONDON_LA_CODES;
  if (v === 'all') return [];
  return value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
}

/** Rough bounding box of Greater London, used as a cheap prefilter before the polygon test. */
export const LONDON_BBOX = { minLng: -0.52, minLat: 51.28, maxLng: 0.34, maxLat: 51.70 };
