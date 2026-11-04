/**
 * Streaming parser for HM Land Registry INSPIRE Index Polygon GML. Yields [inspireId, WKT]
 * in the file's own coordinates (British National Grid). Holds one parcel in memory at a time.
 */
export async function* parseInspireGml(chunks: AsyncIterable<string | Buffer>): AsyncGenerator<[string, string]> {
  let buf = '';
  const CLOSE = '</LR:PREDEFINED>';
  for await (const chunk of chunks) {
    buf += chunk.toString();
    let end: number;
    while ((end = buf.indexOf(CLOSE)) !== -1) {
      const block = buf.slice(0, end);
      buf = buf.slice(end + CLOSE.length);
      const parsed = parseParcel(block);
      if (parsed) yield parsed;
    }
  }
}

export function parseParcel(block: string): [string, string] | null {
  const id = /<LR:INSPIREID>(\d+)<\/LR:INSPIREID>/.exec(block)?.[1];
  if (!id) return null;
  const polys = [...block.matchAll(/<gml:Polygon[\s\S]*?<\/gml:Polygon>/g)].map((m) => {
    const rings = [...m[0].matchAll(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/g)].map((r) => {
      const n = r[1].trim().split(/\s+/);
      const pts: string[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push(`${n[i]} ${n[i + 1]}`);
      return `(${pts.join(',')})`;
    });
    return `(${rings.join(',')})`;
  });
  return polys.length ? [id, `MULTIPOLYGON(${polys.join(',')})`] : null;
}
