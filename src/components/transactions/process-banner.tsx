'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { processPendingJobs } from '@/app/(app)/transacciones/actions';

/**
 * Contextual "you have X movimientos por procesar" banner for
 * `/transacciones` (ADR-001).
 *
 * Renders only when `pendingCount > 0`; the parent server component
 * is responsible for checking `jobQueue.countPendingForProfile` and
 * either rendering or omitting this component. That keeps the
 * "no pending jobs" path SSR-free with zero JS shipped.
 *
 * Click handler calls the `processPendingJobs` server action via
 * `useTransition` so we get the pending state for the spinner.
 * After the action resolves it returns a summary, but we don't
 * surface counts in the UI: the action revalidates `/transacciones`,
 * so the next render either omits this banner (count → 0) or shows
 * the residual count (some jobs failed). Honest by construction.
 */

interface ProcessBannerProps {
  pendingCount: number;
}

export function ProcessBanner({ pendingCount }: ProcessBannerProps) {
  const t = useTranslations('transactions.processBanner');
  const [isPending, startTransition] = useTransition();

  if (pendingCount <= 0) return null;

  return (
    <div className="bg-ifa-teal-50 border-ifa-teal-200 flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="bg-ifa-teal-100 text-ifa-teal-700 flex size-9 shrink-0 items-center justify-center rounded-full">
          <Sparkles className="size-4" aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="text-ifa-navy-900 text-sm font-medium">
            {t('headline', { count: pendingCount })}
          </p>
          <p className="text-ifa-gray-700 text-xs">{t('description')}</p>
        </div>
      </div>
      <Button
        size="sm"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await processPendingJobs();
          });
        }}
        className="w-full sm:w-auto"
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            <span>{t('processing')}</span>
          </>
        ) : (
          t('cta')
        )}
      </Button>
    </div>
  );
}
