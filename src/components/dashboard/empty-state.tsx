import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { FileUp, Download, Upload, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyDashboardProps {
  firstName: string;
}

/**
 * Dashboard zero-transaction empty state.
 *
 * Shown to every just-onboarded INDIVIDUAL user until their first
 * statement upload lands rows in `transactions`. The primary CTA is
 * "upload a bank statement" — this is the default ingestion pipeline
 * per scaffolding §10.4.1 (Phase A: traction-building), and will
 * stay the default indefinitely for any user whose bank hasn't (yet)
 * opened an API.
 *
 * Copy must NOT:
 *   - promise "direct bank connection coming soon" (§10.4.3)
 *   - frame statement upload as a fallback or workaround
 *   - use accounting / finance jargon (feedback_vocabulary memory)
 *
 * The CTA links to `/transacciones/importar` — the CSV import wizard
 * landed in S-3.5/S-3.6. Multi-format ingestion (PDF, XLS, OFX, QIF)
 * arrives in the immediately-after-MVP follow-up per the Holy Grail
 * memory.
 */
export async function EmptyDashboard({ firstName }: EmptyDashboardProps) {
  const t = await getTranslations('dashboard.empty');

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-8">
      <div className="bg-ifa-white rounded-ifa-card shadow-ifa-card flex flex-col gap-6 p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="bg-ifa-teal-100 text-ifa-teal-600 flex size-16 items-center justify-center rounded-full">
            <FileUp className="size-7" aria-hidden />
          </div>
          <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">
            {t('greeting', { name: firstName })}
          </h1>
          <p className="text-ifa-gray-700 text-sm leading-relaxed">{t('lead')}</p>
        </div>

        <ol className="flex flex-col gap-4">
          <Step icon={<Download className="size-4" aria-hidden />} number={1}>
            {t('step1')}
          </Step>
          <Step icon={<Upload className="size-4" aria-hidden />} number={2}>
            {t('step2')}
          </Step>
          <Step icon={<Sparkles className="size-4" aria-hidden />} number={3}>
            {t('step3')}
          </Step>
        </ol>

        <Button asChild className="w-full">
          <Link href="/transacciones/importar">{t('cta')}</Link>
        </Button>
      </div>

      <p className="text-ifa-gray-500 text-center text-xs">{t('privacyNote')}</p>
    </div>
  );
}

function Step({
  icon,
  number,
  children,
}: {
  icon: React.ReactNode;
  number: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="bg-ifa-navy-100 text-ifa-navy-700 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums">
        {number}
      </span>
      <div className="flex flex-1 items-start gap-2 pt-1">
        <span className="text-ifa-teal-600 mt-0.5">{icon}</span>
        <span className="text-ifa-gray-700 text-sm leading-relaxed">{children}</span>
      </div>
    </li>
  );
}
