/**
 * Per-merchant anomaly detection (Phase 6/7 Batch 8).
 *
 * Pure function. Given a candidate transaction's amount + its
 * merchant's prior amounts (this profile only, this merchant only),
 * decides whether the candidate is anomalous and how.
 *
 * Two methods, in priority order:
 *
 *   1. `new_merchant` — when history is sparse (≤1 prior sighting).
 *      Useful: flags first-time merchants so the user notices new
 *      recurring expenses (subscriptions, surprise charges). Returns
 *      `zScore: 0` because no statistical comparison was possible.
 *
 *   2. `merchant_zscore` — when history is meaningful (≥10 prior
 *      sightings). Computes (current − mean) / stdDev; flags when
 *      |zScore| > 3 (strict — exactly 3σ is NOT flagged). The
 *      returned `zScore` is signed so the UI can distinguish
 *      "much larger than usual" from "much smaller than usual"
 *      (refund-shaped).
 *
 * Returns `null` for the in-between range (2–9 history) and for
 * 10+ history that's within 3σ. The job-handler caller writes the
 * result to `Transaction.metadata.anomaly` only when non-null —
 * keeping the metadata clean for the common case.
 *
 * Reference for choices:
 *   - 3σ threshold is the standard outlier-detection cutoff (Empirical
 *     Rule: ~99.7% of values fall within ±3σ for a normal-ish
 *     distribution; flagging the remaining ~0.3% is reasonable for a
 *     consumer-finance flag-don't-block UX).
 *   - 10-history minimum: with fewer points the sample mean/stdDev
 *     are too noisy to reliably classify the next observation. The
 *     threshold is conservative; tighter detection (e.g., MAD-based)
 *     belongs to a later iteration once we have telemetry on
 *     false-positive rates.
 */

/** Minimum prior sightings before we'll compute a z-score. */
export const MIN_HISTORY_FOR_ZSCORE = 10;
/** Max history above which we treat the merchant as "new". */
export const MAX_HISTORY_FOR_NEW_MERCHANT = 1;
/** Z-score magnitude that triggers a flag. Strict inequality. */
export const ZSCORE_THRESHOLD = 3;

export type AnomalyMethod = 'new_merchant' | 'merchant_zscore';

export interface AnomalyResult {
  method: AnomalyMethod;
  /** Signed standard deviations from mean for `merchant_zscore`; 0 for `new_merchant`. */
  zScore: number;
}

export interface DetectAnomalyInput {
  /** Amount of the transaction being evaluated. */
  amount: number;
  /**
   * Amounts of prior transactions for the SAME merchant on the SAME
   * profile, excluding the candidate itself. Order doesn't matter —
   * function is symmetric in `merchantHistory`.
   */
  merchantHistory: number[];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((s, v) => s + v, 0);
  return sum / values.length;
}

function populationStdDev(values: number[], avg: number): number {
  if (values.length === 0) return 0;
  const squaredDiffs = values.reduce((s, v) => s + (v - avg) * (v - avg), 0);
  return Math.sqrt(squaredDiffs / values.length);
}

export function detectAnomaly(input: DetectAnomalyInput): AnomalyResult | null {
  const { amount, merchantHistory } = input;

  if (merchantHistory.length <= MAX_HISTORY_FOR_NEW_MERCHANT) {
    return { method: 'new_merchant', zScore: 0 };
  }

  if (merchantHistory.length < MIN_HISTORY_FOR_ZSCORE) {
    /*
     * 2–9 prior sightings: enough to know the merchant isn't new
     * but not enough to compute a stable z-score. Stay silent;
     * the user gets a flag once history catches up.
     */
    return null;
  }

  const avg = mean(merchantHistory);
  const stdDev = populationStdDev(merchantHistory, avg);

  if (stdDev === 0) {
    /*
     * Degenerate case: every historical amount was identical.
     * Flagging any deviation would surface noise (e.g., a $0.01
     * processing-fee variation) as an "anomaly". Stay silent —
     * a future improvement could use MAD or absolute-deviation
     * thresholds for these flat distributions.
     */
    return null;
  }

  const zScore = (amount - avg) / stdDev;
  if (Math.abs(zScore) > ZSCORE_THRESHOLD) {
    return { method: 'merchant_zscore', zScore };
  }
  return null;
}
