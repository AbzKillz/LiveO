import { getJson } from '../http';
import { cached } from '../cache';

/** postcodes.io: free, no key, ONS based. Used for council and LSOA when ONSPD is not loaded. */
export interface PostcodeInfo {
  postcode: string; latitude: number; longitude: number; admin_district: string; outcode: string;
  codes: { admin_district: string; lsoa: string };
}

export async function lookupPostcode(postcode: string): Promise<PostcodeInfo | null> {
  const pc = postcode.replace(/\s+/g, '').toUpperCase();
  try {
    const { data } = await cached('postcodes-io', pc, 24 * 30, () =>
      getJson<{ result: PostcodeInfo }>('postcodes-io', `https://api.postcodes.io/postcodes/${pc}`),
    );
    return data.result;
  } catch {
    return null;
  }
}
