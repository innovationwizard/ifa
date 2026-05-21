'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface MonthlyBucket {
  /** Spanish month label, e.g. "Feb" */
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface CategoryBucket {
  category: string;
  amount: number;
}

export interface FinancialOverviewData {
  monthly: MonthlyBucket[];
  categories: CategoryBucket[];
  healthScore: number;
  scoreLabel: string;
  totalIncome: number;
  totalExpense: number;
  savingsRate: number;
  txCount: number;
}

const SCORE_PALETTE = {
  excellent: '#0d9488',
  stable: '#14b8a6',
  warning: '#eab308',
  critical: '#ef4444',
} as const;

const CATEGORY_COLORS = [
  '#0d9488',
  '#14b8a6',
  '#2dd4bf',
  '#eab308',
  '#f59e0b',
  '#ef4444',
  '#6b7280',
  '#1e3a8a',
] as const;

function fmtQ(amount: number): string {
  return `Q ${amount.toLocaleString('es-GT', { maximumFractionDigits: 0 })}`;
}

function scoreColor(score: number): string {
  if (score >= 800) return SCORE_PALETTE.excellent;
  if (score >= 600) return SCORE_PALETTE.stable;
  if (score >= 400) return SCORE_PALETTE.warning;
  return SCORE_PALETTE.critical;
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  /*
   * Recharts pie chart used as a semicircle gauge: two segments
   * ("filled" + "rest"), startAngle=180°, endAngle=0° to render the
   * top half only. The hole in the middle holds the numeric score.
   */
  const data = [
    { name: 'filled', value: score },
    { name: 'rest', value: 1000 - score },
  ];
  return (
    <div className="relative flex flex-col items-center">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="100%"
            innerRadius={80}
            outerRadius={110}
            startAngle={180}
            endAngle={0}
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={scoreColor(score)} />
            <Cell fill="#e5e7eb" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div
        className="text-ifa-navy-900 pointer-events-none absolute inset-x-0 bottom-2 flex flex-col items-center"
        aria-hidden
      >
        <span className="text-4xl font-bold tabular-nums">{score}</span>
        <span className="text-ifa-gray-700 text-sm font-medium">{label}</span>
      </div>
    </div>
  );
}

function MonthlyFlowChart({ data }: { data: MonthlyBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fill: '#374151', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v: number) => fmtQ(v)}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number) => fmtQ(v)}
          contentStyle={{
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Ingresos" fill="#0d9488" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expense" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CategoryChart({ data }: { data: CategoryBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
        <XAxis
          type="number"
          tickFormatter={(v: number) => fmtQ(v)}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fill: '#374151', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={100}
        />
        <Tooltip
          formatter={(v: number) => fmtQ(v)}
          contentStyle={{
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 12,
          }}
        />
        <Bar dataKey="amount" name="Gasto" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function NetTrendChart({ data }: { data: MonthlyBucket[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fill: '#374151', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v: number) => fmtQ(v)}
          tick={{ fill: '#6b7280', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v: number) => fmtQ(v)}
          contentStyle={{
            borderRadius: 8,
            border: '1px solid #e5e7eb',
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="net"
          name="Flujo neto"
          stroke="#0d9488"
          strokeWidth={3}
          dot={{ r: 4, fill: '#0d9488' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-ifa-gray-700 text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ?? 'text-ifa-navy-900'}`}>
        {value}
      </p>
    </div>
  );
}

interface OverviewProps {
  data: FinancialOverviewData;
  /** Which sections to render. Default: all four. */
  show?: {
    score?: boolean;
    monthly?: boolean;
    categories?: boolean;
    trend?: boolean;
    stats?: boolean;
  };
}

/**
 * Demo financial overview — drops into placeholder pages to show real
 * computed data instead of an empty "coming soon" card. Server pages
 * pass pre-aggregated data; this client component handles the
 * recharts rendering.
 */
export function FinancialOverview({ data, show }: OverviewProps) {
  const sections = {
    score: show?.score ?? true,
    monthly: show?.monthly ?? true,
    categories: show?.categories ?? true,
    trend: show?.trend ?? true,
    stats: show?.stats ?? true,
  };

  return (
    <div className="flex flex-col gap-6">
      {sections.stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Ingresos (3m)" value={fmtQ(data.totalIncome)} accent="text-ifa-teal-600" />
          <StatTile label="Gastos (3m)" value={fmtQ(data.totalExpense)} accent="text-red-600" />
          <StatTile
            label="Tasa de ahorro"
            value={`${data.savingsRate.toFixed(1)}%`}
            accent={data.savingsRate >= 10 ? 'text-ifa-teal-600' : 'text-yellow-600'}
          />
          <StatTile label="Movimientos" value={String(data.txCount)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {sections.score && (
          <Card>
            <CardHeader>
              <CardTitle>Salud financiera</CardTitle>
              <CardDescription>Tu puntaje IFA (0–1000)</CardDescription>
            </CardHeader>
            <CardContent>
              <ScoreGauge score={data.healthScore} label={data.scoreLabel} />
            </CardContent>
          </Card>
        )}

        {sections.monthly && (
          <Card className={sections.score ? '' : 'lg:col-span-2'}>
            <CardHeader>
              <CardTitle>Flujo mensual</CardTitle>
              <CardDescription>Ingresos vs. gastos, últimos 3 meses</CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyFlowChart data={data.monthly} />
            </CardContent>
          </Card>
        )}

        {sections.trend && (
          <Card>
            <CardHeader>
              <CardTitle>Flujo neto</CardTitle>
              <CardDescription>Ingresos − gastos por mes</CardDescription>
            </CardHeader>
            <CardContent>
              <NetTrendChart data={data.monthly} />
            </CardContent>
          </Card>
        )}
      </div>

      {sections.categories && (
        <Card>
          <CardHeader>
            <CardTitle>Gasto por categoría</CardTitle>
            <CardDescription>Top categorías de los últimos 3 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryChart data={data.categories} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
