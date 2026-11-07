import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStripeSignature } from '@/lib/stripeWebhook';

/**
 * Stripe webhook: a paid Checkout Session gives the buyer Premium.
 *
 * Needs these environment variables in Vercel (never in the code):
 *   STRIPE_WEBHOOK_SECRET       the endpoint's signing secret (whsec_...)
 *   SUPABASE_SERVICE_ROLE_KEY   Supabase service role key (server only, NOT NEXT_PUBLIC_)
 *   STRIPE_PREMIUM_MONTHS       optional, months of Premium per payment (default 12)
 *
 * The buyer is identified by the `client_reference_id` that the app adds to the payment link.
 * A payment without a valid id is recorded for manual follow-up (see db/stripe_payments.sql).
 * The route answers 2xx for events it deliberately ignores and 5xx when saving fails, so
 * Stripe retries; saving the same payment twice is harmless.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !supabaseUrl || !serviceKey) {
    console.error('stripe-webhook: missing environment variables');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  // The signature covers the exact bytes Stripe sent, so read the raw text, not parsed JSON.
  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const type: string = event?.type ?? '';
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') {
    return NextResponse.json({ received: true, ignored: type });
  }
  const session = event?.data?.object ?? {};
  // Delayed payment methods complete first as "unpaid"; the money arrives with async_payment_succeeded.
  if (session.payment_status !== 'paid') {
    return NextResponse.json({ received: true, ignored: 'not paid yet' });
  }

  const ref = typeof session.client_reference_id === 'string' ? session.client_reference_id : '';
  const months = Number.parseInt(process.env.STRIPE_PREMIUM_MONTHS ?? '12', 10) || 12;

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc('grant_premium_from_payment', {
    p_session_id: String(session.id ?? ''),
    p_user_id: UUID_RE.test(ref) ? ref : null,
    p_months: months,
    p_amount: Number.isInteger(session.amount_total) ? session.amount_total : null,
    p_currency: typeof session.currency === 'string' ? session.currency : null,
    p_email: session.customer_details?.email ?? session.customer_email ?? null,
    p_livemode: event.livemode === true,
  });
  if (error) {
    console.error('stripe-webhook: grant failed', session.id, error.message);
    return NextResponse.json({ error: 'could not save' }, { status: 500 });
  }
  return NextResponse.json({ received: true, result: data });
}
