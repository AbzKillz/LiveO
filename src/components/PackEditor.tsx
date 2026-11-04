'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Pack, PackItem } from '@/lib/pack';

const PARTS = { A: 'Part A: price, tax and tenure', B: 'Part B: the property', C: 'Part C: risks, rights and restrictions' } as const;
const STATUS_BADGE: Record<PackItem['status'], [string, string]> = {
  auto: ['good', 'From data'], check: ['warn', 'Check'], needs_input: ['bad', 'Needs input'],
};

export function PackEditor({ uprn }: { uprn: string }) {
  const [pack, setPack] = useState<Pack | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pack/${uprn}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? 'Failed to load'); return; }
      setPack(j.pack);
      setStatus(j.status);
      setInputs(j.agentInputs ?? {});
    });
  }, [uprn]);

  async function save(next = status) {
    setSaving(true);
    const r = await fetch(`/api/pack/${uprn}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentInputs: inputs, status: next }) });
    const j = await r.json();
    if (r.ok) { setPack(j.pack); setStatus(next); } else setError(j.error ?? 'Save failed');
    setSaving(false);
  }

  if (error) return <main className="page"><div className="error">{error}</div></main>;
  if (!pack) return <main className="page"><p className="hint">Building report from free data and Propalt…</p></main>;
  const c = pack.completeness;

  return (
    <main className="page">
      <div className="title-row">
        <div>
          <div className="hint"><Link href={`/property/${uprn}`}>← Property</Link></div>
          <h1>Material information</h1>
          <div>{pack.address ?? `UPRN ${pack.uprn}`}</div>
          <div className="hint">Generated {new Date(pack.generatedAt).toLocaleString('en-GB')} · status {status}</div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => window.print()}>Print or PDF</button>
          <button className="btn" disabled={saving} onClick={() => save()}>Save draft</button>
          <button className="btn primary" disabled={saving || c.needsInput > 0} title={c.needsInput ? 'Fill every item first' : ''} onClick={() => save('ready')}>Mark ready</button>
        </div>
      </div>

      <div className="box no-print" style={{ marginBottom: 20 }}>
        <div className="field-head"><span>{c.auto} from data · {c.check} to check · {c.needsInput} need input</span><span>{Math.round(((c.auto + c.check) / c.total) * 100)}% prefilled</span></div>
        <div className="progress">
          <span style={{ width: `${(c.auto / c.total) * 100}%`, background: 'var(--good)' }} />
          <span style={{ width: `${(c.check / c.total) * 100}%`, background: 'var(--warn)' }} />
        </div>
      </div>

      {(Object.keys(PARTS) as (keyof typeof PARTS)[]).map((part) => (
        <section key={part} className="box" style={{ marginBottom: 20 }}>
          <h2>{PARTS[part]}</h2>
          {pack.items.filter((i) => i.part === part).map((i) => {
            const [cls, text] = STATUS_BADGE[i.status];
            return (
              <div key={i.id} className="pack-item">
                <div><strong>{i.label}</strong>{i.note && <div className="src">{i.note}</div>}</div>
                <div>
                  <textarea rows={1} placeholder={i.status === 'needs_input' ? 'Enter from the seller or agent' : ''}
                    value={inputs[i.id] ?? i.value ?? ''} onChange={(e) => setInputs((s) => ({ ...s, [i.id]: e.target.value }))} />
                </div>
                <div><span className={`badge ${cls}`}>{text}</span>{i.source && <div className="src" style={{ marginTop: 4 }}>{i.source}</div>}</div>
              </div>
            );
          })}
        </section>
      ))}
      <p className="hint">Prepared from public data and Propalt. Staff must check every item before the listing goes live; this is not legal advice.</p>
    </main>
  );
}
