import { useTranslations } from 'next-intl';
import { CheckCircle2, X } from 'lucide-react';
import type { HealthScoreAction, HealthScoreActionStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { completeAction, dismissAction } from '@/app/(app)/dashboard/salud/actions';

/**
 * Improvement-actions list — Phase 6/7 Batch 13.
 *
 * Renders the persisted `HealthScoreAction` rows attached to the
 * latest snapshot, sorted by `estimatedImpact DESC`. Each row has
 * a "Marcar como hecho" + "Descartar" pair of form-submit buttons
 * that call the server actions in `./actions.ts`.
 *
 * Server actions handle:
 *   - cross-tenant safety (`withTenant`)
 *   - `revalidatePath('/dashboard/salud')` so the new status is
 *     reflected on the next render
 *
 * Component itself is server-rendered (no `'use client'` directive)
 * — form submission triggers the server action directly.
 */

interface ImprovementListProps {
  actions: HealthScoreAction[];
}

const STATUS_BADGE_CLASSES: Record<HealthScoreActionStatus, string> = {
  PENDING: 'bg-ifa-teal-100 text-ifa-teal-900',
  COMPLETED: 'bg-ifa-gold-100 text-ifa-navy-900',
  DISMISSED: 'bg-ifa-gray-100 text-ifa-gray-700',
};

export function ImprovementList({ actions }: ImprovementListProps) {
  const t = useTranslations('healthScore.improvements');

  if (actions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('emptyTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-ifa-gray-700 text-sm">{t('emptyBody')}</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...actions].sort((a, b) => b.estimatedImpact - a.estimatedImpact);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {sorted.map((action) => (
            <li
              key={action.id}
              className="border-ifa-gray-200 flex flex-col gap-2 rounded-lg border bg-white p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-ifa-navy-900 text-sm">{action.description}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase ${
                    STATUS_BADGE_CLASSES[action.status]
                  }`}
                >
                  {t(`status.${action.status}`)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ifa-gray-700 text-xs">
                  {t('impactPrefix')}{' '}
                  <strong className="text-ifa-teal-600 tabular-nums">
                    +{action.estimatedImpact}
                  </strong>{' '}
                  {t('impactSuffix')}
                </span>
                {action.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <form action={completeAction}>
                      <input type="hidden" name="actionId" value={action.id} />
                      <Button type="submit" variant="outline" size="sm" className="gap-1">
                        <CheckCircle2 className="size-3.5" aria-hidden />
                        {t('completeLabel')}
                      </Button>
                    </form>
                    <form action={dismissAction}>
                      <input type="hidden" name="actionId" value={action.id} />
                      <Button type="submit" variant="ghost" size="sm" className="gap-1">
                        <X className="size-3.5" aria-hidden />
                        {t('dismissLabel')}
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
