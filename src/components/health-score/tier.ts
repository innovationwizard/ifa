/**
 * Health Score tier helper (Phase 6/7 Batch 12).
 *
 * Maps a 0–1000 score onto one of four qualitative tiers and the
 * brand color associated with it. The tier-band cutoffs match
 * §2 of `_PHASE_6_7_PLAN.md` and are referenced by:
 *
 *   - `<HealthScoreBullet>` (this batch) — band background fills
 *   - the dashboard widget (Batch 14) — color of the wrapping card
 *   - the demo kit (frozen) — already encoded this same scheme
 *
 * Boundaries (inclusive on the LOWER bound of each tier):
 *
 *     0   – 399   → critico       red    (#dc2626 / --color-ifa-error)
 *     400 – 599   → enRiesgo      amber  (#e5930b / --color-ifa-warning)
 *     600 – 799   → estable       teal   (#0fa698 / --color-ifa-teal-500)
 *     800 – 1000  → excelente     deep teal (#0d847a / --color-ifa-teal-600)
 *
 * `scoreTier(score)` is pure and clamps to the tier matching the
 * clamped-to-[0,1000] value. Out-of-range inputs (negative, NaN, >1000)
 * land in the nearest valid tier rather than throwing — the UI never
 * crashes on a malformed score from the API.
 */

export type ScoreTier = 'critico' | 'enRiesgo' | 'estable' | 'excelente';

export const TIER_BANDS = [
  { tier: 'critico', from: 0, to: 399, color: '#dc2626' },
  { tier: 'enRiesgo', from: 400, to: 599, color: '#e5930b' },
  { tier: 'estable', from: 600, to: 799, color: '#0fa698' },
  { tier: 'excelente', from: 800, to: 1000, color: '#0d847a' },
] as const satisfies readonly {
  tier: ScoreTier;
  from: number;
  to: number;
  color: string;
}[];

/** Range bounds for the bullet chart's x-axis. */
export const SCORE_MIN = 0;
export const SCORE_MAX = 1000;

/**
 * Resolve a tier for a numeric score. Pure, clamps to `[SCORE_MIN,
 * SCORE_MAX]`, NaN-safe.
 */
export function scoreTier(rawScore: number): ScoreTier {
  if (!Number.isFinite(rawScore)) return 'critico';
  const score = Math.min(Math.max(rawScore, SCORE_MIN), SCORE_MAX);
  for (const band of TIER_BANDS) {
    if (score >= band.from && score <= band.to) return band.tier;
  }
  // Defensive — TIER_BANDS covers the full [0, 1000] range so this is unreachable.
  return 'critico';
}

/** Look up the brand color associated with a tier. */
export function tierColor(tier: ScoreTier): string {
  const found = TIER_BANDS.find((b) => b.tier === tier);
  return found?.color ?? TIER_BANDS[0].color;
}
