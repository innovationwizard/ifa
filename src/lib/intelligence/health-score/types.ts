import type { TransactionType } from '@prisma/client';

/**
 * Shared types for the Health Score factor library (Phase 6/7 Batch 9).
 *
 * Every factor function is pure: same `FactorInput` → same `FactorResult`.
 * Clock is injected via `now` so tests pin time deterministically.
 */

/**
 * Narrow Transaction shape consumed by the factors. Decoupled from
 * Prisma's full `Transaction` row so synthetic test fixtures stay
 * terse and so adding new Transaction columns doesn't ripple here.
 */
export interface FactorTransaction {
  /** Calendar date (`@db.Date`, midnight UTC by convention). */
  date: Date;
  type: TransactionType;
  /** Positive magnitude; sign carried by `type`. */
  amount: number;
  merchantName: string | null;
  merchantNit: string | null;
  /** Free-form JSONB; anomaly-rate reads `metadata.anomaly` from here. */
  metadata: unknown;
}

export interface FactorInput {
  /**
   * All transactions for the profile that COULD be relevant. The
   * factor functions filter to their own time window internally
   * (3 or 6 months — see per-factor docstrings).
   */
  transactions: FactorTransaction[];
  /** "Now" anchor for window arithmetic. Inject in tests. */
  now: Date;
}

export interface FactorResult {
  /** Sub-score in `[0, 100]`. Always finite. */
  score: number;
  /**
   * True when the input doesn't meet the factor's minimum-data
   * threshold (typically <3 months of relevant rows). The engine
   * (Batch 10) still includes the score in the weighted sum but
   * surfaces a "Faltan datos" badge to the user.
   */
  partial: boolean;
  /**
   * Raw numbers that went into the score. Surfaces in the UI's
   * "why this number?" expansion so users can audit the math.
   * Each factor documents its own keys.
   */
  inputs: Record<string, number>;
}

/**
 * Closed set of factor keys. Used by `FACTOR_WEIGHTS` and by the
 * engine to assemble the final score. Order matches §2 of the
 * Phase 6/7 plan.
 */
export type FactorKey =
  | 'spendingDiscipline'
  | 'incomeStability'
  | 'savingsRate'
  | 'cashFlowConsistency'
  | 'recurringSpending'
  | 'anomalyRate';

/** Signature shared by every factor function. Pure: same input → same output. */
export type FactorFn = (input: FactorInput) => FactorResult;
