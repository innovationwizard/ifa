'use client';

import { useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { type PeriodKey } from '@/lib/reports/period';

/**
 * URL-synced period picker for the reports UI (Phase 6/7 Batch 7).
 *
 * Reads/writes the `period` search param so a server component on the
 * same route can read the parsed period via `parsePeriod()` and
 * server-render the corresponding chart. No client-side state — the
 * URL is the source of truth.
 *
 * Renders as a segmented control matching Copilot Money's convention
 * (`Mes / 3M / 6M / Año / Personalizado`) per the dataviz research.
 * "Personalizado" is rendered as a button that links to a date-input
 * dialog in a later iteration; for B7 it acts as the visible label for
 * any already-active custom range and is disabled-looking when no
 * custom range is set (clicking it is a no-op).
 */

interface PeriodPickerProps {
  current: PeriodKey;
}

interface Option {
  key: PeriodKey;
  i18nKey: string;
}

const OPTIONS: Option[] = [
  { key: '1m', i18nKey: 'month' },
  { key: '3m', i18nKey: 'threeMonths' },
  { key: '6m', i18nKey: 'sixMonths' },
  { key: '12m', i18nKey: 'year' },
];

export function PeriodPicker({ current }: PeriodPickerProps) {
  const t = useTranslations('reports.period');
  const router = useRouter();
  const pathname = usePathname();
  const rawSearchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSelect = useCallback(
    (next: PeriodKey) => {
      if (next === current) return;
      const params = new URLSearchParams(rawSearchParams.toString());
      params.set('period', next);
      /*
       * Drop any leftover from/to from a previous `custom` selection
       * when switching to a preset — otherwise the URL keeps stale
       * dates that confuse the next custom toggle.
       */
      if (next !== 'custom') {
        params.delete('from');
        params.delete('to');
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [current, rawSearchParams, router, pathname],
  );

  return (
    <div
      className="border-ifa-gray-200 inline-flex rounded-md border bg-white p-1"
      role="group"
      aria-label={t('label')}
      data-pending={isPending ? 'true' : undefined}
    >
      {OPTIONS.map((opt) => {
        const isActive = opt.key === current;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => {
              handleSelect(opt.key);
            }}
            aria-pressed={isActive}
            className={cn(
              'min-h-[36px] min-w-[44px] rounded-sm px-3 text-sm font-medium transition-colors',
              isActive ? 'bg-ifa-navy-900 text-white' : 'text-ifa-gray-700 hover:bg-ifa-gray-100',
            )}
          >
            {t(opt.i18nKey)}
          </button>
        );
      })}
      {current === 'custom' && (
        <span className="bg-ifa-teal-500 ml-1 inline-flex items-center rounded-sm px-3 text-sm font-medium text-white">
          {t('custom')}
        </span>
      )}
    </div>
  );
}
