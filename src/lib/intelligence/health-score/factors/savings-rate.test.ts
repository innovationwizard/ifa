import { describe, expect, it } from 'vitest';
import { savingsRate } from './savings-rate';
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

describe('savingsRate', () => {
  it('returns partial:true + score 0 on empty input', () => {
    const r = savingsRate({ transactions: [], now: NOW });
    expect(r.partial).toBe(true);
    expect(r.score).toBe(0);
    expect(r.inputs.rate).toBe(0);
  });

  it('scores 100 when saving exactly 30% (the target)', () => {
    const r = savingsRate({
      transactions: [
        tx('2026-03-15', 10000, 'INCOME'),
        tx('2026-03-15', 7000, 'EXPENSE'),
        tx('2026-04-15', 10000, 'INCOME'),
        tx('2026-04-15', 7000, 'EXPENSE'),
        tx('2026-05-15', 10000, 'INCOME'),
        tx('2026-05-15', 7000, 'EXPENSE'),
      ],
      now: NOW,
    });
    expect(r.score).toBe(100);
    expect(r.inputs.rate).toBeCloseTo(0.3, 5);
    expect(r.partial).toBe(false);
  });

  it('scores >= 100 when saving more than 30% (clamps at 100)', () => {
    const r = savingsRate({
      transactions: [
        tx('2026-03-15', 10000, 'INCOME'),
        tx('2026-03-15', 1000, 'EXPENSE'),
        tx('2026-04-15', 10000, 'INCOME'),
        tx('2026-04-15', 1000, 'EXPENSE'),
        tx('2026-05-15', 10000, 'INCOME'),
        tx('2026-05-15', 1000, 'EXPENSE'),
      ],
      now: NOW,
    });
    expect(r.score).toBe(100);
    expect(r.inputs.rate).toBeCloseTo(0.9, 5);
    expect(r.inputs.clampedRate).toBe(0.3);
  });

  it('scores 50 at exactly 15% savings (half the target)', () => {
    const r = savingsRate({
      transactions: [
        tx('2026-03-15', 10000, 'INCOME'),
        tx('2026-03-15', 8500, 'EXPENSE'),
        tx('2026-04-15', 10000, 'INCOME'),
        tx('2026-04-15', 8500, 'EXPENSE'),
        tx('2026-05-15', 10000, 'INCOME'),
        tx('2026-05-15', 8500, 'EXPENSE'),
      ],
      now: NOW,
    });
    expect(r.score).toBeCloseTo(50, 1);
    expect(r.inputs.rate).toBeCloseTo(0.15, 5);
  });

  it('scores 0 when spending equals income', () => {
    const r = savingsRate({
      transactions: [
        tx('2026-03-15', 5000, 'INCOME'),
        tx('2026-03-15', 5000, 'EXPENSE'),
        tx('2026-04-15', 5000, 'INCOME'),
        tx('2026-04-15', 5000, 'EXPENSE'),
        tx('2026-05-15', 5000, 'INCOME'),
        tx('2026-05-15', 5000, 'EXPENSE'),
      ],
      now: NOW,
    });
    expect(r.score).toBe(0);
    expect(r.partial).toBe(false);
  });

  it('scores 0 when spending exceeds income (negative rate clamps at 0)', () => {
    const r = savingsRate({
      transactions: [
        tx('2026-03-15', 1000, 'INCOME'),
        tx('2026-03-15', 5000, 'EXPENSE'),
        tx('2026-04-15', 1000, 'INCOME'),
        tx('2026-04-15', 5000, 'EXPENSE'),
        tx('2026-05-15', 1000, 'INCOME'),
        tx('2026-05-15', 5000, 'EXPENSE'),
      ],
      now: NOW,
    });
    expect(r.score).toBe(0);
    expect(r.inputs.rate).toBeLessThan(0);
    expect(r.inputs.clampedRate).toBe(0);
  });

  it('returns partial:true when fewer than 3 months carry income', () => {
    const r = savingsRate({
      transactions: [tx('2026-05-15', 5000, 'INCOME'), tx('2026-05-15', 3500, 'EXPENSE')],
      now: NOW,
    });
    expect(r.partial).toBe(true);
  });
});
