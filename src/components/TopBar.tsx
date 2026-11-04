'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type Result = { kind: 'district' | 'postcode' | 'address'; label: string; uprn?: string; outcode?: string; lat?: number; lng?: number };

export function TopBar() {
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (r.ok) setResults((await r.json()).results);
    }, 250);
  }, [q]);

  function pick(r: Result) {
    setOpen(false);
    setQ('');
    if (r.kind === 'address' && r.uprn) {
      router.push(r.uprn.startsWith('pa') ? `/api/property/resolve?propalt_id=${r.uprn.slice(2)}` : `/property/${r.uprn}`);
    } else if (r.outcode) {
      window.dispatchEvent(new CustomEvent('liveo:add-district', { detail: r }));
      if (path !== '/') router.push(`/?d=${r.outcode}`);
    }
  }

  const nav = [['/', 'Find listings'], ['/explore', 'Map'], ['/usage', 'Usage'], ['/billing', 'Billing']];
  return (
    <header className="topbar">
      <Link href="/" className="brand"><span className="brand-dot" />LiveO</Link>
      <nav className="nav">
        {nav.map(([href, label]) => <Link key={href} href={href} className={path === href ? 'active' : ''}>{label}</Link>)}
      </nav>
      <div className="spacer" />
      <div className="searchbox">
        <input value={q} placeholder="Address, postcode or district" onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {open && results.length > 0 && (
          <div className="menu">
            {results.map((r, i) => (
              <button key={i} onMouseDown={() => pick(r)}><span className="kind">{r.kind}</span>{r.label}</button>
            ))}
          </div>
        )}
      </div>
      <form method="post" action="/api/auth/logout"><button className="btn" type="submit">Sign out</button></form>
    </header>
  );
}
