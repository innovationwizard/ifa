import type { Prisma, TransactionType } from '@prisma/client';

/**
 * Report aggregation primitives (Phase 6/7 Batch 6).
 *
 * Pure functions that turn `Transaction` rows into report-ready
 * summaries. No DB writes, no IO, no UI imports — every function
 * here is deterministic in its input and reusable from server
 * components, route handlers, and the future Health Score factor
 * library (Phase 7 Batch 9).
 *
 * Date handling:
 *   - Transaction.date is `@db.Date` (no time-of-day). We treat
 *     dates as UTC throughout: `getUTCFullYear()`, `getUTCMonth()`.
 *     This matches the seed + import paths, which set date at
 *     midnight UTC. Reports are calendar-month grouped — DST is a
 *     non-issue at day granularity.
 *   - `from`/`to` filters are inclusive on both ends. A row with
 *     date == from or date == to is in the range.
 *
 * Amount handling:
 *   - Stored as `Decimal(14, 2)` (Prisma.Decimal). For aggregation
 *     we convert to `Number` — GTQ amounts in personal finance
 *     stay comfortably inside `Number.MAX_SAFE_INTEGER` even when
 *     summed across decades. If a future BUSINESS-tier aggregation
 *     ever processes 9-figure totals, switch to Decimal arithmetic.
 *   - TRANSFER rows are excluded from cash-flow / spending /
 *     merchant totals: an intra-account transfer is neither income
 *     nor expense for the profile as a whole.
 *
 * Null handling:
 *   - `spendingByCategory` groups null/empty category strings into
 *     the user-facing label "Sin categoría" rather than dropping
 *     the row. Acceptance criterion: never drops rows.
 *   - `topMerchants` falls back to NIT as the grouping key when
 *     merchantName is null. If both are null/empty, the row groups
 *     under the sentinel "Comercio desconocido".
 */

/**
 * Narrow input shape consumed by every aggregation function.
 * Decoupled from Prisma's full `Transaction` type so synthetic
 * fixtures stay terse and so future Transaction columns don't
 * widen the test surface.
 */
export interface AggregationInput {
  date: Date;
  type: TransactionType;
  amount: Prisma.Decimal | number | string;
  category: string | null;
  merchantName: string | null;
  merchantNit: string | null;
}

export interface DateRangeArgs {
  from: Date;
  to: Date;
}

export interface MonthlyCashFlow {
  /** YYYY-MM. Sorts lexicographically; locale-formatted by the UI. */
  month: string;
  /** Sum of INCOME amounts. Always ≥ 0. */
  income: number;
  /** Sum of EXPENSE amounts. Always ≥ 0 (positive magnitudes). */
  expense: number;
  /** `income - expense`. Can be negative. */
  net: number;
}

export interface CategoryBucket {
  /** User-facing label. Null/empty categories collapse into "Sin categoría". */
  category: string;
  /** Total spent in this category (positive magnitude). */
  total: number;
  /** Share of total spending in [0, 100]. Two decimals worth of precision. */
  percent: number;
  /** Number of transactions in the bucket. */
  count: number;
}

export interface MerchantBucket {
  /** Display name. Null when only NIT was available. */
  merchantName: string | null;
  /** NIT. Null when only name was available. */
  merchantNit: string | null;
  total: number;
  count: number;
}

/** Fallback merchant label when both name and NIT are missing. */
export const UNKNOWN_MERCHANT_LABEL = 'Comercio desconocido';
/** Fallback category label for null/empty categories. */
export const UNCATEGORIZED_LABEL = 'Sin categoría';

function toNumber(amount: Prisma.Decimal | number | string): number {
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'string') return Number(amount);
  // Prisma.Decimal — has a toNumber() method
  return amount.toNumber();
}

function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year.toString()}-${month}`;
}

function isInRange(date: Date, from: Date, to: Date): boolean {
  return date.getTime() >= from.getTime() && date.getTime() <= to.getTime();
}

/**
 * Enumerate every YYYY-MM between `from` and `to` inclusive. Used
 * by `monthlyCashFlow` to fill missing months with zeros so the
 * chart x-axis stays continuous and an idle month renders as an
 * empty bar rather than a missing tick.
 */
function enumerateMonths(from: Date, to: Date): string[] {
  if (from.getTime() > to.getTime()) return [];
  const months: string[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cursor.getTime() <= end.getTime()) {
    months.push(monthKey(cursor));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return months;
}

/**
 * Per-month INCOME / EXPENSE / net totals over the range, with
 * missing months filled with zeros. TRANSFER rows are excluded.
 *
 * Output is sorted oldest → newest by `month`.
 */
export function monthlyCashFlow(
  transactions: AggregationInput[],
  range: DateRangeArgs,
): MonthlyCashFlow[] {
  const months = enumerateMonths(range.from, range.to);
  if (months.length === 0) return [];

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const month of months) byMonth.set(month, { income: 0, expense: 0 });

  for (const tx of transactions) {
    if (!isInRange(tx.date, range.from, range.to)) continue;
    if (tx.type === 'TRANSFER') continue;

    const key = monthKey(tx.date);
    const bucket = byMonth.get(key);
    if (!bucket) continue; // tx in-range but somehow outside enumerated months

    const amount = toNumber(tx.amount);
    if (tx.type === 'INCOME') bucket.income += amount;
    else if (tx.type === 'EXPENSE') bucket.expense += amount;
  }

  return months.map((month) => {
    const bucket = byMonth.get(month) ?? { income: 0, expense: 0 };
    return {
      month,
      income: bucket.income,
      expense: bucket.expense,
      net: bucket.income - bucket.expense,
    };
  });
}

/**
 * Spending breakdown by category over the range. EXPENSE rows
 * only. Null/empty categories collapse into "Sin categoría" so
 * the caller never has to special-case them in the chart legend.
 *
 * Output is sorted by `total` descending.
 */
export function spendingByCategory(
  transactions: AggregationInput[],
  range: DateRangeArgs,
): CategoryBucket[] {
  const buckets = new Map<string, { total: number; count: number }>();
  let grandTotal = 0;

  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE') continue;
    if (!isInRange(tx.date, range.from, range.to)) continue;

    const label = tx.category && tx.category.trim() !== '' ? tx.category : UNCATEGORIZED_LABEL;
    const bucket = buckets.get(label) ?? { total: 0, count: 0 };
    const amount = toNumber(tx.amount);
    bucket.total += amount;
    bucket.count += 1;
    buckets.set(label, bucket);
    grandTotal += amount;
  }

  return Array.from(buckets.entries())
    .map(([category, { total, count }]) => ({
      category,
      total,
      /*
       * Divide-by-zero guard: when grandTotal is 0 (only TRANSFER
       * rows in range, or every EXPENSE row has amount=0) every
       * percent is 0 by definition. Without the guard we'd emit
       * NaN, which the chart would render as a blank slice.
       */
      percent: grandTotal > 0 ? (total / grandTotal) * 100 : 0,
      count,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Top merchants by spend over the range. EXPENSE rows only.
 * Grouping key: `merchantName` when present, else `merchantNit`,
 * else the sentinel "Comercio desconocido" label. The returned
 * row preserves whichever of name/NIT we had for the first
 * sighting of that group so the UI can display both when known.
 *
 * Output is sorted by `total` descending and clamped to `limit`.
 */
export function topMerchants(
  transactions: AggregationInput[],
  args: DateRangeArgs & { limit: number },
): MerchantBucket[] {
  const buckets = new Map<
    string,
    { merchantName: string | null; merchantNit: string | null; total: number; count: number }
  >();

  for (const tx of transactions) {
    if (tx.type !== 'EXPENSE') continue;
    if (!isInRange(tx.date, args.from, args.to)) continue;

    /*
     * Coerce empty-string and whitespace-only inputs to null so a
     * row with `merchantName: ''` doesn't form its own bucket
     * separate from `merchantName: null`. `||` would handle this
     * but trips `@typescript-eslint/prefer-nullish-coalescing`;
     * the explicit ternary expresses intent without false-positive
     * warnings.
     */
    const trimmedName = tx.merchantName?.trim() ?? '';
    const trimmedNit = tx.merchantNit?.trim() ?? '';
    const name = trimmedName.length > 0 ? trimmedName : null;
    const nit = trimmedNit.length > 0 ? trimmedNit : null;
    const key = name ?? nit ?? UNKNOWN_MERCHANT_LABEL;

    const existing = buckets.get(key);
    if (existing) {
      existing.total += toNumber(tx.amount);
      existing.count += 1;
      /*
       * Backfill the missing identifier across sightings — first
       * row may have only had name; a later row of the same
       * merchant may carry the NIT (or vice-versa). Display
       * benefits from showing both whenever any row has them.
       */
      if (existing.merchantName === null && name !== null) existing.merchantName = name;
      if (existing.merchantNit === null && nit !== null) existing.merchantNit = nit;
    } else {
      buckets.set(key, {
        merchantName: name,
        merchantNit: nit,
        total: toNumber(tx.amount),
        count: 1,
      });
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, Math.max(0, args.limit));
}
