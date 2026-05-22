import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthScoreBullet } from '@/components/health-score/bullet';
import { FactorBars, type FactorBarRow } from '@/components/health-score/factor-bars';
import { HistoryChart, type HistoryPoint } from '@/components/health-score/history-chart';
import { ImprovementList } from '@/components/health-score/improvement-list';
import { getCurrentUser } from '@/lib/auth/server';
import { healthScoreRepo, profileRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';
import { recomputeNow } from './actions';

/**
 * `/dashboard/salud` — full Health Score detail page
 * (Phase 6/7 Batch 13).
 *
 * Layout:
 *   - mobile: vertical stack (bullet → factor bars → history → improvements)
 *   - desktop: two-column grid (bullet + factor bars left, history +
 *     improvements right)
 *
 * Empty state: when the user has no prior score, render a single
 * card with the engine-status copy and a "Calcular ahora" form
 * that fires the `recomputeNow` server action.
 */

export async function generateMetadata() {
  const t = await getTranslations('healthScore.detail');
  return { title: t('title') };
}

interface FactorBreakdownRow {
  key: string;
  weight: number;
  score: number;
  partial: boolean;
  inputs: Record<string, number>;
}

interface FactorsJson {
  partialFactorCount: number;
  breakdown: FactorBreakdownRow[];
}

function readFactorsJson(raw: unknown): FactorsJson | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.breakdown)) return null;
  /*
   * Defensive shape validation only — we trust the engine to write
   * a well-formed JSONB, but a corrupted row shouldn't crash the
   * page. Caller renders an empty-state when this returns null.
   */
  return {
    partialFactorCount: typeof r.partialFactorCount === 'number' ? r.partialFactorCount : 0,
    breakdown: r.breakdown.map((row) => {
      const x = row as Record<string, unknown>;
      return {
        key: typeof x.key === 'string' ? x.key : '',
        weight: typeof x.weight === 'number' ? x.weight : 0,
        score: typeof x.score === 'number' ? x.score : 0,
        partial: x.partial === true,
        inputs:
          typeof x.inputs === 'object' && x.inputs ? (x.inputs as Record<string, number>) : {},
      };
    }),
  };
}

export default async function HealthScoreDetailPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');
  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const { latest, history } = await withTenant(
    { profileId: profile.id, userId: user.id },
    async () => {
      const [latestRow, historyRows] = await Promise.all([
        healthScoreRepo.findLatestForProfile(),
        healthScoreRepo.findHistoryForProfile({ limit: 30 }),
      ]);
      const actionRows = latestRow ? await healthScoreRepo.findActionsForScore(latestRow.id) : [];
      return {
        latest: latestRow ? { row: latestRow, actions: actionRows } : null,
        history: historyRows,
      };
    },
  );

  const t = await getTranslations('healthScore.detail');

  if (!latest) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-10 text-center">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">
          {t('emptyTitle')}
        </h1>
        <p className="text-ifa-gray-700 text-sm">{t('emptyBody')}</p>
        <form action={recomputeNow}>
          <Button type="submit">{t('emptyCta')}</Button>
        </form>
      </div>
    );
  }

  const factorsJson = readFactorsJson(latest.row.factors);
  const factorRows: FactorBarRow[] = factorsJson
    ? factorsJson.breakdown.map((f) => ({
        key: f.key,
        score: f.score,
        inputs: f.inputs,
        partial: f.partial,
      }))
    : [];
  const partial = factorsJson ? factorsJson.partialFactorCount > 0 : false;

  const historyPoints: HistoryPoint[] = history.map((h) => ({
    computedAt: h.computedAt.toISOString(),
    score: h.score,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent className="pt-4">
              <HealthScoreBullet
                score={latest.row.score}
                previousScore={latest.row.previousScore}
                partial={partial}
              />
            </CardContent>
          </Card>

          {factorRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('factorsCardTitle')}</CardTitle>
                <CardDescription>{t('factorsCardSubtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                <FactorBars data={factorRows} />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('historyCardTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              {historyPoints.length >= 2 ? (
                <HistoryChart data={historyPoints} />
              ) : (
                <p className="text-ifa-gray-700 text-sm">{t('historyEmpty')}</p>
              )}
            </CardContent>
          </Card>

          <ImprovementList actions={latest.actions} />
        </div>
      </div>
    </div>
  );
}
