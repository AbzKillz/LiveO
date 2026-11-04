'use client';

/**
 * Two thumb slider over a list of stops. The first stop on the low thumb and the last stop on
 * the high thumb mean "no limit", so a slider left at its ends sends nothing to the API.
 */
export function RangeSlider({
  label, stops, value, onChange, format,
}: {
  label: string;
  stops: number[];
  value: [number | null, number | null];
  onChange: (v: [number | null, number | null]) => void;
  format: (n: number) => string;
}) {
  const last = stops.length - 1;
  const idx = (v: number | null, fallback: number) => {
    if (v == null) return fallback;
    let best = 0;
    for (let i = 0; i < stops.length; i++) if (Math.abs(stops[i] - v) < Math.abs(stops[best] - v)) best = i;
    return best;
  };
  const lo = idx(value[0], 0);
  const hi = idx(value[1], last);
  const set = (a: number, b: number) => onChange([a <= 0 ? null : stops[a], b >= last ? null : stops[b]]);
  const text =
    lo === 0 && hi === last ? 'Any' : lo === 0 ? `Up to ${format(stops[hi])}` : hi === last ? `${format(stops[lo])}+` : `${format(stops[lo])} to ${format(stops[hi])}`;
  return (
    <div className="field">
      <div className="field-head"><span>{label}</span><span>{text}</span></div>
      <div className="range">
        <div className="track" />
        <div className="fill" style={{ left: `${(lo / last) * 100}%`, right: `${100 - (hi / last) * 100}%` }} />
        <input type="range" aria-label={`${label} minimum`} min={0} max={last} value={lo} onChange={(e) => set(Math.min(Number(e.target.value), hi), hi)} />
        <input type="range" aria-label={`${label} maximum`} min={0} max={last} value={hi} onChange={(e) => set(lo, Math.max(Number(e.target.value), lo))} />
      </div>
    </div>
  );
}

/** Letter scale slider for EPC and council tax bands. */
export function LetterRange({
  label, letters, value, onChange,
}: {
  label: string;
  letters: string;
  value: [string | null, string | null];
  onChange: (v: [string | null, string | null]) => void;
}) {
  const stops = letters.split('').map((_, i) => i);
  const toNum = (l: string | null) => (l ? letters.indexOf(l) : null);
  return (
    <RangeSlider
      label={label}
      stops={stops}
      value={[toNum(value[0]), toNum(value[1])]}
      onChange={([a, b]) => onChange([a == null ? null : letters[a], b == null ? null : letters[b]])}
      format={(n) => letters[n]}
    />
  );
}
