'use client';

import { useTranslations } from 'next-intl';
import { Download, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';

interface BulkActionsBarProps {
  selectedCount: number;
  onExportCsv: () => void;
  onClear: () => void;
}

/**
 * Action bar shown above the feed when ≥1 row is selected (S-3.10).
 *
 * Three affordances:
 *   - Categorize — dropdown intentionally empty in MVP. The
 *     `Transaction.category` column accepts free-form text but we
 *     ship no suggestions here; the real catalog + AI suggestions
 *     land with S-7.2. The dropdown exists so the UI shape is
 *     locked in and future work slots in without a layout shift.
 *   - Export CSV — fully functional. Client-side assembly, one
 *     file per click, download triggered via `downloadRowsAsCsv`.
 *   - Clear selection — resets the parent's selection state.
 *
 * Mark-reviewed is deliberately absent: the schema has no
 * `reviewed` column, and shipping a fake button that does nothing
 * would violate the same "no fake actions" rule that kept the
 * S-3.9 reconciliation queue honest.
 */
export function BulkActionsBar({ selectedCount, onExportCsv, onClear }: BulkActionsBarProps) {
  const t = useTranslations('transactions.bulk');

  return (
    <div className="bg-ifa-navy-50 border-ifa-navy-100 flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
      <span className="text-ifa-navy-900 text-sm font-medium">
        {t('selectedCount', { count: selectedCount })}
      </span>

      <div className="flex items-center gap-2 text-xs">
        <Tag className="text-ifa-gray-500 size-3.5" aria-hidden />
        <Select disabled value="">
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder={t('categorizePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {/*
             * Empty on purpose. Once the category catalog lands the
             * items render here and the Select flips to enabled.
             */}
          </SelectContent>
        </Select>
        <span className="text-ifa-gray-500">{t('categorizeSoon')}</span>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={onExportCsv} className="gap-1.5">
        <Download className="size-3.5" aria-hidden />
        {t('exportCsv')}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="ml-auto gap-1 text-xs"
      >
        <X className="size-3" aria-hidden />
        {t('clear')}
      </Button>
    </div>
  );
}
