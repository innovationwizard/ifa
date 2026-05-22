import {
  bucketByMonth,
  clamp,
  coefficientOfVariation,
  lastNMonthsWindow,
  monthsWithExpense,
} from '../helpers';
import type { FactorInput, FactorResult } from '../types';

/**
 * Spending Discipline — Phase 7 factor 1 of 6 (weight 20%).
 *
 * Question answered: "How predictable are your monthly expenses?"
 *
 * Formula: `100 * 1 / (1 + CV(monthly_expenses))` over the last 6
 * calendar months. Low coefficient-of-variation = consistent monthly
 * spend = high score. A user who spends ~Q5,000 every month scores
 * near 100. A user with Q1,000 / Q9,000 / Q500 / … months scores low.
 *
 * Why not just stdDev? CV normalizes by the mean, so a household
 * spending Q500/mo and a household spending Q50,000/mo with the same
 * relative variability score identically. That's the fairness property
 * we want for a Guatemalan-individual-tier score where absolute
 * amounts vary enormously across users.
 *
 * `partial` is true when the window has fewer than 3 months that
 * actually carried EXPENSE rows — below that the CV is too noisy to
 * trust as a discipline signal.
 *
 * `inputs` keys:
 *   - cv: the raw coefficient of variation
 *   - monthsCount: number of months in the window (always 6)
 *   - monthsWithExpense: how many of those carried any expense
 *   - avgMonthlyExpense: average expense across the window
 */
const WINDOW_MONTHS = 6;
const MIN_MONTHS_FOR_FULL = 3;

export function spendingDiscipline(input: FactorInput): FactorResult {
  const range = lastNMonthsWindow(input.now, WINDOW_MONTHS);
  const buckets = bucketByMonth(input.transactions, range);
  const expenses = buckets.map((b) => b.expense);

  const cv = coefficientOfVariation(expenses);
  const score = clamp((100 * 1) / (1 + cv), 0, 100);

  const withExpense = monthsWithExpense(buckets);
  const partial = withExpense < MIN_MONTHS_FOR_FULL;
  const avgMonthlyExpense =
    buckets.length > 0 ? buckets.reduce((s, b) => s + b.expense, 0) / buckets.length : 0;

  return {
    score,
    partial,
    inputs: {
      cv,
      monthsCount: buckets.length,
      monthsWithExpense: withExpense,
      avgMonthlyExpense,
    },
  };
}
