import { BillingButton } from '@/components/BillingButton';

export default async function Billing({ searchParams }: { searchParams: Promise<{ stub?: string; status?: string }> }) {
  const sp = await searchParams;
  return (
    <main className="page" style={{ maxWidth: 640 }}>
      <h1>Billing</h1>
      <div className="box">
        <p>LiveO is internal, so reports are free to staff. This page is a placeholder for charging clients or branches later.</p>
        {(sp.stub || sp.status === 'success') && <p className="badge good">Checkout completed{sp.stub ? ' (stub mode, no Stripe keys set)' : ''}.</p>}
        <BillingButton />
      </div>
    </main>
  );
}
