import type { FactorFn, FactorKey } from '../types';
import { anomalyRate } from './anomaly-rate';
import { cashFlowConsistency } from './cash-flow-consistency';
import { incomeStability } from './income-stability';
import { recurringSpending } from './recurring-spending';
import { savingsRate } from './savings-rate';
import { spendingDiscipline } from './spending-discipline';

/**
 * Factor registry for the Health Score engine (Phase 7 Batch 9).
 *
 * Order + weights match §2 of `_PHASE_6_7_PLAN.md`. Weights are
 * percentages of the final 0–1000 score; the engine (Batch 10)
 * computes `sum(score_i × weight_i) / 100 × 10` so each factor's
 * 0–100 sub-score scales to its share of the 0–1000 final score.
 *
 * `FACTOR_WEIGHTS` MUST sum to 100. A unit test pins this invariant
 * so a future weight tweak can't silently drift the engine's max
 * output away from 1000.
 */

export type { FactorFn } from '../types';

export const FACTOR_WEIGHTS = {
  spendingDiscipline: 20,
  incomeStability: 20,
  savingsRate: 20,
  cashFlowConsistency: 15,
  recurringSpending: 15,
  anomalyRate: 10,
} as const satisfies Record<FactorKey, number>;

export const FACTORS = {
  spendingDiscipline,
  incomeStability,
  savingsRate,
  cashFlowConsistency,
  recurringSpending,
  anomalyRate,
} as const satisfies Record<FactorKey, FactorFn>;

export {
  anomalyRate,
  cashFlowConsistency,
  incomeStability,
  recurringSpending,
  savingsRate,
  spendingDiscipline,
};
