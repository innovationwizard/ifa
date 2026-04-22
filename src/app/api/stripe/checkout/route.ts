import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { getStripeClient } from '@/lib/billing/stripe';
import { getStripeEnv, publicEnv } from '@/lib/env';

/*
 * POST /api/stripe/checkout — create a Stripe Checkout Session.
 *
 * Body: `{ plan: 'individual' | 'business' }`
 *
 * Non-blocking mode: when `STRIPE_SECRET_KEY` is unset (or the price ids
 * for the requested plan are missing), the route returns 503 with a
 * `billing_not_configured` marker so the UI can degrade gracefully
 * during the pre-Stripe development window.
 *
 * Trial policy: the 30-day free trial is granted at Profile creation
 * (not by Stripe), so this session does NOT add another trial. Users
 * who subscribe mid-trial simply end their free access early and
 * transition immediately to ACTIVE.
 */

const bodySchema = z.object({
  plan: z.enum(['individual', 'business']),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const { plan } = parsed.data;

  const stripe = getStripeClient();
  const env = getStripeEnv();
  if (!stripe || !env) {
    return NextResponse.json(
      {
        error: 'billing_not_configured',
        message: 'Todavía no tenemos los pagos activados. Sigue usando la app — te avisaremos.',
      },
      { status: 503 },
    );
  }

  const priceId = plan === 'business' ? env.priceBusinessId : env.priceIndividualId;
  if (!priceId) {
    return NextResponse.json(
      {
        error: 'price_not_configured',
        message: `Missing STRIPE_PRICE_${plan === 'business' ? 'BUSINESS' : 'INDIVIDUAL'}_ID.`,
      },
      { status: 500 },
    );
  }

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 400 });
  }

  // Reuse an existing Stripe Customer or create one tied to the Profile.
  let customerId = profile.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      ...(user.email ? { email: user.email } : {}),
      metadata: {
        profileId: profile.id,
        userId: user.id,
      },
    });
    customerId = customer.id;
    await profileRepo.update({
      where: { id: profile.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const successUrl = new URL('/dashboard?checkout=success', publicEnv.siteUrl).toString();
  const cancelUrl = new URL('/precios?checkout=canceled', publicEnv.siteUrl).toString();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    /*
     * Pass the Profile id through client_reference_id so the webhook
     * can associate Stripe events with the correct tenant without a
     * round-trip to fetch customer metadata.
     */
    client_reference_id: profile.id,
    subscription_data: {
      metadata: {
        profileId: profile.id,
        userId: user.id,
        planKey: plan,
      },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json({ error: 'session_url_missing' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
