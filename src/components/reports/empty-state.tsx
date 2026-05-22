import Link from 'next/link';
import { FileUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * Empty-state for the report routes — Phase 6/7 Batch 7.
 *
 * Per dataviz research (§5.1 Adopt #8): empty states are an activation
 * surface, not an apology. Never render a flat/empty chart — that
 * signals broken software. This component shows a friendly prompt and
 * an upload CTA so the user has a concrete next action.
 */
export function ReportsEmptyState() {
  const t = useTranslations('reports.empty');

  return (
    <div className="border-ifa-gray-200 mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border bg-white px-6 py-10 text-center">
      <h2 className="text-ifa-navy-900 text-lg font-semibold">{t('title')}</h2>
      <p className="text-ifa-gray-700 text-sm">{t('body')}</p>
      <Button asChild>
        <Link href="/transacciones/importar" className="gap-2">
          <FileUp className="size-4" aria-hidden />
          {t('uploadCta')}
        </Link>
      </Button>
    </div>
  );
}
