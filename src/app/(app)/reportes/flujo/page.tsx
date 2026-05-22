import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/primitives/money';
import { CashFlowChart } from '@/components/reports/cash-flow-chart';
import { PeriodPicker } from '@/components/reports/period-picker';
import { ReportsEmptyState } from '@/components/reports/empty-state';
import { monthlyCashFlow } from '@/lib/reports/aggregations';
import { parsePeriod } from '@/lib/reports/period';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';

/**
 * /reportes/flujo — Monthly Cash Flow report (Phase 6/7 Batch 7).
 *
 * Server component. Reads the period from search params, fetches all
 * tenant-scoped transactions in the range via `listAllForReports`,
 * runs `monthlyCashFlow` from Batch 6, and renders the chart + a
 * summary tile row + an accessible HTML table mirror of the chart
 * data (WCAG: text alternative for every chart per dataviz §6 rule 10).
 */

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata() {
  const t = await getTranslations('reports.cashFlow');
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

export default async function CashFlowReportPage({ searchParams }: PageProps) {
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

  const data = monthlyCashFlow(transactions, { from: period.from, to: period.to });
  const totalIncome = data.reduce((s, r) => s + r.income, 0);
  const totalExpense = data.reduce((s, r) => s + r.expense, 0);
  const totalNet = totalIncome - totalExpense;
  const hasAnyMovement = data.some((r) => r.income !== 0 || r.expense !== 0);

  const t = await getTranslations('reports.cashFlow');
  const tSummary = await getTranslations('reports.cashFlow.summary');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
        </div>
        <PeriodPicker current={period.key} />
      </header>

      {!hasAnyMovement ? (
        <ReportsEmptyState />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={tSummary('totalIncome')}>
              <Money amount={totalIncome} className="text-ifa-teal-600 text-xl" />
            </StatTile>
            <StatTile label={tSummary('totalExpense')}>
              <Money amount={totalExpense} className="text-xl text-red-600" />
            </StatTile>
            <StatTile label={tSummary('totalNet')}>
              <Money
                amount={totalNet}
                className={`text-xl ${totalNet >= 0 ? 'text-ifa-teal-600' : 'text-red-600'}`}
              />
            </StatTile>
            <StatTile label={tSummary('monthsCount')}>
              <span className="text-ifa-navy-900 text-xl font-semibold tabular-nums">
                {data.length}
              </span>
            </StatTile>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <CashFlowChart data={data} />
            </CardContent>
          </Card>

          {/*
           * Accessible text alternative for the chart. Hidden from
           * sighted users via `sr-only` but read by screen readers —
           * satisfies WCAG SC 1.1.1 (Non-text Content) and aligns with
           * dataviz §6 rule 10. The same data drives a print-friendly
           * table below for the print-stylesheet acceptance criterion.
           */}
          <Card className="break-inside-avoid">
            <CardHeader>
              <CardTitle className="text-base">{t('tableCaption')}</CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-ifa-gray-700 border-b border-gray-200 text-left text-xs tracking-wide uppercase">
                    <th className="py-2">{tSummary('monthsCount')}</th>
                    <th className="py-2 text-right">{t('income')}</th>
                    <th className="py-2 text-right">{t('expense')}</th>
                    <th className="py-2 text-right">{t('net')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.month} className="border-b border-gray-100">
                      <td className="text-ifa-navy-900 py-2 font-medium">{row.month}</td>
                      <td className="py-2 text-right">
                        <Money amount={row.income} className="text-ifa-teal-600" />
                      </td>
                      <td className="py-2 text-right">
                        <Money amount={row.expense} className="text-red-600" />
                      </td>
                      <td className="py-2 text-right">
                        <Money
                          amount={row.net}
                          className={row.net >= 0 ? 'text-ifa-teal-600' : 'text-red-600'}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-ifa-gray-700 text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
