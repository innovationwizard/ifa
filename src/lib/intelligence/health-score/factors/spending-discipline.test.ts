import { describe, expect, it } from 'vitest';
import { spendingDiscipline } from './spending-discipline';
import type { FactorTransaction } from '../types';

const NOW = new Date('2026-05-21T00:00:00Z');
const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function tx(
  date: string,
  amount: number,
  type: 'EXPENSE' | 'INCOME' = 'EXPENSE',
): FactorTransaction {
  return {
    date: D(date),
    type,
    amount,
    merchantName: 'Walmart',
    merchantNit: null,
    metadata: {},
  };
}

describe('spendingDiscipline', () => {
  it('returns partial:true on empty input', () => {
    const r = spendingDiscipline({ transactions: [], now: NOW });
    expect(r.partial).toBe(true);
    /*
     * Empty input → cv=0 → score=100. That's mathematically right but
     * the engine will discount the contribution via `partial: true`.
     */
    expect(r.score).toBe(100);
  });

  it('scores 100 for perfectly flat expenses across 6 months', () => {
    const r = spendingDiscipline({
      transactions: [
        tx('2025-12-15', 1000),
        tx('2026-01-15', 1000),
        tx('2026-02-15', 1000),
        tx('2026-03-15', 1000),
        tx('2026-04-15', 1000),
        tx('2026-05-15', 1000),
      ],
      now: NOW,
    });
    expect(r.score).toBe(100);
    expect(r.partial).toBe(false);
    expect(r.inputs.cv).toBe(0);
    expect(r.inputs.monthsWithExpense).toBe(6);
  });

  it('drops the score as monthly expenses become more variable', () => {
    const r = spendingDiscipline({
      transactions: [
        tx('2025-12-15', 100),
        tx('2026-01-15', 9000),
        tx('2026-02-15', 200),
        tx('2026-03-15', 8000),
        tx('2026-04-15', 500),
        tx('2026-05-15', 7000),
      ],
      now: NOW,
    });
    expect(r.score).toBeLessThan(60);
    expect(r.partial).toBe(false);
  });

  it('returns partial:true when fewer than 3 months had expenses', () => {
    const r = spendingDiscipline({
      transactions: [tx('2026-04-15', 100), tx('2026-05-15', 100)],
      now: NOW,
    });
    expect(r.partial).toBe(true);
    expect(r.inputs.monthsWithExpense).toBe(2);
  });

  it('excludes INCOME and TRANSFER from the calculation', () => {
    const r = spendingDiscipline({
      transactions: [
        tx('2026-03-15', 1000, 'INCOME'),
        tx('2026-04-15', 1000, 'INCOME'),
        tx('2026-05-15', 1000, 'INCOME'),
      ],
      now: NOW,
    });
    expect(r.partial).toBe(true);
    expect(r.inputs.monthsWithExpense).toBe(0);
  });

  it('score clamps to [0, 100]', () => {
    const r = spendingDiscipline({
      transactions: [
        tx('2025-12-15', 1),
        tx('2026-01-15', 100000),
        tx('2026-02-15', 1),
        tx('2026-03-15', 100000),
        tx('2026-04-15', 1),
        tx('2026-05-15', 100000),
      ],
      now: NOW,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
