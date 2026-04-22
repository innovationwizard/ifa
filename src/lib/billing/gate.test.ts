import { describe, expect, it } from 'vitest';
import type { Profile } from '@prisma/client';
import { computeGateState } from './gate';

type BillingFields = Pick<
  Profile,
  'subscriptionStatus' | 'trialEndsAt' | 'currentPeriodEnd' | 'earlySupporterSince'
>;

function profile(overrides: Partial<BillingFields> = {}): BillingFields {
  return {
    subscriptionStatus: 'TRIAL',
    trialEndsAt: null,
    currentPeriodEnd: null,
    earlySupporterSince: null,
    ...overrides,
  };
}

const NOW = new Date('2026-04-21T12:00:00Z');

function daysFromNow(days: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d;
}

describe('computeGateState', () => {
  describe('early supporter', () => {
    it('grants access when earlySupporterSince is set (overrides TRIAL/PAST_DUE/EXPIRED)', () => {
      const states = ['TRIAL', 'PAST_DUE', 'EXPIRED', 'CANCELED'] as const;
      for (const status of states) {
        const result = computeGateState(
          profile({ subscriptionStatus: status, earlySupporterSince: new Date('2026-01-01') }),
          NOW,
        );
        expect(result).toEqual({ kind: 'access', reason: 'early_supporter', daysRemaining: null });
      }
    });

    it('grants access when status is EARLY_SUPPORTER even without a timestamp', () => {
      const result = computeGateState(profile({ subscriptionStatus: 'EARLY_SUPPORTER' }), NOW);
      expect(result).toEqual({ kind: 'access', reason: 'early_supporter', daysRemaining: null });
    });
  });

  describe('ACTIVE', () => {
    it('grants access with no countdown', () => {
      const result = computeGateState(
        profile({ subscriptionStatus: 'ACTIVE', currentPeriodEnd: daysFromNow(15) }),
        NOW,
      );
      expect(result).toEqual({ kind: 'access', reason: 'active', daysRemaining: null });
    });
  });

  describe('TRIAL', () => {
    it('grants access during the trial window with a days-remaining countdown', () => {
      const result = computeGateState(
        profile({ subscriptionStatus: 'TRIAL', trialEndsAt: daysFromNow(20) }),
        NOW,
      );
      expect(result.kind).toBe('access');
      expect(result.reason).toBe('trial_active');
      if (result.kind === 'access') {
        expect(result.daysRemaining).toBe(20);
      }
    });

    it('soft-gates after trial expiry, within the 30-day grace window', () => {
      const result = computeGateState(
        profile({ subscriptionStatus: 'TRIAL', trialEndsAt: daysFromNow(-5) }),
        NOW,
      );
      expect(result.kind).toBe('soft_gate');
      expect(result.reason).toBe('trial_expired_soft_window');
      if (result.kind === 'soft_gate') {
        expect(result.daysRemaining).toBe(25);
      }
    });

    it('hard-gates once the 30-day soft window after trial expiry elapses', () => {
      const result = computeGateState(
        profile({ subscriptionStatus: 'TRIAL', trialEndsAt: daysFromNow(-31) }),
        NOW,
      );
      expect(result).toEqual({ kind: 'hard_gate', reason: 'trial_expired_hard' });
    });

    it('grants access with null daysRemaining when trialEndsAt is missing', () => {
      const result = computeGateState(
        profile({ subscriptionStatus: 'TRIAL', trialEndsAt: null }),
        NOW,
      );
      expect(result).toEqual({ kind: 'access', reason: 'trial_active', daysRemaining: null });
    });
  });

  describe('PAST_DUE', () => {
    it('soft-gates within 30 days of the trial/period anchor', () => {
      const result = computeGateState(
        profile({ subscriptionStatus: 'PAST_DUE', currentPeriodEnd: daysFromNow(-10) }),
        NOW,
      );
      expect(result.kind).toBe('soft_gate');
      expect(result.reason).toBe('past_due_soft_window');
      if (result.kind === 'soft_gate') {
        expect(result.daysRemaining).toBe(20);
      }
    });

    it('hard-gates after the 30-day window past the anchor', () => {
      const result = computeGateState(
        profile({ subscriptionStatus: 'PAST_DUE', currentPeriodEnd: daysFromNow(-40) }),
        NOW,
      );
      expect(result).toEqual({ kind: 'hard_gate', reason: 'expired' });
    });

    it('falls back to hard gate when no anchor date is set', () => {
      const result = computeGateState(profile({ subscriptionStatus: 'PAST_DUE' }), NOW);
      expect(result).toEqual({ kind: 'hard_gate', reason: 'expired' });
    });

    it('uses the LATER of trialEndsAt / currentPeriodEnd as the anchor', () => {
      const result = computeGateState(
        profile({
          subscriptionStatus: 'PAST_DUE',
          trialEndsAt: daysFromNow(-60),
          currentPeriodEnd: daysFromNow(-10),
        }),
        NOW,
      );
      expect(result.kind).toBe('soft_gate');
    });
  });

  describe('CANCELED', () => {
    it('grants access until currentPeriodEnd', () => {
      const result = computeGateState(
        profile({ subscriptionStatus: 'CANCELED', currentPeriodEnd: daysFromNow(5) }),
        NOW,
      );
      expect(result.kind).toBe('access');
      expect(result.reason).toBe('canceled_in_grace');
      if (result.kind === 'access') {
        expect(result.daysRemaining).toBe(5);
      }
    });

    it('hard-gates after currentPeriodEnd', () => {
      const result = computeGateState(
        profile({ subscriptionStatus: 'CANCELED', currentPeriodEnd: daysFromNow(-1) }),
        NOW,
      );
      expect(result).toEqual({ kind: 'hard_gate', reason: 'expired' });
    });

    it('hard-gates when currentPeriodEnd is missing', () => {
      const result = computeGateState(profile({ subscriptionStatus: 'CANCELED' }), NOW);
      expect(result).toEqual({ kind: 'hard_gate', reason: 'expired' });
    });
  });

  describe('EXPIRED', () => {
    it('hard-gates unconditionally', () => {
      const result = computeGateState(profile({ subscriptionStatus: 'EXPIRED' }), NOW);
      expect(result).toEqual({ kind: 'hard_gate', reason: 'expired' });
    });
  });
});
