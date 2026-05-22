import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/primitives/money';
import { PeriodPicker } from '@/components/reports/period-picker';
import { ReportsEmptyState } from '@/components/reports/empty-state';
import { topMerchants } from '@/lib/reports/aggregations';
import { parsePeriod } from '@/lib/reports/period';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';

/**
 * /reportes/comercios — Top Merchants report (Phase 6/7 Batch 7).
 *
 * Server component. Reads the period, fetches the tenant-scoped
 * transactions in range, computes `topMerchants` (limit=10), and
 * renders a sortable-looking table. No chart needed — per dataviz
 * research, top-merchants is best as a list (Rocket Money pattern);
 * a horizontal bar chart would duplicate the table's information.
 */

const MERCHANTS_LIMIT = 10;

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  const t = await getTranslations('reports.merchants');
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

export default async function MerchantsReportPage({ searchParams }: PageProps) {
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

  const t = await getTranslations('reports.merchants');
  const tColumns = await getTranslations('reports.merchants.columns');

  const data = topMerchants(transactions, {
    from: period.from,
    to: period.to,
    limit: MERCHANTS_LIMIT,
  });

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
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-base">{t('tableCaption')}</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ifa-gray-700 border-b border-gray-200 text-left text-xs tracking-wide uppercase">
                  <th className="py-2">{tColumns('merchant')}</th>
                  <th className="py-2">{tColumns('nit')}</th>
                  <th className="py-2 text-right">{tColumns('total')}</th>
                  <th className="py-2 text-right">{tColumns('visits')}</th>
                  <th className="py-2 text-right">{tColumns('average')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => {
                  const display = row.merchantName ?? row.merchantNit ?? t('unknownLabel');
                  return (
                    <tr key={`${display}-${String(i)}`} className="border-b border-gray-100">
                      <td className="text-ifa-navy-900 py-2 font-medium">{display}</td>
                      <td className="text-ifa-gray-700 py-2">
                        {row.merchantNit ?? <span className="text-ifa-gray-500">—</span>}
                      </td>
                      <td className="py-2 text-right">
                        <Money amount={row.total} />
                      </td>
                      <td className="text-ifa-gray-700 py-2 text-right tabular-nums">
                        {row.count}
                      </td>
                      <td className="text-ifa-gray-700 py-2 text-right">
                        <Money amount={row.total / row.count} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
