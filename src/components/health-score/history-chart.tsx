'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SCORE_MAX, SCORE_MIN } from './tier';

/**
 * Health Score history — Phase 6/7 Batch 13.
 *
 * Line chart of past scores over time. Rendered below the bullet +
 * factor bars on `/dashboard/salud` so users can see trend at a
 * glance. Y-axis pinned to `[0, 1000]` so the visual ramp is
 * consistent regardless of the user's score range — never truncated
 * (per dataviz §2 anti-pattern + Correll et al. 2020).
 */

export interface HistoryPoint {
  /** ISO date string from `HealthScore.computedAt`. */
  computedAt: string;
  /** Score in `[0, 1000]`. */
  score: number;
}

interface HistoryChartProps {
  data: HistoryPoint[];
}

function formatTickDate(iso: string): string {
  /*
   * Compact label: DD-MMM (e.g., "21-May") since the snapshot
   * frequency is typically once a day to once a week. Locale-aware
   * via `Intl.DateTimeFormat` would be cleaner but the abbreviated
   * Spanish month names here keep the inline label short enough for
   * mobile widths.
   */
  const ABBR = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sept',
    'Oct',
    'Nov',
    'Dic',
  ];
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = ABBR[date.getUTCMonth()] ?? '';
  return `${day}-${month}`;
}

export function HistoryChart({ data }: HistoryChartProps) {
  /*
   * Recharts plots in the order it receives. The API returns
   * history newest-first; reverse so the x-axis reads
   * oldest → newest like every other time-series chart in the app.
   */
  const ordered = [...data].reverse().map((p) => ({
    ...p,
    label: formatTickDate(p.computedAt),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={ordered} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis
          dataKey="label"
          tick={{ fill: '#374151', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[SCORE_MIN, SCORE_MAX]}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={42}
        />
        <Tooltip
          formatter={(value) => (typeof value === 'number' ? `${value.toString()}/1000` : '')}
          contentStyle={{
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#0d847a"
          strokeWidth={2}
          dot={{ r: 3, fill: '#0d847a' }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
