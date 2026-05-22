/**
 * Period parsing for the reports UI (Phase 6/7 Batch 7).
 *
 * Single source of truth for "what date range does this report cover?".
 * Reads URL search params (server and client agree), returns a typed
 * `{ key, from, to }` triple that the chart components and the
 * `transactionRepo.listAllForReports` call share.
 *
 * URL shape:
 *   - `?period=1m | 3m | 6m | 12m | custom`
 *   - When `period=custom`: `?period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD`
 *
 * Defaults to `6m` when:
 *   - the param is missing
 *   - the param value isn't one of the known keys
 *   - `period=custom` but `from`/`to` are missing or invalid
 *
 * All dates are normalized to midnight UTC at day granularity. This
 * matches `Transaction.date` which is `@db.Date` (no time-of-day) and
 * Banguat's calendar-month framing.
 */

export type PeriodKey = '1m' | '3m' | '6m' | '12m' | 'custom';

export interface ParsedPeriod {
  key: PeriodKey;
  from: Date;
  to: Date;
}

export const DEFAULT_PERIOD: PeriodKey = '6m';

const KNOWN_KEYS: ReadonlySet<string> = new Set<PeriodKey>(['1m', '3m', '6m', '12m', 'custom']);

const MONTHS_FOR_KEY: Record<Exclude<PeriodKey, 'custom'>, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '12m': 12,
};

function startOfDayUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfMonthUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthsAgoUTC(reference: Date, months: number): Date {
  /*
   * `months` back from `reference`'s first-of-month. So `1m` means
   * "the current month so far" (from=first-of-this-month). `6m` means
   * "the last 6 calendar months including this one" — six rows in
   * `monthlyCashFlow` from Batch 6.
   */
  const ref = startOfMonthUTC(reference);
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - (months - 1), 1));
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  // Strict YYYY-MM-DD shape; reject anything else.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function parsePeriod(searchParams: URLSearchParams, now: Date = new Date()): ParsedPeriod {
  const today = startOfDayUTC(now);
  const rawKey = searchParams.get('period');

  if (rawKey === 'custom') {
    const from = parseIsoDate(searchParams.get('from'));
    const to = parseIsoDate(searchParams.get('to'));
    if (from && to && from.getTime() <= to.getTime()) {
      return { key: 'custom', from, to };
    }
    // Invalid custom range → fall through to default.
  }

  const key: PeriodKey =
    rawKey && KNOWN_KEYS.has(rawKey) && rawKey !== 'custom'
      ? (rawKey as Exclude<PeriodKey, 'custom'>)
      : DEFAULT_PERIOD;

  const months = MONTHS_FOR_KEY[key as Exclude<PeriodKey, 'custom'>];
  return {
    key,
    from: monthsAgoUTC(today, months),
    to: today,
  };
}

/**
 * Build the search-param string a `<Link>` or `router.push()` should
 * carry to land on a given period. Returns just the query body
 * (no leading `?`).
 */
export function periodToSearchParams(period: ParsedPeriod): string {
  const params = new URLSearchParams();
  params.set('period', period.key);
  if (period.key === 'custom') {
    params.set('from', period.from.toISOString().slice(0, 10));
    params.set('to', period.to.toISOString().slice(0, 10));
  }
  return params.toString();
}
