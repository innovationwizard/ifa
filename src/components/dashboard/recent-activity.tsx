import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Money } from '@/components/primitives/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Transaction } from '@prisma/client';

/**
 * Dashboard recent-activity widget (Phase 6/7 Batch 14).
 *
 * Last 10 transactions, server-rendered. Each row links to
 * `/transacciones/{id}` for the detail page. Row layout mirrors
 * the feed's row style (S-3.7) — same columns in the same order —
 * so a user can scan the dashboard and feel "this is the same list
 * as on /transacciones, just trimmed". Acceptance criterion: "Recent-
 * activity rows match the feed's row style for consistency".
 *
 * Differences from `<TransactionsFeed>` (intentional):
 *
 *   - No virtualization. 10 rows is a fixed cap; the virtual scroller
 *     would be more code than value.
 *   - No bulk-select checkbox. Recent activity is a read-only summary;
 *     bulk ops belong on `/transacciones`.
 *   - No filter sidebar. Same reason.
 *   - No badges (duplicate / anomaly / new-merchant). The dashboard
 *     surfaces those via the Health Score widget — repeating them on
 *     every row would compete for attention with the score itself.
 */

const ISO_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
});

interface RecentActivityProps {
  transactions: Transaction[];
}

export async function RecentActivity({ transactions }: RecentActivityProps) {
  const t = await getTranslations('dashboard.recentActivity');
  const tSources = await getTranslations('transactions.sources');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <Link
          href="/transacciones"
          className="text-ifa-teal-600 hover:text-ifa-teal-700 text-xs font-medium"
        >
          {t('viewAll')}
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {transactions.length === 0 ? (
          <p className="text-ifa-gray-700 px-6 py-6 text-center text-sm">{t('empty')}</p>
        ) : (
          <ul className="divide-ifa-gray-200 divide-y">
            {transactions.map((tx) => {
              const amount = Number(tx.amount);
              return (
                <li key={tx.id}>
                  <Link
                    href={`/transacciones/${tx.id}`}
                    className="hover:bg-ifa-navy-50 focus-visible:bg-ifa-navy-100 grid grid-cols-[80px_minmax(0,1fr)_110px_70px] items-center gap-3 px-4 py-3 outline-none sm:grid-cols-[100px_minmax(0,1fr)_140px_110px_90px]"
                  >
                    <span className="text-ifa-gray-700 text-xs tabular-nums">
                      {ISO_DATE_FORMATTER.format(tx.date)}
                    </span>
                    <span className="text-ifa-navy-900 truncate text-sm">{tx.description}</span>
                    <span className="text-ifa-gray-500 hidden truncate text-xs sm:inline">
                      {tx.merchantName ?? tx.merchantNit ?? '—'}
                    </span>
                    <Money
                      amount={amount}
                      currency={tx.currency}
                      className={
                        amount < 0 ? 'text-ifa-gray-700 text-sm' : 'text-ifa-teal-600 text-sm'
                      }
                    />
                    <span className="text-ifa-gray-500 truncate text-right text-xs tracking-wide uppercase">
                      {tSources(tx.source)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
