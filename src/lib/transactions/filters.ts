import type { ReconciliationStatus, TransactionSource } from '@prisma/client';

/**
 * Client-side filter state for the `/transacciones` feed (S-3.7).
 *
 * Source of truth lives in the URL query string so filter state is
 * shareable per the story's acceptance criteria. These helpers are
 * pure — they convert between a plain object and URLSearchParams.
 * Everything optional; absent = no filter.
 */

const SOURCE_VALUES: TransactionSource[] = ['FEL', 'TPV', 'BANK_CSV', 'MANUAL'];
const RECONCILIATION_STATUS_VALUES: ReconciliationStatus[] = [
  'UNMATCHED',
  'MATCHED',
  'MANUAL_MATCH',
  'EXCLUDED',
];

export interface FeedFilters {
  q?: string;
  source?: TransactionSource;
  reconciliationStatus?: ReconciliationStatus;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
}

export function filtersFromSearchParams(params: URLSearchParams): FeedFilters {
  const filters: FeedFilters = {};
  const q = params.get('q');
  if (q) filters.q = q;
  const source = params.get('source');
  if (source && (SOURCE_VALUES as string[]).includes(source)) {
    filters.source = source as TransactionSource;
  }
  const reconciliationStatus = params.get('reconciliationStatus');
  if (
    reconciliationStatus &&
    (RECONCILIATION_STATUS_VALUES as string[]).includes(reconciliationStatus)
  ) {
    filters.reconciliationStatus = reconciliationStatus as ReconciliationStatus;
  }
  const dateFrom = params.get('dateFrom');
  if (dateFrom && isIsoDate(dateFrom)) filters.dateFrom = dateFrom;
  const dateTo = params.get('dateTo');
  if (dateTo && isIsoDate(dateTo)) filters.dateTo = dateTo;
  const amountMin = parseFiniteNumber(params.get('amountMin'));
  if (amountMin !== undefined) filters.amountMin = amountMin;
  const amountMax = parseFiniteNumber(params.get('amountMax'));
  if (amountMax !== undefined) filters.amountMax = amountMax;
  return filters;
}

export function filtersToSearchParams(filters: FeedFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.source) params.set('source', filters.source);
  if (filters.reconciliationStatus) {
    params.set('reconciliationStatus', filters.reconciliationStatus);
  }
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.amountMin !== undefined) params.set('amountMin', String(filters.amountMin));
  if (filters.amountMax !== undefined) params.set('amountMax', String(filters.amountMax));
  return params;
}

export function isFilterEmpty(filters: FeedFilters): boolean {
  return (
    !filters.q &&
    !filters.source &&
    !filters.reconciliationStatus &&
    !filters.dateFrom &&
    !filters.dateTo &&
    filters.amountMin === undefined &&
    filters.amountMax === undefined
  );
}

function parseFiniteNumber(raw: string | null): number | undefined {
  if (raw === null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

export const FEED_SOURCE_VALUES = SOURCE_VALUES;
export const FEED_RECONCILIATION_STATUS_VALUES = RECONCILIATION_STATUS_VALUES;
