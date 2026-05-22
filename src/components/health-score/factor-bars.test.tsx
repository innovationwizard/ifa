import { describe, expect, it } from 'vitest';
import { buildFactorBarRows, type FactorBarRow } from './factor-bars';
import { scoreTier, tierColor } from './tier';

/*
 * We exercise the pure `buildFactorBarRows` helper instead of
 * rendering the React component. Recharts' `ResponsiveContainer`
 * measures its parent and renders nothing when width is 0 — which
 * is exactly what jsdom reports — so in-DOM assertions against
 * Recharts SVG silently pass-through with no chart mounted. The
 * helper encapsulates the testable logic (sort order, label
 * lookup, color mapping), letting the component own only the
 * Recharts shell.
 */

const LABELS: Record<string, string> = {
  spendingDiscipline: 'Disciplina de gasto',
  incomeStability: 'Estabilidad de ingresos',
  savingsRate: 'Tasa de ahorro',
  cashFlowConsistency: 'Consistencia del flujo',
  recurringSpending: 'Gasto recurrente',
  anomalyRate: 'Movimientos inusuales',
};

function row(key: string, score: number, partial = false): FactorBarRow {
  return { key, score, partial, inputs: {} };
}

const lookup = (key: string) => LABELS[key] ?? key;

describe('buildFactorBarRows', () => {
  it('sorts rows by score descending (strongest first)', () => {
    const rows = buildFactorBarRows(
      [
        row('spendingDiscipline', 45),
        row('savingsRate', 30),
        row('incomeStability', 85),
        row('cashFlowConsistency', 65),
        row('recurringSpending', 50),
        row('anomalyRate', 90),
      ],
      lookup,
    );

    expect(rows.map((r) => r.key)).toEqual([
      'anomalyRate',
      'incomeStability',
      'cashFlowConsistency',
      'recurringSpending',
      'spendingDiscipline',
      'savingsRate',
    ]);
  });

  it('translates each row.key into a human label via the lookup callback', () => {
    const rows = buildFactorBarRows([row('savingsRate', 70)], lookup);
    expect(rows[0]?.label).toBe('Tasa de ahorro');
  });

  it('falls through the lookup for unknown keys (helper does not throw)', () => {
    const rows = buildFactorBarRows([row('unknownKey', 50)], lookup);
    expect(rows[0]?.label).toBe('unknownKey');
  });

  it('colors each row from the tier mapping of (score × 10)', () => {
    /*
     * Sub-scores are [0,100]; tier-bands are [0,1000]. The helper
     * scales by 10 before tier-lookup so a factor scoring 45/100
     * lands in the same "Crítico" band as an overall 450/1000.
     */
    const rows = buildFactorBarRows(
      [
        row('a', 30), // 300/1000 → critico → red
        row('b', 45), // 450/1000 → enRiesgo → amber
        row('c', 70), // 700/1000 → estable → teal
        row('d', 85), // 850/1000 → excelente → deep teal
      ],
      (k) => k,
    );

    const colors = Object.fromEntries(rows.map((r) => [r.key, r.color]));
    expect(colors.d).toBe(tierColor(scoreTier(850)));
    expect(colors.c).toBe(tierColor(scoreTier(700)));
    expect(colors.b).toBe(tierColor(scoreTier(450)));
    expect(colors.a).toBe(tierColor(scoreTier(300)));
  });

  it('preserves the partial flag and raw inputs verbatim', () => {
    const rows = buildFactorBarRows(
      [{ key: 'savingsRate', score: 60, partial: true, inputs: { months: 2, saved: 1500 } }],
      lookup,
    );
    expect(rows[0]?.partial).toBe(true);
    expect(rows[0]?.inputs).toEqual({ months: 2, saved: 1500 });
  });

  it('does not mutate the caller-supplied array', () => {
    const input: FactorBarRow[] = [row('a', 10), row('b', 80), row('c', 50)];
    const snapshot = [...input];
    buildFactorBarRows(input, (k) => k);
    expect(input).toEqual(snapshot);
  });
});
