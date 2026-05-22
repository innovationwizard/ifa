import { bucketByMonth, clamp, coefficientOfVariation, lastNMonthsWindow } from '../helpers';
import type { FactorInput, FactorResult } from '../types';

/**
 * Cash Flow Consistency — Phase 7 factor 4 of 6 (weight 15%).
 *
 * Question answered: "How stable is your net cash flow (income
 * minus expenses) month over month?"
 *
 * Formula: `100 * 1 / (1 + CV(monthly_net))` over the last 6
 * calendar months. Captures the COMBINED effect of income +
 * expense variability — a user with steady salary + steady spend
 * has near-zero net CV and scores near 100, even if their income
 * stability and spending discipline scores were both only "OK"
 * individually. Conversely a user with offsetting big swings on
 * both sides can score lower here than on either parent factor.
 *
 * `partial` when fewer than 3 months have ANY movement (income or
 * expense). Otherwise the formula is computed on whatever's there.
 *
 * `inputs` keys: cv, monthsCount, monthsWithMovement, avgMonthlyNet.
 */
const WINDOW_MONTHS = 6;
const MIN_MONTHS_FOR_FULL = 3;

export function cashFlowConsistency(input: FactorInput): FactorResult {
  const range = lastNMonthsWindow(input.now, WINDOW_MONTHS);
  const buckets = bucketByMonth(input.transactions, range);
  const nets = buckets.map((b) => b.net);

  const cv = coefficientOfVariation(nets);
  const score = clamp((100 * 1) / (1 + cv), 0, 100);

  const withMovement = buckets.filter((b) => b.income !== 0 || b.expense !== 0).length;
  const partial = withMovement < MIN_MONTHS_FOR_FULL;
  const avgMonthlyNet =
    buckets.length > 0 ? buckets.reduce((s, b) => s + b.net, 0) / buckets.length : 0;

  return {
    score,
    partial,
    inputs: {
      cv,
      monthsCount: buckets.length,
      monthsWithMovement: withMovement,
      avgMonthlyNet,
    },
  };
}
