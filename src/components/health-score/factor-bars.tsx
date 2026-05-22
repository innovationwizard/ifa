'use client';

import { useState } from 'react';
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
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { scoreTier, tierColor } from './tier';

/**
 * Health Score factor-bars — Phase 6/7 Batch 13.
 *
 * Six sub-scores rendered as a horizontal bar chart, sorted desc.
 * Replaced the originally-planned radar chart per the dataviz
 * research (NN/g + Stephen Few: circular charts are poor for
 * quantitative comparison; bars beat them on every axis except
 * "shape gestalt", which doesn't survive humans' weakness at
 * estimating angles). See
 * [_DATAVIZ_BEST_PRACTICES.md §1.2 + §1.5 + §6 rule 1](../../../../docs_operations/_DATAVIZ_BEST_PRACTICES.md)
 * for the rationale.
 *
 * Each bar is tier-colored from Batch 12's `TIER_BANDS`. Sub-scores
 * are in `[0, 100]`; we map each onto its 1000-scale tier so the
 * color semantics stay consistent with the overall bullet (a
 * factor scoring 45/100 is "Crítico" — red — just like the overall
 * score 450/1000 would be).
 *
 * Click a bar to reveal the factor's formula + raw `inputs`
 * (collapsible card below the chart). Satisfies B13's acceptance
 * criterion: "Clicking a factor reveals its formula + current
 * inputs".
 */

export interface FactorBarRow {
  /** Stable key from `FACTOR_WEIGHTS` — also the i18n lookup. */
  key: string;
  /** 0–100 sub-score. */
  score: number;
  /** Surfaces in the expand-on-click card. */
  inputs: Record<string, number>;
  /** True when the factor is below its minimum-data threshold. */
  partial: boolean;
}

interface FactorBarsProps {
  data: FactorBarRow[];
  /** Optional className passthrough for layout container. */
  className?: string;
}

const SCALE_TO_TIER = 10; // sub-score [0,100] → tier-bands scale [0,1000]

/**
 * Pure helper extracted so unit tests can verify the sort + color
 * mapping independently of the Recharts render (jsdom can't size
 * `ResponsiveContainer`, which means in-DOM assertions on the
 * bars wouldn't work anyway).
 */
export function buildFactorBarRows(
  data: FactorBarRow[],
  labelLookup: (key: string) => string,
): {
  key: string;
  score: number;
  partial: boolean;
  inputs: Record<string, number>;
  label: string;
  color: string;
}[] {
  return [...data]
    .sort((a, b) => b.score - a.score)
    .map((row) => ({
      ...row,
      label: labelLookup(row.key),
      color: tierColor(scoreTier(row.score * SCALE_TO_TIER)),
    }));
}

export function FactorBars({ data, className }: FactorBarsProps) {
  const t = useTranslations('healthScore.factors');
  const tPartial = useTranslations('healthScore');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  /*
   * Sort weakest → strongest at the BOTTOM of the chart. Recharts
   * renders the first row at the top, so we sort desc by score and
   * let the visual ramp from "strongest at top" → "weakest at
   * bottom" do the work. Users see their improvement targets last,
   * which mirrors the improvement-actions card below.
   */
  const sorted = [...data].sort((a, b) => b.score - a.score);

  const labeled = sorted.map((row) => ({
    ...row,
    label: t(`${row.key}.name`),
    color: tierColor(scoreTier(row.score * SCALE_TO_TIER)),
  }));

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <ResponsiveContainer width="100%" height={Math.max(200, labeled.length * 44)}>
        <BarChart
          data={labeled}
          layout="vertical"
          margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toString()}`}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: '#374151', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip
            formatter={(value) => (typeof value === 'number' ? `${value.toFixed(0)}/100` : '')}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="score"
            name="Score"
            radius={[0, 3, 3, 0]}
            maxBarSize={20}
            onClick={(barData) => {
              /*
               * Recharts forwards the row's data payload as the
               * first arg to a `<Bar>` `onClick`. The shape is the
               * `labeled` array element — we type-guard via the
               * `key` field we know we set on every row.
               */
              const row = barData as unknown as { key?: string };
              if (typeof row.key === 'string') {
                const clickedKey = row.key;
                setExpandedKey((prev) => (prev === clickedKey ? null : clickedKey));
              }
            }}
          >
            {labeled.map((row) => (
              <Cell key={row.key} fill={row.color} cursor="pointer" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {expandedKey && (
        <div className="border-ifa-gray-200 rounded-lg border bg-white p-4">
          <FactorDetail
            row={labeled.find((r) => r.key === expandedKey) ?? null}
            tPartial={tPartial('partial')}
            tFormula={t(`${expandedKey}.formula`)}
            tName={t(`${expandedKey}.name`)}
            onClose={() => {
              setExpandedKey(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function FactorDetail({
  row,
  tFormula,
  tName,
  tPartial,
  onClose,
}: {
  row: (FactorBarRow & { label: string; color: string }) | null;
  tFormula: string;
  tName: string;
  tPartial: string;
  onClose: () => void;
}) {
  if (!row) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-ifa-navy-900 text-base font-semibold">{tName}</h3>
        <button
          type="button"
          className="text-ifa-gray-700 text-xs underline-offset-2 hover:underline"
          onClick={onClose}
        >
          Cerrar
        </button>
      </div>
      <p className="text-ifa-gray-700 text-sm">{tFormula}</p>
      {row.partial && (
        <span className="bg-ifa-gold-100 text-ifa-navy-900 inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium tracking-wide uppercase">
          {tPartial}
        </span>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {Object.entries(row.inputs).map(([k, v]) => (
          <div key={k} className="flex justify-between border-b border-gray-100 py-1">
            <dt className="text-ifa-gray-700 capitalize">{k}</dt>
            <dd className="text-ifa-navy-900 tabular-nums">
              {Number.isFinite(v) ? v.toLocaleString('es-GT', { maximumFractionDigits: 2 }) : '—'}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
