/**
 * Badge catalog — global seed.
 *
 * Rule-4 status: REAL (product-defined). The IFA gamification system
 * specifies badge IDs as semantic slugs (scaffolding §9.1.5 and the plan
 * §S-1.13), not invented data. Every row below ties directly to a
 * scaffolding section that justifies its existence.
 *
 * Categories per scaffolding §9.1.5:
 *   STREAK      — time-based retention milestones (§9.1.3)
 *   MASTERY     — volume-based mastery (reconciliations, reports, rules)
 *   HEALTH      — Financial Health Score zone crossings (§8.1)
 *   SPEED       — speed-of-execution rewards
 *   CONSISTENCY — long-horizon behavior
 *   EXPLORER    — feature-discovery rewards
 *
 * `iconName` resolves to a lucide-react component at render time. Names
 * must exist in the installed `lucide-react` package (v1.8.0).
 *
 * `condition` is a JSONB predicate evaluated by the badge unlock
 * service (S-8.7). Shape per category:
 *   STREAK:      { type: 'streak_days', days: N }
 *   MASTERY:     { type: 'count', metric: '<name>', threshold: N }
 *   HEALTH:      { type: 'score_reached', score: N }
 *   SPEED:       { type: 'event', name: '<name>' }
 *   CONSISTENCY: { type: 'consecutive_months_closed_on_time', months: N }
 *   EXPLORER:    { type: 'used_all_features' }
 *   MISSION:     { type: 'mission_completed', missionSlug: '<slug>' }
 */

import type { BadgeCategory } from '@prisma/client';

export interface BadgeTemplate {
  id: string;
  name: string;
  description: string;
  iconName: string;
  category: BadgeCategory;
  condition: Record<string, unknown>;
  xpReward: number;
}

export const BADGES_TEMPLATE: BadgeTemplate[] = [
  // Streak milestones (§9.1.3)
  {
    id: 'streak_7',
    name: 'Racha de 7 días',
    description: 'Una semana completa manteniendo tu hábito financiero.',
    iconName: 'Flame',
    category: 'STREAK',
    condition: { type: 'streak_days', days: 7 },
    xpReward: 50,
  },
  {
    id: 'streak_30',
    name: 'Racha de 30 días',
    description: 'Un mes completo de disciplina financiera.',
    iconName: 'Flame',
    category: 'STREAK',
    condition: { type: 'streak_days', days: 30 },
    xpReward: 150,
  },
  {
    id: 'streak_90',
    name: 'Racha de 90 días',
    description: 'Un trimestre entero sin perder el ritmo.',
    iconName: 'Flame',
    category: 'STREAK',
    condition: { type: 'streak_days', days: 90 },
    xpReward: 400,
  },
  {
    id: 'streak_180',
    name: 'Racha de 180 días',
    description: 'Medio año de constancia financiera.',
    iconName: 'Flame',
    category: 'STREAK',
    condition: { type: 'streak_days', days: 180 },
    xpReward: 800,
  },
  {
    id: 'streak_365',
    name: 'Racha de 365 días',
    description: 'Un año completo. Disciplina excepcional.',
    iconName: 'Flame',
    category: 'STREAK',
    condition: { type: 'streak_days', days: 365 },
    xpReward: 2000,
  },

  // Mastery milestones (§9.1.5)
  {
    id: 'mastery_reconciliations_100',
    name: '100 Conciliaciones',
    description: 'Has conciliado cien transacciones.',
    iconName: 'CheckCheck',
    category: 'MASTERY',
    condition: { type: 'count', metric: 'reconciliations_total', threshold: 100 },
    xpReward: 100,
  },
  {
    id: 'mastery_reconciliations_1000',
    name: '1,000 Conciliaciones',
    description: 'Mil transacciones conciliadas. Eres un experto.',
    iconName: 'Award',
    category: 'MASTERY',
    condition: { type: 'count', metric: 'reconciliations_total', threshold: 1000 },
    xpReward: 500,
  },
  {
    id: 'mastery_reports_100',
    name: '100 Reportes Generados',
    description: 'Cien reportes financieros producidos.',
    iconName: 'FileBarChart',
    category: 'MASTERY',
    condition: { type: 'count', metric: 'reports_generated_total', threshold: 100 },
    xpReward: 300,
  },
  {
    id: 'mastery_rules_10',
    name: 'Maestro de Reglas (10)',
    description: 'Has creado diez reglas contables que automatizan tu trabajo.',
    iconName: 'Settings2',
    category: 'MASTERY',
    condition: { type: 'count', metric: 'accounting_rules_created', threshold: 10 },
    xpReward: 150,
  },

  // Health zones (§8.1)
  {
    id: 'health_stable_500',
    name: 'Salud Financiera: Estable',
    description: 'Tu Puntaje de Salud Financiera alcanzó 500.',
    iconName: 'Gauge',
    category: 'HEALTH',
    condition: { type: 'score_reached', score: 500 },
    xpReward: 100,
  },
  {
    id: 'health_healthy_700',
    name: 'Salud Financiera: Saludable',
    description: 'Tu Puntaje de Salud Financiera alcanzó 700.',
    iconName: 'Gauge',
    category: 'HEALTH',
    condition: { type: 'score_reached', score: 700 },
    xpReward: 250,
  },
  {
    id: 'health_excellent_850',
    name: 'Salud Financiera: Excelente',
    description: 'Tu Puntaje de Salud Financiera alcanzó 850.',
    iconName: 'Gauge',
    category: 'HEALTH',
    condition: { type: 'score_reached', score: 850 },
    xpReward: 500,
  },

  // Speed (§9.1.5)
  {
    id: 'speed_month_close_24h',
    name: 'Cierre en 24 horas',
    description: 'Cerraste el mes contable en menos de 24 horas tras fin de mes.',
    iconName: 'Zap',
    category: 'SPEED',
    condition: { type: 'event', name: 'month_closed_within_24h' },
    xpReward: 150,
  },
  {
    id: 'speed_perfect_reconciliation_day',
    name: 'Día de Conciliación Perfecta',
    description: 'Cerraste el día con cero transacciones sin conciliar.',
    iconName: 'Zap',
    category: 'SPEED',
    condition: { type: 'event', name: 'zero_unmatched_end_of_day' },
    xpReward: 100,
  },

  // Consistency (§9.1.5)
  {
    id: 'consistency_12_months',
    name: 'Año Perfecto',
    description: 'Cerraste doce meses consecutivos a tiempo.',
    iconName: 'CalendarCheck',
    category: 'CONSISTENCY',
    condition: { type: 'consecutive_months_closed_on_time', months: 12 },
    xpReward: 1000,
  },

  // Explorer (§9.1.5)
  {
    id: 'explorer_all_features',
    name: 'Explorador Completo',
    description: 'Usaste cada módulo de IFA al menos una vez.',
    iconName: 'Compass',
    category: 'EXPLORER',
    condition: { type: 'used_all_features' },
    xpReward: 200,
  },

  // Mission-reward badges (referenced from prisma/seed/missions.ts)
  {
    id: 'mission_weekly_conciliador_perfecto',
    name: 'Conciliador Perfecto',
    description: 'Cinco días seguidos con cero transacciones sin conciliar.',
    iconName: 'CheckCircle2',
    category: 'MASTERY',
    condition: { type: 'mission_completed', missionSlug: 'weekly_conciliador_perfecto' },
    xpReward: 0,
  },
  {
    id: 'mission_monthly_libros_al_dia',
    name: 'Libros al Día',
    description: 'Cerraste el mes en cinco días hábiles o menos.',
    iconName: 'BookOpenCheck',
    category: 'SPEED',
    condition: { type: 'mission_completed', missionSlug: 'monthly_libros_al_dia' },
    xpReward: 0,
  },
  {
    id: 'mission_monthly_iva_perfecto',
    name: 'IVA Perfecto',
    description: 'Un mes completo sin discrepancias en IVA.',
    iconName: 'Receipt',
    category: 'MASTERY',
    condition: { type: 'mission_completed', missionSlug: 'monthly_iva_perfecto' },
    xpReward: 0,
  },
  {
    id: 'mission_monthly_crecimiento_50',
    name: 'Crecimiento +50',
    description: 'Mejoraste tu Puntaje de Salud Financiera 50+ puntos en el mes.',
    iconName: 'TrendingUp',
    category: 'HEALTH',
    condition: { type: 'mission_completed', missionSlug: 'monthly_crecimiento_50' },
    xpReward: 0,
  },
];
