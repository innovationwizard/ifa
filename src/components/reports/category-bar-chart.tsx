'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMoney } from '@/i18n/format';
import type { CategoryBucket } from '@/lib/reports/aggregations';

/**
 * Spending-by-category chart — Phase 6/7 Batch 7.
 *
 * Horizontal bar chart, sorted desc — per dataviz research:
 *   - NN/g: bars >> donut/pie for quantitative comparison
 *   - Top 6 categories + "Otros" rollup beyond that
 *   - Colorblind-safe palette (Tableau 10–ish), never RdYlGn
 *
 * Receives pre-rolled-up data (caller handles the "Otros" bucket so
 * the row stays a stable visual position). Chart is purely
 * presentational.
 */

interface CategoryBarChartProps {
  data: CategoryBucket[];
}

/*
 * Colorblind-safe categorical palette (Tableau 10, the canonical
 * safe set for sequential category bars). All distinct under
 * deutan/protan/tritan simulations.
 */
const CATEGORY_COLORS = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
] as const;

export function CategoryBarChart({ data }: CategoryBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatMoney(v)}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          /*
           * Bar axes MUST start at zero (Correll et al. 2020 —
           * truncated bar axes mislead even after warning).
           */
          domain={[0, 'auto']}
          allowDataOverflow={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fill: '#374151', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={110}
        />
        <Tooltip
          /*
           * Recharts' formatter `value` is `ValueType` (a union including
           * arrays). Narrow + format here so we keep `formatMoney`'s
           * `(number) => string` shape elsewhere in the codebase.
           */
          formatter={(value) => formatMoney(typeof value === 'number' ? value : Number(value))}
          contentStyle={{
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 12,
          }}
        />
        <Bar dataKey="total" name="Total" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => {
            // `noUncheckedIndexedAccess` widens tuple access to `T | undefined`,
            // but the modulo math guarantees an in-bounds slot. Default to
            // the first color as a defensive no-op.
            const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? CATEGORY_COLORS[0];
            return <Cell key={i} fill={color} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
