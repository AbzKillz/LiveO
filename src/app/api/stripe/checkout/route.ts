import { NextResponse } from 'next/server';
import Stripe from 'stripe';

/**
 * Billing stub. Without STRIPE_SECRET_KEY it returns a fake session so the UI flow works.
 * With a key and STRIPE_PRICE_ID it creates a real subscription checkout.
 */
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return NextResponse.json({ stub: true, url: `${origin}/billing?stub=success` });
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${origin}/billing?status=success`,
    cancel_url: `${origin}/billing?status=cancelled`,
  });
  return NextResponse.json({ stub: false, url: session.url });
}
