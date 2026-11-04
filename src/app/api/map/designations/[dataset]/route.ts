import { NextResponse } from 'next/server';
import { DESIGNATIONS, designationGeojson, type DesignationDataset } from '@/lib/sources/planningData';
import { errorResponse, parseBbox } from '../../../_util';

export async function GET(req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  if (!DESIGNATIONS.some((d) => d.dataset === dataset)) return NextResponse.json({ error: 'unknown dataset' }, { status: 404 });
  const bbox = parseBbox(new URL(req.url).searchParams.get('bbox'));
  if (!bbox || bbox[2] - bbox[0] > 0.3) return NextResponse.json({ type: 'FeatureCollection', features: [] });
  // Snap to a grid so nearby viewports share a cache entry.
  const snap = (v: number, up: boolean) => (up ? Math.ceil(v * 50) : Math.floor(v * 50)) / 50;
  const snapped: [number, number, number, number] = [snap(bbox[0], false), snap(bbox[1], false), snap(bbox[2], true), snap(bbox[3], true)];
  try {
    return NextResponse.json(await designationGeojson(dataset as DesignationDataset, snapped));
  } catch (e) {
    return errorResponse(e);
  }
}
