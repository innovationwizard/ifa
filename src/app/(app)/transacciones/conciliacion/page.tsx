import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ReconciliationQueue } from '@/components/transactions/reconciliation-queue';

export async function generateMetadata() {
  const t = await getTranslations('reconciliationQueue');
  return { title: t('title') };
}

/**
 * /transacciones/conciliacion — reconciliation queue placeholder
 * (S-3.9). UI scaffold only; the real matching engine + manual-
 * match interface land in Phase 4 (S-4.1 → S-4.7).
 *
 * Shows the current `UNMATCHED` transactions so users have a
 * preview of the queue that will become actionable once FEL and
 * TPV feeds are wired. No manual-match button here — per the
 * acceptance criterion, we don't ship fake affordances.
 *
 * Auth + profile + tenant gating handled by the (app) layout.
 */
export default async function ConciliacionPage() {
  const t = await getTranslations('reconciliationQueue');

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/transacciones"
        className="text-ifa-gray-500 hover:text-ifa-navy-700 flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {t('back')}
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
      </header>

      <Alert>
        <AlertTitle className="flex items-center gap-2">
          <Info className="size-4" aria-hidden />
          {t('soon.title')}
        </AlertTitle>
        <AlertDescription className="text-xs">{t('soon.body')}</AlertDescription>
      </Alert>

      <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card p-4 sm:p-6">
        <ReconciliationQueue />
      </div>
    </div>
  );
}
