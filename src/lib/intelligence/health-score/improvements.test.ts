import { describe, expect, it } from 'vitest';
import { computeHealthScore } from './engine';
import { ALL_FACTOR_KEYS, RULE_FACTOR_KEYS, generateImprovements } from './improvements';
import type { FactorTransaction } from './types';

const NOW = new Date('2026-05-21T00:00:00Z');
const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function tx(
  date: string,
  amount: number,
  type: 'INCOME' | 'EXPENSE' = 'EXPENSE',
  merchantNit: string | null = 'NIT-A',
): FactorTransaction {
  return {
    date: D(date),
    type,
    amount,
    merchantName: 'Walmart',
    merchantNit,
    metadata: {},
  };
}

/**
 * Saturated fixture — 6 months of varied income + expense + 12
 * same-merchant rows over the recurring window. Hits every factor's
 * minimum-data threshold so `partial: false` and the improvements
 * engine has a complete breakdown to score.
 */
function saturatedFixture(): FactorTransaction[] {
  const fixture: FactorTransaction[] = [];
  const months = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
  for (let i = 0; i < months.length; i += 1) {
    const m = months[i] ?? '';
    /*
     * Wildly variable income + spend so most CV-based factors end up
     * below the 90 "good enough" cutoff and the improvement engine
     * has plenty of material.
     */
    fixture.push(tx(`${m}-01`, 1000 + i * 1500, 'INCOME', null));
    fixture.push(tx(`${m}-15`, 800 + i * 1200, 'EXPENSE', null));
  }
  // Mix in same-merchant rows to satisfy recurring + anomaly thresholds.
  const recurringMonths = ['2026-03', '2026-04', '2026-05'];
  for (const m of recurringMonths) {
    for (const d of ['05', '12', '19', '26']) {
      fixture.push(tx(`${m}-${d}`, 100, 'EXPENSE', 'NIT-RECURRING'));
    }
  }
  return fixture;
}

describe('generateImprovements', () => {
  it('every factor in FACTOR_WEIGHTS has a matching rule (no silent gaps)', () => {
    for (const key of ALL_FACTOR_KEYS) {
      expect(RULE_FACTOR_KEYS.has(key), `missing rule for factor: ${key}`).toBe(true);
    }
  });

  it('returns up to 4 actions sorted by estimatedImpact desc', () => {
    const snapshot = computeHealthScore({
      transactions: saturatedFixture(),
      now: NOW,
      previousScore: null,
    });
    const actions = generateImprovements(snapshot);
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < actions.length; i += 1) {
      expect(actions[i]?.estimatedImpact).toBeLessThanOrEqual(
        actions[i - 1]?.estimatedImpact ?? Number.POSITIVE_INFINITY,
      );
    }
  });

  it('skips factors with score ≥ 90 (good enough threshold)', () => {
    /*
     * Build a synthetic snapshot where one factor scores 95 (skip)
     * and another scores 30 (include). Verify only the low-scorer
     * shows up in the suggestions.
     */
    const goodEnough = computeHealthScore({
      transactions: saturatedFixture(),
      now: NOW,
      previousScore: null,
    });
    const tampered = {
      ...goodEnough,
      factors: goodEnough.factors.map((f) =>
        f.key === 'spendingDiscipline'
          ? { ...f, score: 95, partial: false }
          : f.key === 'savingsRate'
            ? { ...f, score: 30, partial: false }
            : f,
      ),
    };
    const actions = generateImprovements(tampered);
    const types = actions.map((a) => a.actionType);
    expect(types).toContain('increase_savings_rate');
    expect(types).not.toContain('stabilize_monthly_spending');
  });

  it('skips factors with partial: true (insufficient data → no honest suggestion)', () => {
    const snapshot = computeHealthScore({
      transactions: [tx('2026-05-15', 1000, 'EXPENSE')],
      now: NOW,
      previousScore: null,
    });
    const actions = generateImprovements(snapshot);
    /*
     * Single-month fixture → every factor partial → no
     * "act on this" suggestions. The fallback path also requires
     * non-partial factors, so the list comes back empty.
     */
    expect(actions).toEqual([]);
  });

  it('estimatedImpact is a positive integer for every suggestion', () => {
    const snapshot = computeHealthScore({
      transactions: saturatedFixture(),
      now: NOW,
      previousScore: null,
    });
    const actions = generateImprovements(snapshot);
    for (const a of actions) {
      expect(Number.isInteger(a.estimatedImpact)).toBe(true);
      expect(a.estimatedImpact).toBeGreaterThanOrEqual(0);
    }
  });

  it('description is non-empty Spanish copy (tú register)', () => {
    const snapshot = computeHealthScore({
      transactions: saturatedFixture(),
      now: NOW,
      previousScore: null,
    });
    const actions = generateImprovements(snapshot);
    for (const a of actions) {
      expect(a.description.length).toBeGreaterThan(0);
      // Tú register cue: rule copy starts with "Tu" / "Tus" /
      // "Apunta" / "Detectamos" / "Solo" / "Mantén" / "Estabilizarlos"
      expect(a.description).toMatch(/^(Tu|Tus|Apunta|Detectamos|Solo|Mant[eé]n|Estabilizarlos)/);
    }
  });
});
