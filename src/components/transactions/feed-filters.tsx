'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FEED_RECONCILIATION_STATUS_VALUES,
  FEED_SOURCE_VALUES,
  isFilterEmpty,
  type FeedFilters,
} from '@/lib/transactions/filters';

interface FeedFiltersPanelProps {
  filters: FeedFilters;
  onChange: (next: FeedFilters) => void;
  onClear: () => void;
}

const DEBOUNCE_MS = 300;

/*
 * Radix's Select doesn't accept empty-string as a SelectItem value —
 * we use this sentinel for the "any" option and map it back to
 * `undefined` on the way out. Any string that can't appear in the
 * real enum sets works; leading-underscore form keeps it visually
 * distinct in devtools.
 */
const ANY_SENTINEL = '__any__';

/**
 * Filter sidebar for the transaction feed.
 *
 * Search box runs through a 300ms debounce so every keystroke doesn't
 * hit the API. Every other field updates immediately on change —
 * selects, date pickers, amount ranges — since those are deliberate
 * user actions.
 *
 * All changes bubble up through `onChange`; parent owns URL sync.
 */
export function FeedFiltersPanel({ filters, onChange, onClear }: FeedFiltersPanelProps) {
  const t = useTranslations('transactions.filters');
  const externalQ = filters.q ?? '';
  const [qDraft, setQDraft] = useState(externalQ);
  const [lastSeenExternalQ, setLastSeenExternalQ] = useState(externalQ);

  /*
   * React-recommended "reset state on prop change" pattern (docs:
   * "Adjusting some state when a prop changes"). Setting during render
   * is safe + compiler-friendly; no effect-based sync needed.
   */
  if (externalQ !== lastSeenExternalQ) {
    setLastSeenExternalQ(externalQ);
    setQDraft(externalQ);
  }

  // Debounced push of search text → filters.
  useEffect(() => {
    const next = qDraft.trim();
    const current = filters.q ?? '';
    if (next === current) return;
    const handle = setTimeout(() => {
      const { q: _q, ...rest } = filters;
      onChange(next ? { ...rest, q: next } : rest);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
    };
  }, [qDraft, filters, onChange]);

  function update<K extends keyof FeedFilters>(key: K, value: FeedFilters[K] | undefined): void {
    const { [key]: _removed, ...rest } = filters;
    onChange(value === undefined || value === '' ? rest : { ...rest, [key]: value });
  }

  return (
    <aside className="bg-ifa-white rounded-ifa-card shadow-ifa-card flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-ifa-navy-900 text-sm font-semibold">{t('heading')}</h2>
        {!isFilterEmpty(filters) && (
          <Button variant="ghost" size="sm" onClick={onClear} className="gap-1 text-xs">
            <X className="size-3" aria-hidden />
            {t('clear')}
          </Button>
        )}
      </div>

      <FilterField label={t('search')}>
        <Input
          type="search"
          value={qDraft}
          onChange={(e) => {
            setQDraft(e.target.value);
          }}
          placeholder={t('searchPlaceholder')}
          autoComplete="off"
        />
      </FilterField>

      <FilterField label={t('source')}>
        <Select
          value={filters.source ?? ANY_SENTINEL}
          onValueChange={(v) => {
            update('source', v === ANY_SENTINEL ? undefined : (v as FeedFilters['source']));
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_SENTINEL}>{t('anySource')}</SelectItem>
            {FEED_SOURCE_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`sourceValues.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterField label={t('status')}>
        <Select
          value={filters.reconciliationStatus ?? ANY_SENTINEL}
          onValueChange={(v) => {
            update(
              'reconciliationStatus',
              v === ANY_SENTINEL ? undefined : (v as FeedFilters['reconciliationStatus']),
            );
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_SENTINEL}>{t('anyStatus')}</SelectItem>
            {FEED_RECONCILIATION_STATUS_VALUES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`statusValues.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <div className="grid grid-cols-2 gap-2">
        <FilterField label={t('dateFrom')}>
          <Input
            type="date"
            value={filters.dateFrom ?? ''}
            onChange={(e) => {
              update('dateFrom', e.target.value || undefined);
            }}
          />
        </FilterField>
        <FilterField label={t('dateTo')}>
          <Input
            type="date"
            value={filters.dateTo ?? ''}
            onChange={(e) => {
              update('dateTo', e.target.value || undefined);
            }}
          />
        </FilterField>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <FilterField label={t('amountMin')}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={filters.amountMin ?? ''}
            onChange={(e) => {
              const n = e.target.value === '' ? undefined : Number(e.target.value);
              update('amountMin', Number.isFinite(n) ? n : undefined);
            }}
          />
        </FilterField>
        <FilterField label={t('amountMax')}>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={filters.amountMax ?? ''}
            onChange={(e) => {
              const n = e.target.value === '' ? undefined : Number(e.target.value);
              update('amountMax', Number.isFinite(n) ? n : undefined);
            }}
          />
        </FilterField>
      </div>
    </aside>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-ifa-gray-700 text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}
