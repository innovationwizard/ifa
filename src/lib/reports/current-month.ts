import { DEFAULT_TIMEZONE } from '@/i18n/config';

/**
 * Current-month boundary helper (Phase 6/7 Batch 14).
 *
 * Returns the `[from, to]` UTC date range covering the calendar
 * month that contains `now` IN GUATEMALA TIME. Used by the dashboard's
 * monthly-summary widget to satisfy B14 acceptance: "Monthly summary
 * respects the current-month boundary in `America/Guatemala`".
 *
 * Most of the codebase pretends UTC = GT for month bucketing (GT is
 * UTC-6 year-round, no DST), which is correct except in the 6-hour
 * window before midnight UTC at month edges. The dashboard is the
 * one place that matters: a user looking at "this month" at 23:00 on
 * the 31st in GT must see December, not the empty January bucket
 * UTC would already be in.
 *
 * Implementation: ask `Intl.DateTimeFormat` for the year/month in
 * `America/Guatemala`, then construct UTC midnight bounds from those
 * fields. The aggregation functions in `aggregations.ts` compare
 * `Transaction.date` (which is `@db.Date`, stored as midnight UTC)
 * via `isInRange` — so UTC bounds at day granularity work cleanly.
 */

const GT_MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: DEFAULT_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
});

export interface MonthBoundary {
  /** First day of the month, midnight UTC. Inclusive. */
  from: Date;
  /** Last day of the month, midnight UTC. Inclusive. */
  to: Date;
  /** Convenience: `YYYY-MM` string for the month. */
  monthKey: string;
}

export function currentMonthInGuatemala(now: Date = new Date()): MonthBoundary {
  const parts = GT_MONTH_FORMATTER.formatToParts(now);
  const yearPart = parts.find((p) => p.type === 'year')?.value;
  const monthPart = parts.find((p) => p.type === 'month')?.value;
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    /*
     * Defensive: `Intl.DateTimeFormat` is in every supported runtime.
     * If it ever fails, fall back to UTC so the dashboard still renders
     * a sensible range instead of NaN dates.
     */
    const fallbackYear = now.getUTCFullYear();
    const fallbackMonth = now.getUTCMonth() + 1;
    return buildBoundary(fallbackYear, fallbackMonth);
  }
  return buildBoundary(year, month);
}

function buildBoundary(year: number, month: number): MonthBoundary {
  const from = new Date(Date.UTC(year, month - 1, 1));
  /*
   * `Date.UTC(y, m, 0)` returns the last day of month `m-1` (i.e.,
   * the day BEFORE the 1st of month `m`). Passing `month` here gives
   * us the last day of the current month.
   */
  const to = new Date(Date.UTC(year, month, 0));
  const monthKey = `${year.toString()}-${month.toString().padStart(2, '0')}`;
  return { from, to, monthKey };
}
