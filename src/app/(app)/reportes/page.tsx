import Link from 'next/link';
import { ArrowRight, BarChart3, PieChart, Store } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * /reportes — Phase 6/7 Batch 7 hub.
 *
 * Three cards linking to the three INDIVIDUAL-tier reports defined
 * in the Phase 6 redefinition table (\_PHASE_6_7_PLAN.md §1):
 * Monthly Cash Flow, Spending by Category, Top Merchants.
 *
 * Tenant gating is inherited from `(app)/layout.tsx`.
 */

export async function generateMetadata() {
  const t = await getTranslations('reports.hub');
  return { title: t('title') };
}

interface ReportCard {
  href: string;
  icon: typeof BarChart3;
  i18nKey: 'cashFlow' | 'categories' | 'merchants';
}

const REPORT_CARDS: ReportCard[] = [
  { href: '/reportes/flujo', icon: BarChart3, i18nKey: 'cashFlow' },
  { href: '/reportes/gastos', icon: PieChart, i18nKey: 'categories' },
  { href: '/reportes/comercios', icon: Store, i18nKey: 'merchants' },
];

export default async function ReportesHubPage() {
  const t = await getTranslations('reports.hub');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="focus-visible:ring-ifa-teal-500 rounded-xl focus-visible:ring-2 focus-visible:outline-none"
            >
              <Card className="hover:border-ifa-teal-500 h-full transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="text-ifa-teal-600 size-5" aria-hidden />
                    {t(`cards.${card.i18nKey}.title`)}
                  </CardTitle>
                  <CardDescription>{t(`cards.${card.i18nKey}.description`)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-ifa-teal-600 inline-flex items-center gap-1 text-sm font-medium">
                    {t('openCta')}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
