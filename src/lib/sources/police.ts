import { getJson } from '../http';
import { cached } from '../cache';

/** data.police.uk street level crime, last available month, 1 mile radius (OGL, no key). */
export async function crimeSummary(lat: number, lng: number) {
  const { data } = await cached('police', `${lat.toFixed(3)},${lng.toFixed(3)}`, 24 * 7, () =>
    getJson<{ category: string; month: string }[]>('police', `https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}`),
  );
  const byCategory: Record<string, number> = {};
  for (const c of data) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  return { month: data[0]?.month ?? null, total: data.length, byCategory };
}
