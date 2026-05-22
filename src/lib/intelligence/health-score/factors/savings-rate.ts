import { bucketByMonth, clamp, lastNMonthsWindow, monthsWithIncome } from '../helpers';
import type { FactorInput, FactorResult } from '../types';

/**
 * Savings Rate — Phase 7 factor 3 of 6 (weight 20%).
 *
 * Question answered: "What fraction of your income are you saving?"
 *
 * Formula:
 *   rate = (avgIncome − avgExpense) / avgIncome    // over last 3 months
 *   score = clamp(rate, 0, 0.30) / 0.30 × 100
 *
 * Saving 30% of income or more → score 100. Saving 0% (spending
 * exactly what you earn) → 0. Spending more than you earn → also 0
 * (clamp at zero, not negative — a negative savings rate is a real
 * problem but it shouldn't make Cash Flow Consistency's signal moot
 * by dragging this factor below zero).
 *
 * Why a 30% ceiling? A 30% savings rate is the financial-planning
 * "target" benchmark for individual tier (a common rule among
 * personal finance educators in LatAm — Banco de Guatemala's own
 * educational materials use 30% as the goal). Above 30% returns
 * diminishing real-world benefit for a score signal, and we want
 * the score to be reachable rather than asymptotic.
 *
 * `partial` when fewer than 3 months carry any income. Without an
 * income baseline the savings-rate calculation is undefined.
 *
 * `inputs` keys: avgIncome, avgExpense, rate, clampedRate.
 */
const WINDOW_MONTHS = 3;
const MIN_MONTHS_FOR_FULL = 3;
const TARGET_RATE = 0.3;

export function savingsRate(input: FactorInput): FactorResult {
  const range = lastNMonthsWindow(input.now, WINDOW_MONTHS);
  const buckets = bucketByMonth(input.transactions, range);

  const totalIncome = buckets.reduce((s, b) => s + b.income, 0);
  const totalExpense = buckets.reduce((s, b) => s + b.expense, 0);
  const monthCount = buckets.length || 1;
  const avgIncome = totalIncome / monthCount;
  const avgExpense = totalExpense / monthCount;

  const rate = avgIncome > 0 ? (avgIncome - avgExpense) / avgIncome : 0;
  const clampedRate = clamp(rate, 0, TARGET_RATE);
  const score = (clampedRate / TARGET_RATE) * 100;

  const partial = monthsWithIncome(buckets) < MIN_MONTHS_FOR_FULL;

  return {
    score,
    partial,
    inputs: { avgIncome, avgExpense, rate, clampedRate },
  };
}
