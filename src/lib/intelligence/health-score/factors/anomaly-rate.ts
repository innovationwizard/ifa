import { hasActiveAnomalyFlag } from '@/lib/transactions/anomaly-detection';
import { clamp, isInRange, lastNMonthsWindow } from '../helpers';
import type { FactorInput, FactorResult } from '../types';

/**
 * Anomaly Rate — Phase 7 factor 6 of 6 (weight 10%).
 *
 * Question answered: "What fraction of recent expenses got flagged
 * as anomalous?"
 *
 * Formula: `100 − min(100, anomaly_count / total_count × 1000)`
 * over the last 3 months of EXPENSE rows. The ×1000 multiplier (vs.
 * ×100 for the savings rate) is intentional: a 10% anomaly rate
 * pushes the factor score to 0. That's by design — getting 1 in 10
 * expense rows flagged as either "new merchant" or "z-score outlier"
 * is a strong signal that something's off (or that the user is in
 * a chaotic period of life).
 *
 * Uses Batch 8's `hasActiveAnomalyFlag` so the count consistently
 * excludes user-dismissed flags. If a user dismisses every flag,
 * this factor stays at 100 — appropriate, the user has affirmed
 * the spending pattern is normal for them.
 *
 * `partial` when fewer than 10 EXPENSE rows in the window. Same
 * threshold as Recurring Spending (Factor 5) for consistency.
 *
 * `inputs` keys: anomalyCount, totalExpenses, rate.
 */
const WINDOW_MONTHS = 3;
const MIN_TXNS_FOR_FULL = 10;
const RATE_MULTIPLIER = 1000;

export function anomalyRate(input: FactorInput): FactorResult {
  const range = lastNMonthsWindow(input.now, WINDOW_MONTHS);

  const expensesInWindow = input.transactions.filter(
    (t) => t.type === 'EXPENSE' && isInRange(t.date, range.from, range.to),
  );

  const anomalyCount = expensesInWindow.filter((t) => hasActiveAnomalyFlag(t.metadata)).length;
  const totalExpenses = expensesInWindow.length;
  const rate = totalExpenses > 0 ? anomalyCount / totalExpenses : 0;
  const score = clamp(100 - Math.min(100, rate * RATE_MULTIPLIER), 0, 100);
  const partial = totalExpenses < MIN_TXNS_FOR_FULL;

  return {
    score,
    partial,
    inputs: { anomalyCount, totalExpenses, rate },
  };
}
