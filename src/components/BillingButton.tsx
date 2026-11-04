'use client';
export function BillingButton() {
  return (
    <button className="btn primary" onClick={async () => {
      const r = await fetch('/api/stripe/checkout', { method: 'POST' });
      const j = await r.json();
      if (j.url) window.location.href = j.url;
    }}>Start subscription</button>
  );
}
