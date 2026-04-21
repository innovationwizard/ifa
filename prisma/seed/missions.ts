/**
 * Mission catalog — global seed.
 *
 * Rule-4 status: REAL (product-defined). Every mission maps directly to
 * scaffolding §9.1.4; this file is the machine-readable encoding of that
 * table. Adding or removing a mission requires updating the scaffolding
 * first so the two stay in lockstep.
 *
 * `slug` is the stable identifier used by the mission engine (S-8.5) and
 * referenced by badges that award mission-completion credit. It also
 * appears in the mission progress URL when the UI deep-links to a
 * specific mission.
 *
 * `condition` is a JSONB predicate evaluated against the current
 * organization's state:
 *   { type: 'onboarding_completed' }
 *   { type: 'integration_connected', integrationType: 'FEL_CERTIFIER' }
 *   { type: 'transactions_reconciled', count: N }
 *   { type: 'reports_generated', count: N, distinct?: boolean,
 *                                  period?: 'week' | 'month' | 'all' }
 *   { type: 'team_invited', count: N }
 *   { type: 'zero_unmatched_consecutive_days', days: N }
 *   { type: 'ai_anomalies_reviewed', period: 'week' }
 *   { type: 'accounting_rules_created_or_refined', count: N, period: 'week' }
 *   { type: 'month_closed_within_business_days', days: N }
 *   { type: 'iva_discrepancies_for_month', max: N }
 *   { type: 'health_score_delta_for_month', min: N }
 *
 * `badgeRewardSlug` resolves to a Badge.id at seed time. The mission
 * seeder wires the FK after both catalogs are inserted.
 */

import type { MissionType } from '@prisma/client';

export interface MissionTemplate {
  /** Stable machine identifier. Used by the engine and deep links. */
  slug: string;
  type: MissionType;
  name: string;
  description: string;
  condition: Record<string, unknown>;
  xpReward: number;
  /** Optional Badge.id string referenced from BADGES_TEMPLATE. */
  badgeRewardId: string | null;
}

export const MISSIONS_TEMPLATE: MissionTemplate[] = [
  // Onboarding — one-shot (§9.1.4)
  {
    slug: 'onboarding_primer_paso',
    type: 'ONBOARDING',
    name: 'Primer Paso',
    description: 'Completa el flujo de configuración inicial.',
    condition: { type: 'onboarding_completed' },
    xpReward: 50,
    badgeRewardId: null,
  },
  {
    slug: 'onboarding_primera_conexion',
    type: 'ONBOARDING',
    name: 'Primera Conexión',
    description: 'Conecta tu certificador FEL o sube tu primer CSV.',
    condition: { type: 'integration_connected', integrationType: 'FEL_CERTIFIER' },
    xpReward: 100,
    badgeRewardId: null,
  },
  {
    slug: 'onboarding_primer_match',
    type: 'ONBOARDING',
    name: 'Primer Match',
    description: 'Concilia tu primera transacción con éxito.',
    condition: { type: 'transactions_reconciled', count: 1 },
    xpReward: 75,
    badgeRewardId: null,
  },
  {
    slug: 'onboarding_primer_reporte',
    type: 'ONBOARDING',
    name: 'Primer Reporte',
    description: 'Genera tu primer reporte financiero.',
    condition: { type: 'reports_generated', count: 1 },
    xpReward: 75,
    badgeRewardId: null,
  },
  {
    slug: 'onboarding_equipo_unido',
    type: 'ONBOARDING',
    name: 'Equipo Unido',
    description: 'Invita a tu primer colaborador o contador.',
    condition: { type: 'team_invited', count: 1 },
    xpReward: 50,
    badgeRewardId: null,
  },

  // Weekly — rotating (§9.1.4)
  {
    slug: 'weekly_conciliador_perfecto',
    type: 'WEEKLY',
    name: 'Conciliador Perfecto',
    description: 'Mantén cero transacciones sin conciliar durante 5 días consecutivos.',
    condition: { type: 'zero_unmatched_consecutive_days', days: 5 },
    xpReward: 150,
    badgeRewardId: 'mission_weekly_conciliador_perfecto',
  },
  {
    slug: 'weekly_detective_de_gastos',
    type: 'WEEKLY',
    name: 'Detective de Gastos',
    description: 'Revisa todas las alertas de anomalías de la semana.',
    condition: { type: 'ai_anomalies_reviewed', period: 'week' },
    xpReward: 100,
    badgeRewardId: null,
  },
  {
    slug: 'weekly_reportero_financiero',
    type: 'WEEKLY',
    name: 'Reportero Financiero',
    description: 'Genera al menos dos reportes distintos esta semana.',
    condition: { type: 'reports_generated', count: 2, distinct: true, period: 'week' },
    xpReward: 75,
    badgeRewardId: null,
  },
  {
    slug: 'weekly_maestro_de_reglas',
    type: 'WEEKLY',
    name: 'Maestro de Reglas',
    description: 'Crea o ajusta tres reglas contables esta semana.',
    condition: { type: 'accounting_rules_created_or_refined', count: 3, period: 'week' },
    xpReward: 100,
    badgeRewardId: null,
  },

  // Monthly — rotating (§9.1.4)
  {
    slug: 'monthly_libros_al_dia',
    type: 'MONTHLY',
    name: 'Libros al Día',
    description: 'Cierra el mes anterior dentro de 5 días hábiles.',
    condition: { type: 'month_closed_within_business_days', days: 5 },
    xpReward: 200,
    badgeRewardId: 'mission_monthly_libros_al_dia',
  },
  {
    slug: 'monthly_iva_perfecto',
    type: 'MONTHLY',
    name: 'IVA Perfecto',
    description: 'Cero discrepancias de IVA durante el mes.',
    condition: { type: 'iva_discrepancies_for_month', max: 0 },
    xpReward: 200,
    badgeRewardId: 'mission_monthly_iva_perfecto',
  },
  {
    slug: 'monthly_crecimiento_financiero',
    type: 'MONTHLY',
    name: 'Crecimiento Financiero',
    description: 'Mejora tu Puntaje de Salud Financiera 50+ puntos en el mes.',
    condition: { type: 'health_score_delta_for_month', min: 50 },
    xpReward: 300,
    badgeRewardId: 'mission_monthly_crecimiento_50',
  },
];
