import { describe, expect, it } from 'vitest';
import {
  bucketByMonth,
  clamp,
  coefficientOfVariation,
  isInRange,
  lastNMonthsWindow,
  merchantKey,
  monthsWithExpense,
  monthsWithIncome,
} from './helpers';
import type { FactorTransaction } from './types';

const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function tx(overrides: Partial<FactorTransaction> = {}): FactorTransaction {
  return {
    date: D('2026-04-15'),
    type: 'EXPENSE',
    amount: 100,
    merchantName: 'Walmart',
    merchantNit: '2345678-9',
    metadata: {},
    ...overrides,
  };
}

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps to lower bound when below', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });
  it('clamps to upper bound when above', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it('returns the lower bound for non-finite inputs (defensive)', () => {
    expect(clamp(Number.NaN, 0, 10)).toBe(0);
    expect(clamp(Number.POSITIVE_INFINITY, 0, 10)).toBe(0);
  });
});

describe('coefficientOfVariation', () => {
  it('returns 0 for n < 2 (CV undefined)', () => {
    expect(coefficientOfVariation([])).toBe(0);
    expect(coefficientOfVariation([100])).toBe(0);
  });
  it('returns 0 when all values are equal (no variability)', () => {
    expect(coefficientOfVariation([50, 50, 50, 50])).toBe(0);
  });
  it('returns 0 when mean is 0 (divide-by-zero guard)', () => {
    expect(coefficientOfVariation([-10, 10, -5, 5])).toBe(0);
  });
  it('computes a known CV with sample stdDev', () => {
    /*
     * [100, 200] → mean 150, sample stdDev = sqrt((50² + 50²) / 1) =
     * sqrt(5000) ≈ 70.711. CV = 70.711 / 150 ≈ 0.4714.
     */
    expect(coefficientOfVariation([100, 200])).toBeCloseTo(70.7107 / 150, 4);
  });
  it('is symmetric in input order', () => {
    const a = coefficientOfVariation([100, 120, 90, 110, 105]);
    const b = coefficientOfVariation([105, 90, 120, 100, 110]);
    expect(a).toBe(b);
  });
});

describe('lastNMonthsWindow', () => {
  const NOW = D('2026-05-21');

  it('6-month window ends today and starts on first-of-month 5 months ago', () => {
    const { from, to } = lastNMonthsWindow(NOW, 6);
    expect(from.toISOString().slice(0, 10)).toBe('2025-12-01');
    expect(to.toISOString().slice(0, 10)).toBe('2026-05-21');
  });
  it('3-month window ends today and starts on first-of-month 2 months ago', () => {
    const { from, to } = lastNMonthsWindow(NOW, 3);
    expect(from.toISOString().slice(0, 10)).toBe('2026-03-01');
    expect(to.toISOString().slice(0, 10)).toBe('2026-05-21');
  });
  it('crosses year boundary correctly', () => {
    const { from } = lastNMonthsWindow(D('2026-02-15'), 6);
    expect(from.toISOString().slice(0, 10)).toBe('2025-09-01');
  });
});

describe('isInRange', () => {
  it('is inclusive on both bounds', () => {
    const from = D('2026-04-01');
    const to = D('2026-04-30');
    expect(isInRange(from, from, to)).toBe(true);
    expect(isInRange(to, from, to)).toBe(true);
    expect(isInRange(D('2026-04-15'), from, to)).toBe(true);
    expect(isInRange(D('2026-03-31'), from, to)).toBe(false);
    expect(isInRange(D('2026-05-01'), from, to)).toBe(false);
  });
});

describe('bucketByMonth', () => {
  it('returns one bucket per month in range, with missing months zeroed', () => {
    const result = bucketByMonth([tx({ date: D('2026-02-10'), type: 'INCOME', amount: 1000 })], {
      from: D('2026-01-01'),
      to: D('2026-03-31'),
    });
    expect(result.map((b) => b.monthKey)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(result[0]).toEqual({ monthKey: '2026-01', income: 0, expense: 0, net: 0 });
    expect(result[1]).toEqual({ monthKey: '2026-02', income: 1000, expense: 0, net: 1000 });
  });
  it('excludes TRANSFER rows from income/expense sums', () => {
    const result = bucketByMonth(
      [
        tx({ date: D('2026-04-01'), type: 'INCOME', amount: 500 }),
        tx({ date: D('2026-04-05'), type: 'TRANSFER', amount: 9999 }),
        tx({ date: D('2026-04-20'), type: 'EXPENSE', amount: 200 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result[0]).toEqual({ monthKey: '2026-04', income: 500, expense: 200, net: 300 });
  });
  it('drops out-of-range transactions', () => {
    const result = bucketByMonth(
      [
        tx({ date: D('2026-03-31'), type: 'EXPENSE', amount: 999 }),
        tx({ date: D('2026-04-15'), type: 'EXPENSE', amount: 100 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result[0]?.expense).toBe(100);
  });
  it('returns an empty array when from > to (invalid range)', () => {
    expect(bucketByMonth([], { from: D('2026-05-01'), to: D('2026-04-01') })).toEqual([]);
  });
});

describe('merchantKey', () => {
  it('prefers NIT when present', () => {
    expect(merchantKey(tx({ merchantNit: '1234567-8', merchantName: 'X' }))).toBe('nit:1234567-8');
  });
  it('falls back to lowercased name when NIT is missing', () => {
    expect(merchantKey(tx({ merchantNit: null, merchantName: 'Walmart' }))).toBe('name:walmart');
  });
  it('returns null when both are missing', () => {
    expect(merchantKey(tx({ merchantNit: null, merchantName: null }))).toBeNull();
    expect(merchantKey(tx({ merchantNit: '   ', merchantName: '' }))).toBeNull();
  });
});

describe('monthsWithExpense / monthsWithIncome', () => {
  it('counts only buckets with > 0 of the relevant flow', () => {
    const buckets = [
      { monthKey: '2026-01', income: 0, expense: 100, net: -100 },
      { monthKey: '2026-02', income: 500, expense: 0, net: 500 },
      { monthKey: '2026-03', income: 0, expense: 0, net: 0 },
      { monthKey: '2026-04', income: 500, expense: 200, net: 300 },
    ];
    expect(monthsWithExpense(buckets)).toBe(2);
    expect(monthsWithIncome(buckets)).toBe(2);
  });
});
