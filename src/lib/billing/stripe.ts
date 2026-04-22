import 'server-only';
import Stripe from 'stripe';
import { getStripeEnv } from '@/lib/env';

/**
 * Lazy Stripe client accessor.
 *
 * Returns `null` when `STRIPE_SECRET_KEY` is unset, which is the
 * expected state during early development before the Stripe account
 * is wired up. API routes (/checkout, /portal, /webhook) check for
 * null and short-circuit with a user-facing "billing-not-configured"
 * response rather than crashing — the app runs in a trial-only mode
 * until the keys land.
 *
 * The client is cached module-level so repeated calls reuse the same
 * instance. Stripe's SDK is stateless and safe to share.
 */
let cachedClient: Stripe | null | undefined;

export function getStripeClient(): Stripe | null {
  if (cachedClient !== undefined) return cachedClient;
  const env = getStripeEnv();
  if (!env) {
    cachedClient = null;
    return null;
  }
  cachedClient = new Stripe(env.secretKey, {
    /*
     * apiVersion is intentionally omitted so the SDK pins to the
     * account's default version set in the Stripe dashboard. This is
     * the pattern Stripe recommends for server applications.
     */
    typescript: true,
    appInfo: {
      name: 'IFA (Inteligencia Financiera App)',
      version: '0.1.0',
    },
  });
  return cachedClient;
}

/**
 * True when Stripe is configured and billing features are operational.
 * False during the initial Stripe-less development window.
 */
export function isStripeConfigured(): boolean {
  return getStripeClient() !== null;
}
