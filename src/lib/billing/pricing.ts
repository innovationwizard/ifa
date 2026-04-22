/**
 * Pricing constants for the IFA paywall.
 *
 * Per locked product decision:
 *   - INDIVIDUAL profiles:  USD $1 / month
 *   - BUSINESS profiles:    USD $20 / month
 *   - Every new profile:    30-day free trial (no card required)
 *   - Trial expiration:     30-day soft gate (nagging UI, full access),
 *                           then hard gate (blocks protected routes)
 *   - EARLY_SUPPORTER:      locked at USD $1 / month forever regardless
 *                           of future price changes, applies to both
 *                           INDIVIDUAL and BUSINESS tiers
 *
 * Legal: "Prices subject to change without prior notice at any time."
 * This clause is surfaced in /terminos, /precios, and the checkout UI.
 */

import type { ProfileType } from '@prisma/client';

export const TRIAL_DURATION_DAYS = 30;
export const SOFT_GATE_DURATION_DAYS = 30;

export const PRICE_INDIVIDUAL_USD = 1;
export const PRICE_BUSINESS_USD = 20;
export const PRICE_EARLY_SUPPORTER_USD = 1;

export interface PlanDescriptor {
  profileType: ProfileType;
  priceUsd: number;
  /** Translation key under `billing.plans.*` for the plan name. */
  nameKey: string;
  /** Translation key under `billing.plans.*` for the short tagline. */
  taglineKey: string;
}

export const PLAN_INDIVIDUAL: PlanDescriptor = {
  profileType: 'INDIVIDUAL',
  priceUsd: PRICE_INDIVIDUAL_USD,
  nameKey: 'individual.name',
  taglineKey: 'individual.tagline',
};

export const PLAN_BUSINESS: PlanDescriptor = {
  profileType: 'BUSINESS',
  priceUsd: PRICE_BUSINESS_USD,
  nameKey: 'business.name',
  taglineKey: 'business.tagline',
};

export const PLANS = [PLAN_INDIVIDUAL, PLAN_BUSINESS] as const;

/**
 * Returns the monthly USD price a given profile would pay, honoring the
 * early-supporter lock. `earlySupporterSince` is a nullable timestamp on
 * Profile — when present, the VIP price applies regardless of type.
 */
export function priceForProfile(args: {
  type: ProfileType;
  earlySupporterSince: Date | null;
}): number {
  if (args.earlySupporterSince) return PRICE_EARLY_SUPPORTER_USD;
  return args.type === 'BUSINESS' ? PRICE_BUSINESS_USD : PRICE_INDIVIDUAL_USD;
}
