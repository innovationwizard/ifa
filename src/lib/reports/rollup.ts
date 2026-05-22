import type { CategoryBucket } from './aggregations';

/**
 * Roll up the long tail of `spendingByCategory` into an "Otros" bucket
 * after the top `limit` categories. Pure function — same input → same
 * output. Caller passes the user-facing label so this stays
 * i18n-agnostic.
 *
 * Behavior:
 *   - When `buckets.length <= limit`, returns `buckets` unchanged.
 *   - Otherwise: keeps the first `limit` rows (already sorted desc by
 *     `spendingByCategory`) and replaces the rest with one synthesized
 *     row whose `category = othersLabel`, totals/counts summed, and
 *     `percent` summed (so the rendered percents still sum to ~100).
 *
 * Per dataviz research (§5.2 + §6 rule #6): no donut > 5 slices.
 * Default `limit = 6` keeps the chart legible at mobile widths.
 */
export function rollupCategories(
  buckets: CategoryBucket[],
  options: { limit?: number; othersLabel: string } = { othersLabel: 'Otros' },
): CategoryBucket[] {
  const limit = options.limit ?? 6;
  if (buckets.length <= limit) return buckets;

  const head = buckets.slice(0, limit);
  const tail = buckets.slice(limit);

  const others: CategoryBucket = tail.reduce<CategoryBucket>(
    (acc, b) => ({
      category: acc.category,
      total: acc.total + b.total,
      percent: acc.percent + b.percent,
      count: acc.count + b.count,
    }),
    { category: options.othersLabel, total: 0, percent: 0, count: 0 },
  );

  return [...head, others];
}
