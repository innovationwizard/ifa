import type { FactorTransaction } from './types';

/**
 * Shared math + windowing helpers for the Health Score factors.
 *
 * Pure. No DB, no IO, no `Date.now()` — every function takes the
 * clock or window bounds as parameters so the factor tests can pin
 * time deterministically.
 */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Coefficient of Variation (σ/|μ|) using SAMPLE standard deviation
 * (divide by N-1). Sample is the honest choice here: 6 months of
 * data is a sample of an ongoing process, not the full population.
 *
 * Returns 0 when:
 *   - `values.length < 2` — CV is undefined for n<2.
 *   - mean is 0 — divide-by-zero guard. The caller should interpret
 *     "all-zero values" as "no variability" (CV=0 → factor score=100).
 */
export function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;
  const sum = values.reduce((s, v) => s + v, 0);
  const avg = sum / values.length;
  if (avg === 0) return 0;
  const sqDiffs = values.reduce((s, v) => s + (v - avg) * (v - avg), 0);
  const sampleVariance = sqDiffs / (values.length - 1);
  return Math.sqrt(sampleVariance) / Math.abs(avg);
}

/**
 * Returns the inclusive `[from, to]` Date range covering the last
 * `monthCount` calendar months ending in `now`'s month.
 *
 * Both bounds are normalized to midnight UTC at day granularity:
 *   - `from` is the first of `now.month - (monthCount - 1)`
 *   - `to`   is the same day-of-month as `now`, but at 00:00 UTC
 *
 * Caller-friendly: pass directly to `filterTransactionsToWindow`
 * or to Batch 6's `monthlyCashFlow({from, to})`.
 */
export function lastNMonthsWindow(now: Date, monthCount: number): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthCount - 1), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { from, to };
}

/** Inclusive on both bounds. Uses `getTime()` comparison so date-only inputs work. */
export function isInRange(date: Date, from: Date, to: Date): boolean {
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

/**
 * Pre-built monthly bucket shape used by the discipline / income /
 * cash-flow-consistency factors. One entry per month in the
 * `[from, to]` range — missing months are filled with zeros so the
 * CV calculation has a stable denominator.
 */
export interface MonthlyBucket {
  /** YYYY-MM. Sorts lexicographically. */
  monthKey: string;
  income: number;
  expense: number;
  net: number;
}

function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year.toString()}-${month}`;
}

/**
 * Bucket the transactions into one entry per month in the range,
 * filling missing months with zeros. TRANSFER rows are excluded
 * (intra-account movement is neither income nor expense for the
 * profile).
 *
 * Parallels Batch 6's `monthlyCashFlow` but operates on the narrow
 * `FactorTransaction` shape and is duplicated to keep the
 * intelligence layer decoupled from the reports layer.
 */
export function bucketByMonth(
  transactions: FactorTransaction[],
  range: { from: Date; to: Date },
): MonthlyBucket[] {
  if (range.from.getTime() > range.to.getTime()) return [];

  const months = new Map<string, { income: number; expense: number }>();
  let cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), 1));
  while (cursor.getTime() <= end.getTime()) {
    months.set(monthKey(cursor), { income: 0, expense: 0 });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  for (const tx of transactions) {
    if (!isInRange(tx.date, range.from, range.to)) continue;
    if (tx.type === 'TRANSFER') continue;

    const key = monthKey(tx.date);
    const bucket = months.get(key);
    if (!bucket) continue;
    if (tx.type === 'INCOME') bucket.income += tx.amount;
    else if (tx.type === 'EXPENSE') bucket.expense += tx.amount;
  }

  return Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, b]) => ({
      monthKey: k,
      income: b.income,
      expense: b.expense,
      net: b.income - b.expense,
    }));
}

/**
 * Merchant grouping key: NIT-preferred (stable across statement
 * formatting), name-fallback. Matches the categorization service's
 * `normalizeLookupKey` philosophy (Batch 3) so users see consistent
 * grouping across the categorization + recurring-spending features.
 */
export function merchantKey(tx: FactorTransaction): string | null {
  const nit = tx.merchantNit?.trim();
  if (nit) return `nit:${nit}`;
  const name = tx.merchantName?.trim();
  if (name) return `name:${name.toLowerCase()}`;
  return null;
}

/**
 * Count distinct months that carry at least one EXPENSE row in the
 * window. Used by factor "partial" thresholds — the rule is
 * uniformly "3+ months of relevant data".
 */
export function monthsWithExpense(buckets: MonthlyBucket[]): number {
  return buckets.filter((b) => b.expense > 0).length;
}

/** Same for income. */
export function monthsWithIncome(buckets: MonthlyBucket[]): number {
  return buckets.filter((b) => b.income > 0).length;
}
