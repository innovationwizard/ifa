import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { getStripeClient } from '@/lib/billing/stripe';
import { publicEnv } from '@/lib/env';

/*
 * POST /api/stripe/portal — open the Stripe Customer Portal.
 *
 * Creates a billing-portal session for the authenticated user's Profile
 * and returns the session URL. The client navigates the browser to it;
 * Stripe handles card updates, plan changes, and cancellation, then
 * bounces the user back to `/configuracion/facturacion`.
 *
 * 503 when Stripe is not configured (non-blocking dev mode).
 * 400 when the profile has no `stripeCustomerId` — this happens for
 * trial-only profiles that have never gone through checkout.
 */
export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json(
      {
        error: 'billing_not_configured',
        message: 'Todavía no tenemos los pagos activados. Sigue usando la app — te avisaremos.',
      },
      { status: 503 },
    );
  }

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) {
    return NextResponse.json({ error: 'no_profile' }, { status: 400 });
  }
  if (!profile.stripeCustomerId) {
    return NextResponse.json({ error: 'no_customer' }, { status: 400 });
  }

  const returnUrl = new URL('/configuracion/facturacion', publicEnv.siteUrl).toString();
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: returnUrl,
  });

  return NextResponse.json({ url: session.url });
}
