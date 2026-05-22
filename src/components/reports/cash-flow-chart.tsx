'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslations } from 'next-intl';
import { formatMoney } from '@/i18n/format';
import type { MonthlyCashFlow } from '@/lib/reports/aggregations';

/**
 * Monthly cash-flow chart — Phase 6/7 Batch 7.
 *
 * Composition per dataviz research (§1.5 of _DATAVIZ_BEST_PRACTICES.md):
 *   - Grouped vertical bars: Ingresos (teal) + Gastos (red)
 *   - Line overlay: Neto (navy) with explicit markers per month
 *   - Y-axis starts at 0 (mandatory for bar charts — anti-pattern
 *     to truncate)
 *   - Color pair always accompanied by an explicit legend label;
 *     never color alone (WCAG 1.4.1)
 *
 * Tooltip uses `formatMoney` so the user sees `Q 1,234.56` —
 * exactly what `<Money>` renders elsewhere.
 */

interface CashFlowChartProps {
  data: MonthlyCashFlow[];
}

const COLOR_INCOME = '#0d9488';
const COLOR_EXPENSE = '#dc2626';
const COLOR_NET = '#1e3a8a';

const MONTH_LABELS_ES: Record<string, string> = {
  '01': 'Ene',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Sept',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dic',
};

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-');
  const abbrev = (month && MONTH_LABELS_ES[month]) ?? monthKey;
  return `${abbrev} ${(year ?? '').slice(2)}`;
}

export function CashFlowChart({ data }: CashFlowChartProps) {
  const t = useTranslations('reports.cashFlow');

  const formatted = data.map((d) => ({
    ...d,
    monthLabel: formatMonthLabel(d.month),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={formatted} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis
          dataKey="monthLabel"
          tick={{ fill: '#374151', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v: number) => formatMoney(v)}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={90}
          /*
           * Always anchor at zero: NN/g + Correll et al. (2020) — bars
           * with truncated y-axes persistently mislead even after
           * viewers are warned. Recharts' default includes 0 when both
           * positive and negative values are present; force it via
           * `allowDataOverflow={false}` and an explicit domain min.
           */
          domain={[0, 'auto']}
          allowDataOverflow={false}
        />
        <Tooltip
          /*
           * Recharts widens Tooltip formatter `value` to
           * `string | number | (string | number)[]`. Our data is always
           * numeric (sums of GTQ amounts); we narrow + format here.
           */
          formatter={(value) => formatMoney(typeof value === 'number' ? value : Number(value))}
          contentStyle={{
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name={t('income')} fill={COLOR_INCOME} radius={[3, 3, 0, 0]} />
        <Bar dataKey="expense" name={t('expense')} fill={COLOR_EXPENSE} radius={[3, 3, 0, 0]} />
        <Line
          type="monotone"
          dataKey="net"
          name={t('net')}
          stroke={COLOR_NET}
          strokeWidth={2}
          dot={{ r: 3, fill: COLOR_NET }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
