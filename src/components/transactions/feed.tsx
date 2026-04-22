'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, FileUp, Loader2 } from 'lucide-react';
import { Money } from '@/components/primitives/money';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  filtersFromSearchParams,
  filtersToSearchParams,
  isFilterEmpty,
  type FeedFilters,
} from '@/lib/transactions/filters';
import { downloadRowsAsCsv } from '@/lib/transactions/csv-export';
import { FeedFiltersPanel } from './feed-filters';
import { BulkActionsBar } from './bulk-actions-bar';

/**
 * Virtualized transaction feed (S-3.7).
 *
 * Source of truth for filter state is the URL query string — changes
 * in the sidebar push replace-history updates to the URL, and the
 * feed re-reads them on every render so back/forward works out of
 * the box.
 *
 * Pagination: keyset cursor from the /api/v1/transactions list
 * response. Scroll near the bottom → fetch next page. Fresh filter
 * change → reset cursor + rows.
 *
 * Virtualization: `useVirtualizer` with a fixed row height estimate.
 * Overscan of 8 rows keeps scrolling smooth on fast drags.
 */

const ROW_HEIGHT_PX = 60;
const INFINITE_SCROLL_TRIGGER_PX = 200;
const PAGE_LIMIT = 100;

interface FeedRow {
  id: string;
  date: string;
  description: string;
  merchantName: string | null;
  merchantNit: string | null;
  amount: string;
  currency: string;
  source: string;
  reconciliationStatus: string;
  type: string;
}

interface PageResponse {
  data: Record<string, unknown>[];
  meta: {
    hasMore: boolean;
    nextCursor: { id: string; date: string } | null;
  };
}

export function TransactionsFeed() {
  const t = useTranslations('transactions');
  const router = useRouter();
  const pathname = usePathname();
  const rawSearchParams = useSearchParams();

  const filters = useMemo(
    () => filtersFromSearchParams(new URLSearchParams(rawSearchParams.toString())),
    [rawSearchParams],
  );
  const filtersKey = rawSearchParams.toString();

  const [rows, setRows] = useState<FeedRow[]>([]);
  const [cursor, setCursor] = useState<{ id: string; date: string } | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const fetchPage = useCallback(
    async (
      currentFilters: FeedFilters,
      currentCursor: { id: string; date: string } | null,
    ): Promise<void> => {
      setStatus('loading');
      setErrorMessage(null);
      try {
        const params = filtersToSearchParams(currentFilters);
        params.set('limit', String(PAGE_LIMIT));
        if (currentCursor) {
          params.set('cursorId', currentCursor.id);
          params.set('cursorDate', currentCursor.date);
        }
        const response = await fetch(`/api/v1/transactions?${params.toString()}`);
        if (!response.ok) {
          setStatus('error');
          setErrorMessage(t('feed.loadError'));
          return;
        }
        const body = (await response.json()) as PageResponse;
        const page = body.data.map(toFeedRow);
        setRows((prev) => (currentCursor ? [...prev, ...page] : page));
        setCursor(body.meta.nextCursor);
        setHasMore(body.meta.hasMore);
        setStatus('idle');
      } catch {
        setStatus('error');
        setErrorMessage(t('feed.loadError'));
      }
    },
    [t],
  );

  /*
   * Fresh filter keystring → reset list + fetch first page. Depending
   * on the string (not the filters object) avoids spurious refetches
   * from referential re-creation of the filters object on each render.
   */
  useEffect(() => {
    setRows([]);
    setCursor(null);
    setHasMore(true);
    setSelectedIds(new Set());
    void fetchPage(filtersFromSearchParams(new URLSearchParams(filtersKey)), null);
  }, [filtersKey, fetchPage]);

  const onChangeFilters = useCallback(
    (next: FeedFilters) => {
      const params = filtersToSearchParams(next);
      const queryString = params.toString();
      /*
       * Replace (not push) so the back button doesn't walk through
       * every keystroke of the filter. Shareable URLs still work — a
       * pasted URL lands with the full filter state on first render.
       */
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const onClearFilters = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 8,
  });

  // Infinite scroll — load next page when the user nears the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onScroll() {
      if (!el || status === 'loading' || !hasMore || !cursor) return;
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distanceFromBottom < INFINITE_SCROLL_TRIGGER_PX) {
        void fetchPage(filtersFromSearchParams(new URLSearchParams(filtersKey)), cursor);
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [status, hasMore, cursor, fetchPage, filtersKey]);

  const showEmpty = status === 'idle' && rows.length === 0;
  const emptyVariant: 'filtered' | 'zero' = isFilterEmpty(filters) ? 'zero' : 'filtered';

  const allLoadedSelected = rows.length > 0 && selectedIds.size === rows.length;
  const toggleMaster = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === rows.length && rows.length > 0) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  const exportSelected = useCallback(() => {
    const selected = rows.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    downloadRowsAsCsv(selected);
  }, [rows, selectedIds]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <FeedFiltersPanel filters={filters} onChange={onChangeFilters} onClear={onClearFilters} />

      <div className="flex flex-col gap-3">
        {selectedIds.size > 0 && (
          <BulkActionsBar
            selectedCount={selectedIds.size}
            onExportCsv={exportSelected}
            onClear={clearSelection}
          />
        )}

        <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card flex flex-col overflow-hidden">
          {errorMessage && (
            <Alert variant="destructive" role="alert" className="m-4">
              <AlertDescription className="flex items-center gap-2">
                <AlertTriangle className="size-3.5" aria-hidden />
                {errorMessage}
              </AlertDescription>
            </Alert>
          )}

          {rows.length > 0 && (
            <div className="border-ifa-gray-300 flex items-center gap-3 border-b px-4 py-2">
              <Checkbox
                checked={allLoadedSelected}
                onCheckedChange={toggleMaster}
                aria-label={t('bulk.selectAll')}
              />
              <span className="text-ifa-gray-500 text-xs tracking-wide uppercase">
                {t('bulk.selectAll')}
              </span>
              {hasMore && (
                <span className="text-ifa-gray-500 ml-auto text-xs">{t('bulk.loadedNote')}</span>
              )}
            </div>
          )}

          <div
            ref={scrollRef}
            className="relative h-[calc(100vh-280px)] min-h-[400px] overflow-y-auto"
          >
            {showEmpty ? (
              <EmptyState variant={emptyVariant} />
            ) : (
              <>
                <div
                  style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
                  role="list"
                >
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    if (!row) return null;
                    return (
                      <TransactionRow
                        key={row.id}
                        row={row}
                        top={virtualRow.start}
                        height={ROW_HEIGHT_PX}
                        selected={selectedIds.has(row.id)}
                        onToggleSelected={toggleRow}
                      />
                    );
                  })}
                </div>
                {status === 'loading' && (
                  <div className="text-ifa-gray-500 flex items-center justify-center gap-2 py-4 text-xs">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t('feed.loading')}
                  </div>
                )}
                {!hasMore && rows.length > 0 && (
                  <div className="text-ifa-gray-500 py-4 text-center text-xs">
                    {t('feed.endOfList')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionRow({
  row,
  top,
  height,
  selected,
  onToggleSelected,
}: {
  row: FeedRow;
  top: number;
  height: number;
  selected: boolean;
  onToggleSelected: (id: string) => void;
}) {
  const t = useTranslations('transactions');
  const amountValue = Number(row.amount);
  return (
    <div
      role="listitem"
      className={`border-ifa-gray-300 absolute right-0 left-0 flex items-center gap-3 border-b pr-4 pl-4 transition-colors ${selected ? 'bg-ifa-navy-50' : 'hover:bg-ifa-navy-50'}`}
      style={{ top, height }}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => {
          onToggleSelected(row.id);
        }}
        aria-label={t('bulk.selectRow')}
      />
      <Link
        href={`/transacciones/${row.id}`}
        className="focus-visible:bg-ifa-navy-100 grid flex-1 grid-cols-[100px_minmax(0,1fr)_110px_140px_90px] items-center gap-3 rounded-sm outline-none"
        style={{ height: height - 16 }}
      >
        <span className="text-ifa-gray-700 text-xs tabular-nums">{row.date}</span>
        <span className="text-ifa-navy-900 truncate text-sm">{row.description}</span>
        <Money
          amount={amountValue}
          currency={row.currency}
          className={amountValue < 0 ? 'text-ifa-gray-700' : 'text-ifa-teal-600'}
        />
        <span className="text-ifa-gray-500 truncate text-xs">
          {row.merchantName ?? row.merchantNit ?? '—'}
        </span>
        <span className="text-ifa-gray-500 truncate text-right text-xs tracking-wide uppercase">
          {t(`sources.${row.source}`, { default: row.source })}
        </span>
      </Link>
    </div>
  );
}

function EmptyState({ variant }: { variant: 'zero' | 'filtered' }) {
  const t = useTranslations('transactions');
  if (variant === 'filtered') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-ifa-gray-700 text-sm">{t('feed.emptyFiltered')}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="text-ifa-gray-700 max-w-sm text-sm">{t('feed.emptyZero')}</p>
      <Button asChild>
        <Link href="/transacciones/importar" className="gap-2">
          <FileUp className="size-4" aria-hidden />
          {t('importCta')}
        </Link>
      </Button>
    </div>
  );
}

function toFeedRow(raw: Record<string, unknown>): FeedRow {
  /*
   * The list API returns raw Prisma rows. JSON serialization emits
   * Decimal as strings and Date as ISO strings. We pluck the subset
   * the feed renders; full fidelity stays on the detail page.
   */
  return {
    id: pickString(raw.id),
    date: typeof raw.date === 'string' ? raw.date.slice(0, 10) : '',
    description: pickString(raw.description),
    merchantName: pickNullableString(raw.merchantName),
    merchantNit: pickNullableString(raw.merchantNit),
    amount: pickString(raw.amount, '0'),
    currency: pickString(raw.currency, 'GTQ'),
    source: pickString(raw.source),
    reconciliationStatus: pickString(raw.reconciliationStatus),
    type: pickString(raw.type),
  };
}

function pickString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function pickNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
