import { describe, expect, it } from 'vitest';
import { incomeStability } from './income-stability';
import type { FactorTransaction } from '../types';

const NOW = new Date('2026-05-21T00:00:00Z');
const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function inc(date: string, amount: number): FactorTransaction {
  return {
    date: D(date),
    type: 'INCOME',
    amount,
    merchantName: 'Empresa',
    merchantNit: null,
    metadata: {},
  };
}

describe('incomeStability', () => {
  it('returns partial:true on empty input', () => {
    const r = incomeStability({ transactions: [], now: NOW });
    expect(r.partial).toBe(true);
    expect(r.score).toBe(100);
  });

  it('scores 100 for a flat salary across 6 months', () => {
    const r = incomeStability({
      transactions: [
        inc('2025-12-01', 5000),
        inc('2026-01-01', 5000),
        inc('2026-02-01', 5000),
        inc('2026-03-01', 5000),
        inc('2026-04-01', 5000),
        inc('2026-05-01', 5000),
      ],
      now: NOW,
    });
    expect(r.score).toBe(100);
    expect(r.partial).toBe(false);
    expect(r.inputs.cv).toBe(0);
    expect(r.inputs.monthsWithIncome).toBe(6);
    expect(r.inputs.avgMonthlyIncome).toBe(5000);
  });

  it('drops the score for lumpy contractor income', () => {
    const r = incomeStability({
      transactions: [
        inc('2025-12-15', 500),
        inc('2026-01-15', 8000),
        inc('2026-02-15', 0.01),
        inc('2026-03-15', 12000),
        inc('2026-04-15', 200),
        inc('2026-05-15', 6000),
      ],
      now: NOW,
    });
    expect(r.score).toBeLessThan(60);
    expect(r.partial).toBe(false);
  });

  it('returns partial:true when fewer than 3 months had any income', () => {
    const r = incomeStability({
      transactions: [inc('2026-04-15', 5000), inc('2026-05-15', 5000)],
      now: NOW,
    });
    expect(r.partial).toBe(true);
    expect(r.inputs.monthsWithIncome).toBe(2);
  });

  it('score clamps to [0, 100]', () => {
    const r = incomeStability({
      transactions: [
        inc('2025-12-15', 1),
        inc('2026-01-15', 1_000_000),
        inc('2026-02-15', 1),
        inc('2026-03-15', 1_000_000),
        inc('2026-04-15', 1),
        inc('2026-05-15', 1_000_000),
      ],
      now: NOW,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
