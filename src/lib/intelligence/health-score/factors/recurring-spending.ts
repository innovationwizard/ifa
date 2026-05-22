import { clamp, isInRange, lastNMonthsWindow, merchantKey } from '../helpers';
import type { FactorInput, FactorResult } from '../types';

/**
 * Recurring Spending Ratio — Phase 7 factor 5 of 6 (weight 15%).
 *
 * Question answered: "How much of your spending is predictable
 * (recurring at the same merchant) vs. surprise (one-offs)?"
 *
 * Formula: `recurring_count / total_count × 100` over the last 3
 * months of EXPENSE rows. A "recurring" expense is any row whose
 * merchant key appears ≥3 times in the same window — proxy for
 * subscriptions, rent, utilities, regular gas station visits, etc.
 *
 * Why is high recurring-ratio a good signal? Predictable spending
 * is easier to budget for; surprise spending is the leading source
 * of "where did the money go?" anxiety in the consumer-finance
 * literature. A high recurring ratio also gives Phase 8 / 9 features
 * (subscription detection, budget allocations) more to grip on.
 *
 * Merchant key uses the same NIT-preferred / name-fallback rule as
 * the categorization service (Batch 3) and the anomaly handler
 * (Batch 8) so all three layers agree on what "the same merchant"
 * means.
 *
 * `partial` when fewer than 10 EXPENSE rows in the window — below
 * that the ratio is too noisy to interpret as a habit signal.
 *
 * `inputs` keys: recurringCount, totalExpenses, distinctMerchants, ratio.
 */
const WINDOW_MONTHS = 3;
const MIN_TXNS_FOR_FULL = 10;
const RECURRING_THRESHOLD = 3;

export function recurringSpending(input: FactorInput): FactorResult {
  const range = lastNMonthsWindow(input.now, WINDOW_MONTHS);

  const expensesInWindow = input.transactions.filter(
    (t) => t.type === 'EXPENSE' && isInRange(t.date, range.from, range.to),
  );

  const merchantCounts = new Map<string, number>();
  for (const tx of expensesInWindow) {
    const key = merchantKey(tx);
    if (!key) continue;
    merchantCounts.set(key, (merchantCounts.get(key) ?? 0) + 1);
  }

  let recurringCount = 0;
  for (const tx of expensesInWindow) {
    const key = merchantKey(tx);
    if (!key) continue;
    if ((merchantCounts.get(key) ?? 0) >= RECURRING_THRESHOLD) {
      recurringCount += 1;
    }
  }

  const totalExpenses = expensesInWindow.length;
  const ratio = totalExpenses > 0 ? recurringCount / totalExpenses : 0;
  const score = clamp(ratio * 100, 0, 100);
  const partial = totalExpenses < MIN_TXNS_FOR_FULL;

  return {
    score,
    partial,
    inputs: {
      recurringCount,
      totalExpenses,
      distinctMerchants: merchantCounts.size,
      ratio,
    },
  };
}
