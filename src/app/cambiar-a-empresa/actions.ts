'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/server';
import { ensureUserAndProfile } from '@/lib/auth/ensure-user-profile';
import { profileRepo } from '@/lib/db/repositories';
import { getStripeClient } from '@/lib/billing/stripe';
import { getStripeEnv } from '@/lib/env';
import { normalizeUpgrade, upgradeSchema, type UpgradeInput } from './schema';

export type UpgradeActionResult =
  | { ok: true }
  | {
      ok: false;
      error: 'unauthenticated' | 'validation' | 'already_business' | 'stripe' | 'server';
    };

/**
 * Flip a Profile from INDIVIDUAL to BUSINESS.
 *
 * Three branches depending on the profile's billing state:
 *
 *   1. TRIAL / no stripeSubscriptionId — just flip Profile.type +
 *      displayName + nit. When the user eventually checks out, the
 *      checkout route picks the business price id because
 *      Profile.type is now BUSINESS.
 *
 *   2. Active Stripe subscription on the personal plan — swap the
 *      subscription's price item to the business price id, with
 *      proration. Only THEN update the Profile; if the Stripe call
 *      fails we leave the Profile alone so state stays consistent.
 *
 *   3. EARLY_SUPPORTER — still flip Profile.type, but do NOT touch
 *      the Stripe subscription. Early supporters are locked at
 *      USD $1/mo forever regardless of tier (locked product rule;
 *      see `priceForProfile` in src/lib/billing/pricing.ts).
 *
 * Non-blocking mode: if Stripe is not configured, branch (1) applies
 * to every user regardless of fields. The app keeps working in
 * trial-only mode until Stripe is wired up.
 */
export async function upgradeToBusinessAction(input: UpgradeInput): Promise<UpgradeActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'unauthenticated' };

  const parsed = upgradeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const normalized = normalizeUpgrade(parsed.data);

  try {
    const { profile } = await ensureUserAndProfile(user);
    if (profile.type === 'BUSINESS') {
      return { ok: false, error: 'already_business' };
    }

    const stripe = getStripeClient();
    const env = getStripeEnv();
    const shouldTouchStripe =
      stripe !== null &&
      env?.priceBusinessId !== undefined &&
      env?.priceBusinessId !== null &&
      profile.stripeSubscriptionId !== null &&
      !profile.earlySupporterSince;

    if (shouldTouchStripe && stripe && env?.priceBusinessId && profile.stripeSubscriptionId) {
      /*
       * Swap the subscription's price item to the business price.
       * Proration creates an immediate credit/charge for the unused
       * portion of the personal plan + the new business plan — Stripe's
       * standard behavior for mid-cycle upgrades.
       */
      const subscription = await stripe.subscriptions.retrieve(profile.stripeSubscriptionId);
      const firstItem = subscription.items.data[0];
      if (!firstItem) {
        console.error('[cambiar-a-empresa] Stripe subscription has no items', {
          subscriptionId: profile.stripeSubscriptionId,
        });
        return { ok: false, error: 'stripe' };
      }
      await stripe.subscriptions.update(profile.stripeSubscriptionId, {
        items: [{ id: firstItem.id, price: env.priceBusinessId }],
        proration_behavior: 'create_prorations',
      });
    }

    await profileRepo.update({
      where: { id: profile.id },
      data: {
        type: 'BUSINESS',
        displayName: normalized.displayName,
        nit: normalized.nit,
      },
    });
  } catch (error) {
    console.error('[cambiar-a-empresa] upgrade failed', error);
    return { ok: false, error: 'server' };
  }

  redirect('/dashboard?upgraded=business');
}
