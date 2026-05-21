import 'server-only';
import { prismaUnscoped } from '@/lib/db/prisma';
import type {
  CategoryBucket,
  FinancialOverviewData,
  MonthlyBucket,
} from './financial-overview';

const MONTH_LABELS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface MerchantBucket {
  name: string;
  amount: number;
  count: number;
}

export interface LargestExpense {
  date: Date;
  amount: number;
  description: string;
  merchantName: string | null;
  category: string | null;
}

export interface ExtendedOverviewData extends FinancialOverviewData {
  merchants: MerchantBucket[];
  recurringCount: number;
  largestExpense: LargestExpense | null;
  /** Predicted gasto for next month based on the last 3-month average. */
  predictedNextMonthExpense: number;
}

/**
 * Demo overview data loader. Reads transactions for the given profile
 * via `prismaUnscoped` (bypassing the tenancy extension because of an
 * active Turbopack module-dual-load bug we're working around for the
 * demo) and computes per-month + per-category + per-merchant
 * aggregations plus a few derived signals (recurring count, largest
 * expense, naive next-month forecast).
 *
 * This is demo-grade — Phase 6 (Reports) + Phase 7 (Health Score)
 * replace it with the real aggregation primitives + factor library.
 */
export async function loadFinancialOverviewData(profileId: string): Promise<ExtendedOverviewData> {
  const transactions = await prismaUnscoped.transaction.findMany({
    where: { profileId },
    orderBy: { date: 'desc' },
    select: {
      date: true,
      type: true,
      amount: true,
      category: true,
      description: true,
      merchantName: true,
    },
  });

  const byMonthKey = new Map<string, { income: number; expense: number; date: Date }>();
  const byCategory = new Map<string, number>();
  const byMerchant = new Map<string, { amount: number; count: number }>();
  let largest: LargestExpense | null = null;

  for (const tx of transactions) {
    const monthKey = `${tx.date.getUTCFullYear().toString()}-${String(tx.date.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = byMonthKey.get(monthKey) ?? {
      income: 0,
      expense: 0,
      date: new Date(Date.UTC(tx.date.getUTCFullYear(), tx.date.getUTCMonth(), 1)),
    };
    const amount = Number(tx.amount);
    if (tx.type === 'INCOME') {
      bucket.income += amount;
    } else if (tx.type === 'EXPENSE') {
      bucket.expense += amount;
      const cat = tx.category ?? 'Otros';
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + amount);

      const merchantKey = tx.merchantName ?? tx.description;
      const m = byMerchant.get(merchantKey) ?? { amount: 0, count: 0 };
      m.amount += amount;
      m.count += 1;
      byMerchant.set(merchantKey, m);

      if (!largest || amount > largest.amount) {
        largest = {
          date: tx.date,
          amount,
          description: tx.description,
          merchantName: tx.merchantName,
          category: tx.category,
        };
      }
    }
    byMonthKey.set(monthKey, bucket);
  }

  const monthly: MonthlyBucket[] = Array.from(byMonthKey.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-3)
    .map((b) => ({
      label: MONTH_LABELS_ES[b.date.getUTCMonth()] ?? '',
      income: Math.round(b.income),
      expense: Math.round(b.expense),
      net: Math.round(b.income - b.expense),
    }));

  const categories: CategoryBucket[] = Array.from(byCategory.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([category, amount]) => ({ category, amount: Math.round(amount) }));

  const merchants: MerchantBucket[] = Array.from(byMerchant.entries())
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, 8)
    .map(([name, { amount, count }]) => ({ name, amount: Math.round(amount), count }));

  const recurringCount = Array.from(byMerchant.values()).filter((m) => m.count >= 3).length;

  const totalIncome = monthly.reduce((s, m) => s + m.income, 0);
  const totalExpense = monthly.reduce((s, m) => s + m.expense, 0);
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
  const predictedNextMonthExpense =
    monthly.length > 0 ? Math.round(totalExpense / monthly.length) : 0;

  let healthScore: number;
  if (savingsRate >= 25) healthScore = 850;
  else if (savingsRate >= 10) healthScore = 720;
  else if (savingsRate >= 0) healthScore = 560;
  else healthScore = 380;

  const scoreLabel =
    healthScore >= 800
      ? 'Excelente'
      : healthScore >= 600
        ? 'Estable'
        : healthScore >= 400
          ? 'En riesgo'
          : 'Crítico';

  return {
    monthly,
    categories,
    merchants,
    recurringCount,
    largestExpense: largest,
    predictedNextMonthExpense,
    healthScore,
    scoreLabel,
    totalIncome,
    totalExpense,
    savingsRate,
    txCount: transactions.length,
  };
}
