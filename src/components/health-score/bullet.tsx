import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { SCORE_MAX, SCORE_MIN, TIER_BANDS, scoreTier, tierColor } from './tier';

/**
 * `<HealthScoreBullet>` — Phase 6/7 Batch 12.
 *
 * Linear bullet graph for the Financial Health Score (0–1000). Hand-
 * rolled SVG (~80 lines) — no Recharts dep. Replaces the originally-
 * planned radial gauge; see `_DATAVIZ_BEST_PRACTICES.md §1.3 + §1.5
 * + §2` for the Stephen-Few rationale that drove the swap.
 *
 * Encoded:
 *   - four tier bands as the background of a horizontal track
 *     (Crítico red → En riesgo amber → Estable teal → Excelente
 *     deep teal)
 *   - the actual score as a vertical marker over the bands, with
 *     the numeric value + Spanish tier label rendered adjacent
 *     (never relies on color alone — WCAG 1.4.1)
 *   - the previous-period score (when provided + not partial)
 *     as a smaller tick above the track, connected to the actual-
 *     score marker by a hairline (the "comparación" cue from §1.5)
 *   - `partial: true` swaps the previous-period tick for a "Faltan
 *     datos" pill
 *   - 600ms CSS transition on the marker's `left` percentage;
 *     respects `prefers-reduced-motion`
 *
 * The graph is purely presentational — score arithmetic, partial
 * detection, etc. all happen in the engine (Batch 10).
 */

interface HealthScoreBulletProps {
  /** Final score in `[0, 1000]`. Clamped defensively. */
  score: number;
  /**
   * Score from the most recent prior snapshot. Renders as the
   * comparison tick + connecting hairline above the track.
   */
  previousScore?: number | null;
  /**
   * `true` when the underlying engine flagged any factor as having
   * insufficient data. Replaces the previous-period tick with a
   * "Faltan datos" pill so the user knows the comparison isn't
   * meaningful yet.
   */
  partial?: boolean;
  className?: string;
}

function clampToRange(n: number): number {
  if (!Number.isFinite(n)) return SCORE_MIN;
  return Math.min(Math.max(n, SCORE_MIN), SCORE_MAX);
}

function scoreToPercent(score: number): number {
  return ((clampToRange(score) - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;
}

export function HealthScoreBullet({
  score,
  previousScore,
  partial = false,
  className,
}: HealthScoreBulletProps) {
  const t = useTranslations('healthScore');
  const clampedScore = clampToRange(score);
  const tier = scoreTier(clampedScore);
  const tierLabel = t(`tier.${tier}`);
  const markerLeft = scoreToPercent(clampedScore);
  const showPreviousTick = !partial && previousScore !== null && previousScore !== undefined;
  const previousLeft = showPreviousTick ? scoreToPercent(previousScore) : 0;

  return (
    <div
      className={cn('flex w-full flex-col gap-3', className)}
      role="img"
      aria-label={t('ariaLabel', {
        score: String(Math.round(clampedScore)),
        max: String(SCORE_MAX),
        tier: tierLabel,
      })}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span
            className="text-ifa-navy-900 text-3xl font-bold tabular-nums"
            style={{ color: tierColor(tier) }}
          >
            {Math.round(clampedScore)}
          </span>
          <span className="text-ifa-gray-700 text-sm font-medium">{tierLabel}</span>
        </div>
        {partial ? (
          <span className="bg-ifa-gold-100 text-ifa-navy-900 rounded-full px-2 py-0.5 text-xs font-medium tracking-wide uppercase">
            {t('partial')}
          </span>
        ) : showPreviousTick ? (
          <span className="text-ifa-gray-700 text-xs">
            {t('previousLabel', { score: String(Math.round(previousScore)) })}
          </span>
        ) : null}
      </div>

      <div className="relative w-full">
        {/*
         * Previous-period tick — rendered above the track. Hairline
         * connects it to the actual-score marker below for the
         * "comparación" cue documented in dataviz §1.5.
         */}
        {showPreviousTick && (
          <>
            <span
              className="bg-ifa-gray-500 absolute top-0 h-2 w-px"
              style={{ left: `${previousLeft.toString()}%`, transform: 'translateX(-50%)' }}
              aria-hidden
            />
            <span
              className="bg-ifa-gray-500 absolute top-2 h-px"
              style={{
                left: `${Math.min(previousLeft, markerLeft).toString()}%`,
                width: `${Math.abs(markerLeft - previousLeft).toString()}%`,
              }}
              aria-hidden
            />
          </>
        )}

        {/*
         * Tier-band background: four `<div>` segments stacked
         * horizontally. SVG would also work but a flex row of
         * divs keeps the markup smaller + plays nicely with
         * Tailwind's color utilities for theming.
         */}
        <div className="relative mt-3 flex h-3 w-full overflow-hidden rounded-full" aria-hidden>
          {TIER_BANDS.map((band) => {
            const widthPct = ((band.to - band.from + 1) / (SCORE_MAX - SCORE_MIN + 1)) * 100;
            return (
              <span
                key={band.tier}
                className="h-full opacity-30"
                style={{ width: `${widthPct.toString()}%`, backgroundColor: band.color }}
              />
            );
          })}
        </div>

        {/*
         * Actual-score marker — vertical line + dot. The
         * `motion-safe:transition-[left]` utility plays the 600ms
         * slide animation only when the user has NOT requested
         * `prefers-reduced-motion: reduce`.
         */}
        <span
          className="absolute top-2 h-5 w-0.5 motion-safe:transition-[left] motion-safe:duration-[600ms] motion-safe:ease-out"
          style={{
            left: `${markerLeft.toString()}%`,
            transform: 'translateX(-50%)',
            backgroundColor: tierColor(tier),
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}
