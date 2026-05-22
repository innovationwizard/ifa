import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HealthScoreBullet } from '@/components/health-score/bullet';

/**
 * Dashboard score widget (Phase 6/7 Batch 14).
 *
 * Above-the-fold view of the user's Health Score. Two states:
 *
 *   1. score available → render the bullet graph (Batch 12) + a
 *      "Ver detalle" link to `/dashboard/salud` for the full view
 *      (factor bars + history + improvement actions).
 *   2. no score yet → empty-state copy + "Calcular ahora" CTA that
 *      links to `/dashboard/salud` (the detail page owns the
 *      `recomputeNow` server action — see actions.ts there).
 *
 * Deliberately a thin server component: the heavy lifting (bullet
 * rendering, tier color, partial detection, score arithmetic) lives
 * in `<HealthScoreBullet>` from Batch 12. This widget only wires
 * the dashboard chrome (card frame, title, link).
 */

interface ScoreWidgetProps {
  score: number | null;
  previousScore: number | null;
  partial: boolean;
}

export async function ScoreWidget({ score, previousScore, partial }: ScoreWidgetProps) {
  const t = await getTranslations('dashboard.score');

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t('title')}</CardTitle>
        {score !== null && (
          <Link
            href="/dashboard/salud"
            className="text-ifa-teal-600 hover:text-ifa-teal-700 inline-flex items-center gap-1 text-xs font-medium"
          >
            {t('viewDetail')}
            <ChevronRight className="size-3" aria-hidden />
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {score === null ? (
          <ScoreEmptyState />
        ) : (
          <HealthScoreBullet score={score} previousScore={previousScore} partial={partial} />
        )}
      </CardContent>
    </Card>
  );
}

async function ScoreEmptyState() {
  const t = await getTranslations('dashboard.score');
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="bg-ifa-teal-100 text-ifa-teal-600 flex size-12 items-center justify-center rounded-full">
        <Sparkles className="size-5" aria-hidden />
      </div>
      <p className="text-ifa-gray-700 text-sm leading-relaxed">{t('emptyBody')}</p>
      <Button asChild size="sm" className="w-full sm:w-auto">
        <Link href="/dashboard/salud">{t('emptyCta')}</Link>
      </Button>
    </div>
  );
}
