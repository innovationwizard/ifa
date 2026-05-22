import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProcessBanner } from '@/components/transactions/process-banner';
import { TransactionsFeed } from '@/components/transactions/feed';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { jobQueue } from '@/lib/jobs/queue';

export async function generateMetadata() {
  const t = await getTranslations('transactions');
  return { title: t('title') };
}

/**
 * /transacciones — transaction feed (S-3.7).
 *
 * Auth + profile gating handled by the (app) layout. This server
 * component is a thin shell: page chrome plus the client-side
 * virtualized feed which owns URL-synced filter state + fetching.
 *
 * ADR-001 (2026-05-22): when this profile has PENDING jobs, render
 * a "Procesar ahora" banner above the feed. Replaces the every-minute
 * cron drain that shipped in B4.
 */
export default async function TransaccionesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');
  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const pendingCount = await jobQueue.countPendingForProfile(profile.id);
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

      <ProcessBanner pendingCount={pendingCount} />

      <TransactionsFeed />
    </div>
  );
}
