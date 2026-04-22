import type { Profile } from '@prisma/client';
import { SOFT_GATE_DURATION_DAYS } from './pricing';

/**
 * Paywall decision for a profile at a moment in time.
 *
 *   - access           free pass; no paywall shown, full app available
 *   - soft_gate        nagging UI surfaced but user retains full access;
 *                      used during the 30-day window after trial expires
 *                      and for PAST_DUE subscriptions
 *   - hard_gate        paywall blocks protected routes; user is redirected
 *                      to /precios with a CTA to subscribe
 *
 * `reason` is a machine-readable tag for telemetry / UI branching.
 * `daysRemaining` is non-null when the state has a deterministic
 * expiry (trial countdown, soft-gate window) and null otherwise.
 */
export type GateState =
  | { kind: 'access'; reason: GateReason; daysRemaining: number | null }
  | { kind: 'soft_gate'; reason: GateReason; daysRemaining: number | null }
  | { kind: 'hard_gate'; reason: GateReason };

export type GateReason =
  | 'early_supporter'
  | 'active'
  | 'trial_active'
  | 'canceled_in_grace'
  | 'past_due_soft_window'
  | 'trial_expired_soft_window'
  | 'trial_expired_hard'
  | 'expired';

type BillingRelevantProfile = Pick<
  Profile,
  'subscriptionStatus' | 'trialEndsAt' | 'currentPeriodEnd' | 'earlySupporterSince'
>;

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Compute the gate state for a profile. Pure function of the profile's
 * billing fields + the current time — safe to call from server and
 * client alike (though only server code has access to the Profile row).
 *
 * Precedence:
 *   1. EARLY_SUPPORTER flag wins over everything — always access.
 *   2. Hard-enum status EARLY_SUPPORTER also wins (admins may have
 *      set status directly without the timestamp flag).
 *   3. ACTIVE → access with no countdown.
 *   4. TRIAL → access during trial window; after `trialEndsAt`,
 *      falls through into soft-gate window, then hard gate.
 *   5. PAST_DUE → soft gate for `SOFT_GATE_DURATION_DAYS` past
 *      `trialEndsAt` (or `currentPeriodEnd` for post-subscription
 *      failures), then hard gate.
 *   6. CANCELED → access until `currentPeriodEnd`, then EXPIRED.
 *   7. EXPIRED → hard gate.
 */
export function computeGateState(
  profile: BillingRelevantProfile,
  now: Date = new Date(),
): GateState {
  if (profile.earlySupporterSince || profile.subscriptionStatus === 'EARLY_SUPPORTER') {
    return { kind: 'access', reason: 'early_supporter', daysRemaining: null };
  }

  switch (profile.subscriptionStatus) {
    case 'ACTIVE':
      return { kind: 'access', reason: 'active', daysRemaining: null };

    case 'TRIAL': {
      const trialEnd = profile.trialEndsAt;
      if (!trialEnd || now < trialEnd) {
        const days = trialEnd ? Math.max(0, daysBetween(now, trialEnd)) : null;
        return { kind: 'access', reason: 'trial_active', daysRemaining: days };
      }
      // Trial expired — fall into the 30-day soft-gate window.
      const softGateEnd = new Date(trialEnd);
      softGateEnd.setDate(softGateEnd.getDate() + SOFT_GATE_DURATION_DAYS);
      if (now < softGateEnd) {
        return {
          kind: 'soft_gate',
          reason: 'trial_expired_soft_window',
          daysRemaining: Math.max(0, daysBetween(now, softGateEnd)),
        };
      }
      return { kind: 'hard_gate', reason: 'trial_expired_hard' };
    }

    case 'PAST_DUE': {
      /*
       * PAST_DUE after a trial: the reference date is `trialEndsAt` plus
       * the 30-day grace window. PAST_DUE after a paid period: the
       * reference date is `currentPeriodEnd` plus the same window.
       * Prefer whichever is later (some profiles have both set).
       */
      const trialEnd = profile.trialEndsAt;
      const periodEnd = profile.currentPeriodEnd;
      const anchor = maxDate(trialEnd, periodEnd);
      if (!anchor) {
        // No anchor date — treat conservatively as hard gate.
        return { kind: 'hard_gate', reason: 'expired' };
      }
      const softGateEnd = new Date(anchor);
      softGateEnd.setDate(softGateEnd.getDate() + SOFT_GATE_DURATION_DAYS);
      if (now < softGateEnd) {
        return {
          kind: 'soft_gate',
          reason: 'past_due_soft_window',
          daysRemaining: Math.max(0, daysBetween(now, softGateEnd)),
        };
      }
      return { kind: 'hard_gate', reason: 'expired' };
    }

    case 'CANCELED': {
      const periodEnd = profile.currentPeriodEnd;
      if (periodEnd && now < periodEnd) {
        return {
          kind: 'access',
          reason: 'canceled_in_grace',
          daysRemaining: Math.max(0, daysBetween(now, periodEnd)),
        };
      }
      return { kind: 'hard_gate', reason: 'expired' };
    }

    case 'EXPIRED':
      return { kind: 'hard_gate', reason: 'expired' };
  }
  /*
   * EARLY_SUPPORTER is already handled by the short-circuit at the top
   * of the function, so it is never reached in this switch — TypeScript
   * narrows it out of the exhaustive check.
   */
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (a && b) return a > b ? a : b;
  return a ?? b;
}
