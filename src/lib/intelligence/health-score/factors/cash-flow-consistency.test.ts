import { describe, expect, it } from 'vitest';
import { cashFlowConsistency } from './cash-flow-consistency';
import type { FactorTransaction } from '../types';

const NOW = new Date('2026-05-21T00:00:00Z');
const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function tx(date: string, amount: number, type: 'INCOME' | 'EXPENSE'): FactorTransaction {
  return {
    date: D(date),
    type,
    amount,
    merchantName: 'X',
    merchantNit: null,
    metadata: {},
  };
}

describe('cashFlowConsistency', () => {
  it('returns partial:true on empty input', () => {
    const r = cashFlowConsistency({ transactions: [], now: NOW });
    expect(r.partial).toBe(true);
    expect(r.score).toBe(100);
  });

  it('scores 100 when monthly net is identical across 6 months', () => {
    /*
     * Each month: 5000 income − 3000 expense = 2000 net. Six identical
     * months → CV=0 → score=100.
     */
    const months = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05'];
    const transactions: FactorTransaction[] = [];
    for (const m of months) {
      transactions.push(tx(`${m}-15`, 5000, 'INCOME'));
      transactions.push(tx(`${m}-20`, 3000, 'EXPENSE'));
    }
    const r = cashFlowConsistency({ transactions, now: NOW });
    expect(r.score).toBe(100);
    expect(r.partial).toBe(false);
    expect(r.inputs.cv).toBe(0);
    expect(r.inputs.avgMonthlyNet).toBe(2000);
  });

  it('drops the score when net swings wildly', () => {
    const r = cashFlowConsistency({
      transactions: [
        tx('2025-12-15', 5000, 'INCOME'),
        tx('2025-12-20', 9000, 'EXPENSE'),
        tx('2026-01-15', 5000, 'INCOME'),
        tx('2026-01-20', 100, 'EXPENSE'),
        tx('2026-02-15', 5000, 'INCOME'),
        tx('2026-02-20', 12000, 'EXPENSE'),
        tx('2026-03-15', 5000, 'INCOME'),
        tx('2026-03-20', 200, 'EXPENSE'),
        tx('2026-04-15', 5000, 'INCOME'),
        tx('2026-04-20', 9500, 'EXPENSE'),
        tx('2026-05-15', 5000, 'INCOME'),
        tx('2026-05-20', 50, 'EXPENSE'),
      ],
      now: NOW,
    });
    expect(r.score).toBeLessThan(50);
  });

  it('returns partial:true when fewer than 3 months had any movement', () => {
    const r = cashFlowConsistency({
      transactions: [tx('2026-04-15', 5000, 'INCOME'), tx('2026-05-15', 5000, 'INCOME')],
      now: NOW,
    });
    expect(r.partial).toBe(true);
    expect(r.inputs.monthsWithMovement).toBe(2);
  });

  it('score clamps to [0, 100]', () => {
    const r = cashFlowConsistency({
      transactions: [
        tx('2025-12-15', 100, 'INCOME'),
        tx('2025-12-20', 99999, 'EXPENSE'),
        tx('2026-01-15', 99999, 'INCOME'),
        tx('2026-01-20', 1, 'EXPENSE'),
        tx('2026-02-15', 1, 'INCOME'),
        tx('2026-02-20', 99999, 'EXPENSE'),
      ],
      now: NOW,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});
