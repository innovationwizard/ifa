import type { Prisma } from '@prisma/client';
import { FACTORS, FACTOR_WEIGHTS } from './factors';
import { lastNMonthsWindow } from './helpers';
import type { FactorInput, FactorKey, FactorResult, FactorTransaction } from './types';

/**
 * Health Score engine (Phase 6/7 Batch 10).
 *
 * Composes the six pure factor functions from Batch 9 into the
 * single 0–1000 score. Pure — no DB, no IO, no clock. The caller
 * supplies the `transactions` slice (typically "last 6 months of
 * this profile's data") and `now`. The persist layer in
 * `persist.ts` is the one with DB awareness.
 *
 * Score scaling:
 *   - Each factor returns score ∈ [0, 100] (clamped).
 *   - Engine computes `Σ (score_i × weight_i)` where weights are
 *     percentages summing to 100 (pinned by FACTOR_WEIGHTS test).
 *     That gives a number in [0, 10000].
 *   - Divide by 10 → final score in [0, 1000], rounded to integer.
 *
 * Determinism:
 *   - For a fixed `(transactions, now, previousScore)` triple the
 *     engine returns byte-identical output. No `Date.now()`,
 *     no `Math.random`, no Map iteration order assumptions.
 *
 * `partial` propagation:
 *   - Counts how many of the six factors flagged `partial: true`.
 *   - The result-level `partial` is true when ≥1 factor was partial.
 *   - `partialFactorCount` lets the UI show a precise "5 of 6 factors
 *     have full data" badge instead of just a binary indicator.
 */

const SCALE_FACTOR = 10;

export interface FactorBreakdown {
  key: FactorKey;
  weight: number;
  score: number;
  partial: boolean;
  inputs: Record<string, number>;
}

export interface HealthScoreSnapshot {
  /** Final score in [0, 1000]. Always an integer. */
  score: number;
  /** Previous snapshot's score, or null on first computation. */
  previousScore: number | null;
  /** Per-factor breakdown in the order declared in `FACTORS`. */
  factors: FactorBreakdown[];
  /** True when any factor reported partial data. */
  partial: boolean;
  /** Exact count of factors that flagged partial. 0..6. */
  partialFactorCount: number;
  /** The `now` Date that was passed in — echoed for traceability. */
  computedAt: Date;
}

export interface ComputeHealthScoreInput {
  /**
   * All transactions to consider — typically the last 6 months for
   * the profile. The factors filter internally to their own windows
   * (3 or 6 months).
   */
  transactions: FactorTransaction[];
  /** "Now" anchor for all window arithmetic. Inject in tests. */
  now: Date;
  /** Score from the most recent prior `HealthScore` row, or null. */
  previousScore: number | null;
}

/**
 * Pure: same input → same output. No IO. Persistence is the
 * caller's responsibility (see `persist.ts`).
 */
export function computeHealthScore(input: ComputeHealthScoreInput): HealthScoreSnapshot {
  const factorInput: FactorInput = {
    transactions: input.transactions,
    now: input.now,
  };

  const breakdowns: FactorBreakdown[] = [];
  let weightedSum = 0;
  let partialCount = 0;

  for (const [key, fn] of Object.entries(FACTORS) as [FactorKey, (typeof FACTORS)[FactorKey]][]) {
    const result: FactorResult = fn(factorInput);
    const weight = FACTOR_WEIGHTS[key];
    weightedSum += result.score * weight;
    if (result.partial) partialCount += 1;
    breakdowns.push({
      key,
      weight,
      score: result.score,
      partial: result.partial,
      inputs: result.inputs,
    });
  }

  /*
   * Σ(score × weight) is in [0, 10000] because each score is in
   * [0, 100] and weights sum to 100. Divide by 10 to land in
   * [0, 1000]. Round to integer for storage compactness + display.
   */
  const score = Math.round(weightedSum / SCALE_FACTOR);

  return {
    score,
    previousScore: input.previousScore,
    factors: breakdowns,
    partial: partialCount > 0,
    partialFactorCount: partialCount,
    computedAt: input.now,
  };
}

/**
 * Helper for the persist layer: serialize the factor breakdown to
 * the JSONB shape stored in `HealthScore.factors`. Kept here (not
 * in persist.ts) so callers reading the JSONB back can use the same
 * shape definition.
 */
export function snapshotToFactorsJson(snapshot: HealthScoreSnapshot): Prisma.InputJsonValue {
  return {
    partialFactorCount: snapshot.partialFactorCount,
    breakdown: snapshot.factors.map((f) => ({
      key: f.key,
      weight: f.weight,
      score: f.score,
      partial: f.partial,
      inputs: f.inputs,
    })),
  };
}

/**
 * Default 6-month transaction window the engine expects. Exported so
 * the persist layer (and any later caller — recompute API, cron) can
 * derive `{from, to}` for the DB query in one place.
 */
export const HEALTH_SCORE_WINDOW_MONTHS = 6;

export function healthScoreWindow(now: Date): { from: Date; to: Date } {
  return lastNMonthsWindow(now, HEALTH_SCORE_WINDOW_MONTHS);
}
