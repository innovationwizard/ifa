import type { FactorKey } from './types';
import type { FactorBreakdown, HealthScoreSnapshot } from './engine';
import { FACTOR_WEIGHTS } from './factors';

/**
 * Rule-based improvement suggestions for a Health Score snapshot
 * (Phase 6/7 Batch 10).
 *
 * Pure. Transparent. No AI calls — every line of copy a user sees
 * is traceable to a rule below. AI-generated improvement copy can
 * land later (Phase 8?), but per the plan's risk note this
 * rule-based version stays as the always-honest fallback.
 *
 * Strategy: produce 2–4 actions sorted by `estimatedImpact DESC`.
 * Each action is anchored to a specific factor and includes:
 *   - `actionType` — stable machine key (so the engine can dedup
 *     actions across snapshots and the UI can render per-type
 *     icons)
 *   - `description` — Spanish, tú-register, lower-elementary
 *     vocabulary per IFA's mandate. Includes the current value
 *     and the points the user would gain by hitting the target.
 *   - `estimatedImpact` — projected score delta if the user
 *     reaches the "good" threshold for this factor. Computed as
 *     `(targetScore − currentScore) × factorWeight / 10` so it
 *     lands in the 0–1000 final-score units.
 *   - `priority` — defaults to 100. Lower = more urgent. The UI
 *     can use this for visual emphasis independent of impact.
 *
 * Selection rule: rank candidate actions by `estimatedImpact DESC`,
 * keep the top 4. Always include at least 2 if any factor is below
 * 90 — keeps the UI from showing an empty improvement list during
 * the user's middling-but-not-bad period.
 */

export interface ImprovementAction {
  actionType: string;
  factorKey: FactorKey;
  description: string;
  estimatedImpact: number;
  priority: number;
}

const MAX_ACTIONS = 4;
const MIN_ACTIONS_WHEN_BELOW_CEILING = 2;
/** Score above which we consider a factor "good enough" and don't suggest an improvement. */
const GOOD_ENOUGH_THRESHOLD = 90;
/** Target score we project the user reaching after acting. */
const TARGET_SCORE = 90;

interface Rule {
  key: FactorKey;
  actionType: string;
  /** Build the user-facing copy given the breakdown's `inputs` map. */
  describe(breakdown: FactorBreakdown): string;
  priority: number;
}

const RULES: Rule[] = [
  {
    key: 'savingsRate',
    actionType: 'increase_savings_rate',
    priority: 10,
    describe(b) {
      const ratePct = ((b.inputs.rate ?? 0) * 100).toFixed(0);
      return `Tu ahorro está en ${ratePct}% de tu ingreso. Sube a 30% para llegar al máximo de este factor.`;
    },
  },
  {
    key: 'spendingDiscipline',
    actionType: 'stabilize_monthly_spending',
    priority: 20,
    describe(b) {
      const cvPct = ((b.inputs.cv ?? 0) * 100).toFixed(0);
      return `Tus gastos cambian mucho de un mes a otro (variabilidad ${cvPct}%). Apunta a un total mensual más parecido cada mes.`;
    },
  },
  {
    key: 'incomeStability',
    actionType: 'stabilize_income',
    priority: 30,
    describe(b) {
      const cvPct = ((b.inputs.cv ?? 0) * 100).toFixed(0);
      return `Tus ingresos varían bastante entre meses (variabilidad ${cvPct}%). Estabilizarlos sube tu puntaje.`;
    },
  },
  {
    key: 'cashFlowConsistency',
    actionType: 'smooth_cash_flow',
    priority: 40,
    describe() {
      return `Tu flujo neto mensual (ingresos menos gastos) no es estable. Mantén un colchón parecido cada mes.`;
    },
  },
  {
    key: 'recurringSpending',
    actionType: 'identify_recurring_expenses',
    priority: 50,
    describe(b) {
      const recurring = b.inputs.recurringCount ?? 0;
      const total = b.inputs.totalExpenses ?? 0;
      return `Solo ${recurring} de ${total} movimientos son en comercios habituales. Saber dónde gastas seguido te ayuda a presupuestar mejor.`;
    },
  },
  {
    key: 'anomalyRate',
    actionType: 'review_unusual_spending',
    priority: 15,
    describe(b) {
      const count = b.inputs.anomalyCount ?? 0;
      return `Detectamos ${count} movimiento(s) inusual(es) en los últimos 3 meses. Revísalos y márcalos para mejorar este factor.`;
    },
  },
];

function impactPoints(factor: FactorBreakdown): number {
  const gap = TARGET_SCORE - factor.score;
  if (gap <= 0) return 0;
  return Math.round((gap * factor.weight) / 10);
}

export function generateImprovements(snapshot: HealthScoreSnapshot): ImprovementAction[] {
  const breakdownByKey = new Map<FactorKey, FactorBreakdown>(
    snapshot.factors.map((f) => [f.key, f]),
  );

  const candidates: ImprovementAction[] = [];
  for (const rule of RULES) {
    const breakdown = breakdownByKey.get(rule.key);
    if (!breakdown) continue;
    if (breakdown.score >= GOOD_ENOUGH_THRESHOLD) continue;
    /*
     * Don't suggest acting on a `partial` factor — by definition
     * we don't have enough data to know the user's current
     * standing. Showing "increase your savings rate" to a user
     * with one month of data is noise, not insight.
     */
    if (breakdown.partial) continue;

    candidates.push({
      actionType: rule.actionType,
      factorKey: rule.key,
      description: rule.describe(breakdown),
      estimatedImpact: impactPoints(breakdown),
      priority: rule.priority,
    });
  }

  candidates.sort((a, b) => b.estimatedImpact - a.estimatedImpact);

  if (candidates.length >= MIN_ACTIONS_WHEN_BELOW_CEILING) {
    return candidates.slice(0, MAX_ACTIONS);
  }

  /*
   * Fallback: when nothing below GOOD_ENOUGH_THRESHOLD survived
   * the `partial` filter, surface the lowest-scoring non-partial
   * factors anyway so the user always sees at least one improvement
   * suggestion when there's room above 90 to grow.
   */
  const survivors = snapshot.factors
    .filter((f) => !f.partial && f.score < 100)
    .sort((a, b) => a.score - b.score);

  for (const factor of survivors) {
    if (candidates.length >= MIN_ACTIONS_WHEN_BELOW_CEILING) break;
    if (candidates.some((c) => c.factorKey === factor.key)) continue;
    const rule = RULES.find((r) => r.key === factor.key);
    if (!rule) continue;
    candidates.push({
      actionType: rule.actionType,
      factorKey: factor.key,
      description: rule.describe(factor),
      estimatedImpact: impactPoints(factor),
      priority: rule.priority,
    });
  }

  return candidates.slice(0, MAX_ACTIONS);
}

/**
 * Total factor weight covered by the rules. Sanity-checked by the
 * test suite — every factor in `FACTOR_WEIGHTS` must have a rule so
 * we never silently miss a coachable factor when the weights table
 * is edited.
 */
export const RULE_FACTOR_KEYS: ReadonlySet<FactorKey> = new Set(RULES.map((r) => r.key));

/** Re-export for tests so they can assert symmetry. */
export const ALL_FACTOR_KEYS: ReadonlySet<FactorKey> = new Set(
  Object.keys(FACTOR_WEIGHTS) as FactorKey[],
);
