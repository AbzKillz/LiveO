import { getJson } from '../http';
import { cached } from '../cache';

/**
 * Ofcom Connected Nations API. Free, needs a subscription key from api.ofcom.org.uk.
 * Falls back to Propalt broadband when no key is set.
 */
const OFCOM_BASE = 'https://api-proxy.ofcom.org.uk';

export interface BroadbandSummary {
  maxDownloadMbps: number | null;
  maxUploadMbps: number | null;
  superfast: boolean | null;
  ultrafast: boolean | null;
  fullFibre: boolean | null;
  source: 'ofcom' | 'propalt';
}

export interface MobileSummary { operator: string; indoor4g: string | null; outdoor4g: string | null; indoor5g: string | null; outdoor5g: string | null }

export function ofcomConfigured() { return Boolean(process.env.OFCOM_API_KEY); }

interface OfcomBroadbandRow {
  UPRN?: number; MaxBbPredictedDown?: number; MaxBbPredictedUp?: number; MaxSfbbPredictedDown?: number;
  MaxUfbbPredictedDown?: number; MaxPredictedDown?: number; MaxPredictedUp?: number;
}

export function summariseOfcomBroadband(rows: OfcomBroadbandRow[], uprn?: number): BroadbandSummary {
  const match = (uprn && rows.find((r) => r.UPRN === uprn)) || null;
  const pick = match ? [match] : rows;
  const max = (f: (r: OfcomBroadbandRow) => number | undefined) => {
    const vals = pick.map(f).filter((v): v is number => typeof v === 'number' && v > 0);
    return vals.length ? Math.max(...vals) : null;
  };
  const down = max((r) => r.MaxPredictedDown ?? r.MaxBbPredictedDown);
  const up = max((r) => r.MaxPredictedUp ?? r.MaxBbPredictedUp);
  return {
    maxDownloadMbps: down,
    maxUploadMbps: up,
    superfast: down == null ? null : down >= 30,
    ultrafast: down == null ? null : down >= 300,
    fullFibre: down == null ? null : down >= 1000,
    source: 'ofcom',
  };
}

export async function ofcomBroadband(postcode: string, uprn?: number): Promise<BroadbandSummary> {
  const pc = postcode.replace(/\s+/g, '').toUpperCase();
  const { data } = await cached('ofcom', `bb:${pc}`, 24 * 30, () =>
    getJson<{ Availability: OfcomBroadbandRow[] }>('ofcom', `${OFCOM_BASE}/broadband/coverage/${pc}`, {
      headers: { 'Ocp-Apim-Subscription-Key': process.env.OFCOM_API_KEY! },
    }),
  );
  return summariseOfcomBroadband(data.Availability ?? [], uprn);
}

interface OfcomMobileRow {
  UPRN?: number;
  [k: string]: unknown;
}

const OPERATORS = { EE: 'EE', H3: 'Three', TF: 'O2', VO: 'Vodafone' } as const;

export function summariseOfcomMobile(rows: OfcomMobileRow[], uprn?: number): MobileSummary[] {
  const row = (uprn && rows.find((r) => r.UPRN === uprn)) || rows[0];
  if (!row) return [];
  const level = (v: unknown) => (v === undefined || v === null ? null : ['None', 'Limited', 'Likely', 'Good'][Number(v)] ?? String(v));
  return Object.entries(OPERATORS).map(([code, operator]) => ({
    operator,
    indoor4g: level(row[`${code}Data4GIndoor`] ?? row[`${code}4GIndoor`]),
    outdoor4g: level(row[`${code}Data4GOutdoor`] ?? row[`${code}4GOutdoor`]),
    indoor5g: level(row[`${code}Data5GIndoor`] ?? row[`${code}5GIndoor`]),
    outdoor5g: level(row[`${code}Data5GOutdoor`] ?? row[`${code}5GOutdoor`]),
  }));
}

export async function ofcomMobile(postcode: string, uprn?: number): Promise<MobileSummary[]> {
  const pc = postcode.replace(/\s+/g, '').toUpperCase();
  const { data } = await cached('ofcom', `mob:${pc}`, 24 * 30, () =>
    getJson<{ Availability: OfcomMobileRow[] }>('ofcom', `${OFCOM_BASE}/mobile/coverage/${pc}`, {
      headers: { 'Ocp-Apim-Subscription-Key': process.env.OFCOM_API_KEY! },
    }),
  );
  return summariseOfcomMobile(data.Availability ?? [], uprn);
}
