import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ received: true, stub: true });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers.get('stripe-signature') ?? '';
  try {
    const event = stripe.webhooks.constructEvent(await req.text(), sig, process.env.STRIPE_WEBHOOK_SECRET);
    // TODO: update account.plan and account.status on customer.subscription.* events.
    console.log('stripe event', event.type);
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }
}
