import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/primitives/money';
import { CategoryBarChart } from '@/components/reports/category-bar-chart';
import { PeriodPicker } from '@/components/reports/period-picker';
import { ReportsEmptyState } from '@/components/reports/empty-state';
import { spendingByCategory } from '@/lib/reports/aggregations';
import { rollupCategories } from '@/lib/reports/rollup';
import { parsePeriod } from '@/lib/reports/period';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';

/**
 * /reportes/gastos — Spending by Category report (Phase 6/7 Batch 7).
 *
 * Server component. Reads the period, fetches the tenant-scoped
 * transactions in range, computes `spendingByCategory`, rolls the
 * long tail into "Otros" beyond the top 6, and renders horizontal
 * bars + a table mirror.
 */

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  const t = await getTranslations('reports.categories');
  return { title: t('title') };
}

function toSearchParamsRecord(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out.set(k, v);
    else if (Array.isArray(v) && v.length > 0 && v[0] !== undefined) out.set(k, v[0]);
  }
  return out;
}

export default async function CategoriesReportPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');
  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const resolved = await searchParams;
  const period = parsePeriod(toSearchParamsRecord(resolved));

  const transactions = await withTenant({ profileId: profile.id, userId: user.id }, () =>
    transactionRepo.listAllForReports({ from: period.from, to: period.to }),
  );

  const t = await getTranslations('reports.categories');
  const tColumns = await getTranslations('reports.categories.columns');

  const raw = spendingByCategory(transactions, { from: period.from, to: period.to });
  const data = rollupCategories(raw, { limit: 6, othersLabel: t('othersBucket') });
  const total = data.reduce((s, r) => s + r.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
        </div>
        <PeriodPicker current={period.key} />
      </header>

      {data.length === 0 ? (
        <ReportsEmptyState />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBarChart data={data} />
            </CardContent>
          </Card>

          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-base">{t('tableCaption')}</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ifa-gray-700 border-b border-gray-200 text-left text-xs tracking-wide uppercase">
                    <th className="py-2">{tColumns('category')}</th>
                    <th className="py-2 text-right">{tColumns('total')}</th>
                    <th className="py-2 text-right">{tColumns('share')}</th>
                    <th className="py-2 text-right">{tColumns('count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.category} className="border-b border-gray-100">
                      <td className="text-ifa-navy-900 py-2 font-medium">{row.category}</td>
                      <td className="py-2 text-right">
                        <Money amount={row.total} />
                      </td>
                      <td className="text-ifa-gray-700 py-2 text-right tabular-nums">
                        {row.percent.toFixed(1)}%
                      </td>
                      <td className="text-ifa-gray-700 py-2 text-right tabular-nums">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-300">
                    <td className="text-ifa-navy-900 py-2 font-semibold">Total</td>
                    <td className="py-2 text-right font-semibold">
                      <Money amount={total} />
                    </td>
                    <td className="py-2 text-right tabular-nums">100%</td>
                    <td className="py-2" />
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
