import { describe, expect, it } from 'vitest';
import {
  HEALTH_SCORE_WINDOW_MONTHS,
  computeHealthScore,
  healthScoreWindow,
  snapshotToFactorsJson,
} from './engine';
import type { FactorTransaction } from './types';
import { FACTOR_WEIGHTS } from './factors';

const NOW = new Date('2026-05-21T00:00:00Z');
const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function tx(
  date: string,
  amount: number,
  type: 'INCOME' | 'EXPENSE' = 'EXPENSE',
  merchantNit: string | null = '2345678-9',
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

describe('computeHealthScore', () => {
  it('returns score=0 + partial:true on empty input', () => {
    const result = computeHealthScore({ transactions: [], now: NOW, previousScore: null });
    /*
     * With no data: every CV-based factor returns 100 (zero
     * variability over zero data), savings-rate returns 0 (no
     * income baseline), recurring + anomaly return 0 / 100
     * respectively. All flagged partial. Weighted sum =
     * 100*20 + 100*20 + 0*20 + 100*15 + 0*15 + 100*10
     * = 2000 + 2000 + 0 + 1500 + 0 + 1000 = 6500 → score 650.
     */
    expect(result.score).toBe(650);
    expect(result.partial).toBe(true);
    expect(result.partialFactorCount).toBe(6);
    expect(result.previousScore).toBeNull();
  });

  it('returns a deterministic score for a fixed transactions + clock', () => {
    const fixture: FactorTransaction[] = [
      tx('2025-12-01', 5000, 'INCOME'),
      tx('2026-01-01', 5000, 'INCOME'),
      tx('2026-02-01', 5000, 'INCOME'),
      tx('2026-03-01', 5000, 'INCOME'),
      tx('2026-04-01', 5000, 'INCOME'),
      tx('2026-05-01', 5000, 'INCOME'),
      tx('2025-12-15', 3500),
      tx('2026-01-15', 3500),
      tx('2026-02-15', 3500),
      tx('2026-03-15', 3500),
      tx('2026-04-15', 3500),
      tx('2026-05-15', 3500),
    ];
    const a = computeHealthScore({ transactions: fixture, now: NOW, previousScore: null });
    const b = computeHealthScore({ transactions: fixture, now: NOW, previousScore: null });
    expect(a).toEqual(b);
  });

  it('score is in [0, 1000]', () => {
    const result = computeHealthScore({
      transactions: [tx('2025-12-01', 999999, 'INCOME'), tx('2026-05-15', 0.01, 'EXPENSE')],
      now: NOW,
      previousScore: null,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1000);
  });

  it('emits one breakdown row per factor, in FACTOR_WEIGHTS order', () => {
    const result = computeHealthScore({
      transactions: [],
      now: NOW,
      previousScore: null,
    });
    expect(result.factors).toHaveLength(6);
    expect(result.factors.map((f) => f.key)).toEqual(Object.keys(FACTOR_WEIGHTS));
    for (const factor of result.factors) {
      expect(factor.weight).toBe(FACTOR_WEIGHTS[factor.key]);
      expect(factor.score).toBeGreaterThanOrEqual(0);
      expect(factor.score).toBeLessThanOrEqual(100);
    }
  });

  it('carries previousScore through unchanged (engine never overwrites it)', () => {
    const result = computeHealthScore({
      transactions: [],
      now: NOW,
      previousScore: 723,
    });
    expect(result.previousScore).toBe(723);
  });

  it('partial is true when any single factor is partial', () => {
    /*
     * One-month fixture: most factors will be partial (need ≥3
     * months) — partialFactorCount > 0 → partial = true.
     */
    const result = computeHealthScore({
      transactions: [tx('2026-05-15', 1000, 'EXPENSE')],
      now: NOW,
      previousScore: null,
    });
    expect(result.partial).toBe(true);
    expect(result.partialFactorCount).toBeGreaterThan(0);
  });

  it('partial is false when every factor has enough data', () => {
    /*
     * 6 months income + 6 months expense + 12 same-merchant rows
     * over last 3 months → all factor thresholds met.
     */
    const months6 = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
    const recurringMonths = ['2026-03', '2026-04', '2026-05'];
    const fixture: FactorTransaction[] = [];
    for (const m of months6) {
      fixture.push(tx(`${m}-01`, 5000, 'INCOME', null));
      fixture.push(tx(`${m}-15`, 3500, 'EXPENSE', null));
    }
    // 12 same-merchant expense rows over last 3 months (4 per month) to
    // satisfy the 10-row threshold for recurring + anomaly factors.
    for (const m of recurringMonths) {
      for (const d of ['05', '12', '19', '26']) {
        fixture.push(tx(`${m}-${d}`, 200, 'EXPENSE', 'NIT-RECURRING'));
      }
    }

    const result = computeHealthScore({
      transactions: fixture,
      now: NOW,
      previousScore: null,
    });
    expect(result.partial).toBe(false);
    expect(result.partialFactorCount).toBe(0);
  });

  it('stamps computedAt with the `now` argument verbatim', () => {
    const result = computeHealthScore({ transactions: [], now: NOW, previousScore: null });
    expect(result.computedAt).toBe(NOW);
  });
});

describe('snapshotToFactorsJson', () => {
  it('emits a JSON-compatible breakdown with partialFactorCount + per-factor entries', () => {
    const snapshot = computeHealthScore({ transactions: [], now: NOW, previousScore: null });
    const json = snapshotToFactorsJson(snapshot) as {
      partialFactorCount: number;
      breakdown: { key: string; weight: number; score: number; partial: boolean }[];
    };
    expect(json.partialFactorCount).toBe(6);
    expect(json.breakdown).toHaveLength(6);
    expect(json.breakdown[0]?.key).toBe('spendingDiscipline');
  });
});

describe('healthScoreWindow', () => {
  it('returns the last 6 months ending today', () => {
    const { from, to } = healthScoreWindow(NOW);
    expect(from.toISOString().slice(0, 10)).toBe('2025-12-01');
    expect(to.toISOString().slice(0, 10)).toBe('2026-05-21');
  });

  it('uses HEALTH_SCORE_WINDOW_MONTHS = 6', () => {
    expect(HEALTH_SCORE_WINDOW_MONTHS).toBe(6);
  });
});
