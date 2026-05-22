import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { BarChart3, PieChart, Store } from 'lucide-react';
import { EmptyDashboard } from '@/components/dashboard/empty-state';
import { MonthlySummary } from '@/components/dashboard/monthly-summary';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { ScoreWidget } from '@/components/dashboard/score-widget';
import { Card, CardContent } from '@/components/ui/card';
import { getCurrentUser } from '@/lib/auth/server';
import { healthScoreRepo, profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';
import { maybeRecomputeStale } from '@/lib/intelligence/health-score/staleness';
import { monthlyCashFlow } from '@/lib/reports/aggregations';
import { currentMonthInGuatemala } from '@/lib/reports/current-month';

/**
 * Dashboard (Phase 6/7 Batch 14).
 *
 * Two render paths:
 *
 *   1. Zero transactions → `<EmptyDashboard>` (S-2.9, unchanged).
 *      This is the just-onboarded user's view — primary CTA is
 *      "upload your first statement".
 *
 *   2. Non-zero → the real MVP dashboard:
 *        - `<ScoreWidget>`     — Health Score bullet (Batch 12),
 *                                empty-state CTA when no score yet
 *        - `<MonthlySummary>`  — current-month income/expense/net
 *                                (GT calendar month, via
 *                                 `currentMonthInGuatemala`)
 *        - `<RecentActivity>`  — last 10 transactions
 *        - quick links         — `/reportes/flujo`, `/reportes/gastos`,
 *                                `/reportes/comercios`
 *
 * Data loads are issued inside a single `withTenant` so the tenancy
 * extension applies once; the Health Score lookup and the two
 * transaction queries run in `Promise.all` since they're independent.
 */

function readPartial(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const count = (raw as Record<string, unknown>).partialFactorCount;
  return typeof count === 'number' && count > 0;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const month = currentMonthInGuatemala();

  const firstPass = await withTenant({ profileId: profile.id, userId: user.id }, async () => {
    const count = await transactionRepo.count();
    if (count === 0) {
      return {
        transactionCount: 0,
        latestScore: null,
        monthTransactions: [],
        recent: { data: [], hasMore: false, nextCursor: null },
      };
    }
    const [latest, monthRows, recentRows] = await Promise.all([
      healthScoreRepo.findLatestForProfile(),
      transactionRepo.listAllForReports({ from: month.from, to: month.to }),
      transactionRepo.list({ limit: 10 }),
    ]);
    return {
      transactionCount: count,
      latestScore: latest,
      monthTransactions: monthRows,
      recent: recentRows,
    };
  });

  if (firstPass.transactionCount === 0) {
    const firstName = profile.displayName.split(/\s+/)[0] ?? profile.displayName;
    return <EmptyDashboard firstName={firstName} />;
  }

  /*
   * ADR-002: auto-recompute when the latest score is >24h stale and
   * the throttle window has cleared. Re-read the score only when a
   * recompute actually ran so the cached-score path keeps a single
   * round trip.
   */
  const didRecompute = await maybeRecomputeStale({
    profileId: profile.id,
    latestScore: firstPass.latestScore,
    lastRecomputeAt: profile.lastHealthScoreRecomputeAt,
  });

  const latestScore = didRecompute
    ? await withTenant({ profileId: profile.id, userId: user.id }, () =>
        healthScoreRepo.findLatestForProfile(),
      )
    : firstPass.latestScore;
  const { monthTransactions, recent } = firstPass;

  const cashFlow = monthlyCashFlow(monthTransactions, { from: month.from, to: month.to });
  /*
   * `monthlyCashFlow` returns one bucket per enumerated month; for a
   * single-month range it's always [summary]. Defensive fallback to
   * an all-zero bucket keeps the type non-nullable for the widget.
   */
  const summary = cashFlow[0] ?? { month: month.monthKey, income: 0, expense: 0, net: 0 };

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader displayName={profile.displayName} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ScoreWidget
            score={latestScore?.score ?? null}
            previousScore={latestScore?.previousScore ?? null}
            partial={latestScore ? readPartial(latestScore.factors) : false}
          />
          <RecentActivity transactions={recent.data} />
        </div>
        <div className="flex flex-col gap-6">
          <MonthlySummary summary={summary} />
          <QuickLinks />
        </div>
      </div>
    </div>
  );
}

async function DashboardHeader({ displayName }: { displayName: string }) {
  const t = await getTranslations('dashboard.home');
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">
        {t('greeting', { name: firstName })}
      </h1>
      <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
    </header>
  );
}

async function QuickLinks() {
  const t = await getTranslations('dashboard.quickLinks');
  const links = [
    { href: '/reportes/flujo', label: t('flow'), icon: BarChart3 },
    { href: '/reportes/gastos', label: t('spending'), icon: PieChart },
    { href: '/reportes/comercios', label: t('merchants'), icon: Store },
  ];
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="hover:bg-ifa-navy-50 focus-visible:bg-ifa-navy-100 flex items-center gap-3 rounded-md p-3 outline-none"
          >
            <span className="bg-ifa-teal-100 text-ifa-teal-600 flex size-9 items-center justify-center rounded-full">
              <Icon className="size-4" aria-hidden />
            </span>
            <span className="text-ifa-navy-900 text-sm font-medium">{label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
