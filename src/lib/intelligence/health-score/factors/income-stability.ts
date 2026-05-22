import {
  bucketByMonth,
  clamp,
  coefficientOfVariation,
  lastNMonthsWindow,
  monthsWithIncome,
} from '../helpers';
import type { FactorInput, FactorResult } from '../types';

/**
 * Income Stability — Phase 7 factor 2 of 6 (weight 20%).
 *
 * Question answered: "How predictable is your income?"
 *
 * Formula: `100 * 1 / (1 + CV(monthly_income))` over the last 6
 * calendar months. Same shape as Spending Discipline but operating
 * on income totals — a salaried worker with a steady deposit scores
 * near 100; a contractor with lumpy invoices scores lower.
 *
 * `partial` when the window has fewer than 3 months with any
 * income — typical for users in the first weeks of using IFA, or
 * for users whose income is entirely cash (and so doesn't show up
 * in any imported statement).
 *
 * `inputs` keys: cv, monthsCount, monthsWithIncome, avgMonthlyIncome.
 */
const WINDOW_MONTHS = 6;
const MIN_MONTHS_FOR_FULL = 3;

export function incomeStability(input: FactorInput): FactorResult {
  const range = lastNMonthsWindow(input.now, WINDOW_MONTHS);
  const buckets = bucketByMonth(input.transactions, range);
  const incomes = buckets.map((b) => b.income);

  const cv = coefficientOfVariation(incomes);
  const score = clamp((100 * 1) / (1 + cv), 0, 100);

  const withIncome = monthsWithIncome(buckets);
  const partial = withIncome < MIN_MONTHS_FOR_FULL;
  const avgMonthlyIncome =
    buckets.length > 0 ? buckets.reduce((s, b) => s + b.income, 0) / buckets.length : 0;

  return {
    score,
    partial,
    inputs: {
      cv,
      monthsCount: buckets.length,
      monthsWithIncome: withIncome,
      avgMonthlyIncome,
    },
  };
}
