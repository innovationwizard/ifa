import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TransactionsFeed } from '@/components/transactions/feed';

export async function generateMetadata() {
  const t = await getTranslations('transactions');
  return { title: t('title') };
}

/**
 * /transacciones — transaction feed (S-3.7).
 *
 * Auth + profile + tenant gating handled by the (app) layout. This
 * server component is a thin shell: page chrome plus the client-side
 * virtualized feed which owns URL-synced filter state + fetching.
 */
export default async function TransaccionesPage() {
  const t = await getTranslations('transactions');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/transacciones/importar" className="gap-2">
            <FileUp className="size-4" aria-hidden />
            {t('importCta')}
          </Link>
        </Button>
      </header>

      <TransactionsFeed />
    </div>
  );
}
