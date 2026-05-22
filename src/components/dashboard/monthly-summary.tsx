import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowDownRight, ArrowUpRight, Wallet } from 'lucide-react';
import { Money } from '@/components/primitives/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MonthlyCashFlow } from '@/lib/reports/aggregations';

/**
 * Dashboard monthly summary widget (Phase 6/7 Batch 14).
 *
 * Renders the three top-line numbers for the current calendar month
 * (in `America/Guatemala`):
 *
 *   - INGRESOS  (income, sum of EXPENSE-typed rows in the month)
 *   - GASTOS    (expense, sum of INCOME-typed rows in the month)
 *   - NETO      (income − expense; can be negative)
 *
 * Source data comes from `monthlyCashFlow(transactions, range)` —
 * Batch 6's pure aggregation primitive. The `range` MUST already be
 * the GT calendar-month bounds (see `currentMonthInGuatemala()`).
 *
 * `monthlyCashFlow` fills missing months with zeros, so this widget
 * always renders three numbers — even when the user has no
 * transactions yet this month (the rare "imported last month but
 * nothing yet for this one" case shows three zeros, which is the
 * honest answer).
 */

interface MonthlySummaryProps {
  /** Current-month bucket from `monthlyCashFlow`. Must not be null. */
  summary: MonthlyCashFlow;
}

export async function MonthlySummary({ summary }: MonthlySummaryProps) {
  const t = await getTranslations('dashboard.monthlySummary');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <Link
          href="/reportes/flujo"
          className="text-ifa-teal-600 hover:text-ifa-teal-700 text-xs font-medium"
        >
          {t('viewMore')}
        </Link>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-3 gap-3">
          <Metric
            icon={<ArrowDownRight className="size-4 text-green-700" aria-hidden />}
            label={t('income')}
            value={summary.income}
            tone="positive"
          />
          <Metric
            icon={<ArrowUpRight className="size-4 text-red-700" aria-hidden />}
            label={t('expense')}
            value={summary.expense}
            tone="negative"
          />
          <Metric
            icon={<Wallet className="text-ifa-navy-700 size-4" aria-hidden />}
            label={t('net')}
            value={summary.net}
            tone={summary.net < 0 ? 'negative' : 'neutral'}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-green-700'
      : tone === 'negative'
        ? 'text-red-700'
        : 'text-ifa-navy-900';
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-ifa-gray-700 flex items-center gap-1 text-xs tracking-wide uppercase">
        {icon}
        <span>{label}</span>
      </dt>
      <dd>
        <Money amount={value} className={`text-base ${valueClass}`} />
      </dd>
    </div>
  );
}
