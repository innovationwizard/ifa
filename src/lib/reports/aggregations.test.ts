import { describe, expect, it } from 'vitest';
import {
  type AggregationInput,
  UNCATEGORIZED_LABEL,
  UNKNOWN_MERCHANT_LABEL,
  monthlyCashFlow,
  spendingByCategory,
  topMerchants,
} from './aggregations';

const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function tx(overrides: Partial<AggregationInput> = {}): AggregationInput {
  return {
    date: D('2026-04-15'),
    type: 'EXPENSE',
    amount: 100,
    category: 'Alimentación',
    merchantName: 'Walmart',
    merchantNit: '2345678-9',
    ...overrides,
  };
}

describe('monthlyCashFlow', () => {
  it('returns an empty array when from > to (invalid range)', () => {
    expect(monthlyCashFlow([], { from: D('2026-05-01'), to: D('2026-04-01') })).toEqual([]);
  });

  it('returns an empty array when transactions is empty AND range is empty', () => {
    expect(monthlyCashFlow([], { from: D('2026-05-01'), to: D('2026-04-01') })).toEqual([]);
  });

  it('fills missing months with zeros when transactions are sparse', () => {
    const result = monthlyCashFlow(
      [
        tx({ date: D('2026-02-10'), type: 'INCOME', amount: 5000 }),
        tx({ date: D('2026-04-15'), type: 'EXPENSE', amount: 1200 }),
      ],
      { from: D('2026-01-01'), to: D('2026-04-30') },
    );
    expect(result).toEqual([
      { month: '2026-01', income: 0, expense: 0, net: 0 },
      { month: '2026-02', income: 5000, expense: 0, net: 5000 },
      { month: '2026-03', income: 0, expense: 0, net: 0 },
      { month: '2026-04', income: 0, expense: 1200, net: -1200 },
    ]);
  });

  it('sums multiple transactions in the same month', () => {
    const result = monthlyCashFlow(
      [
        tx({ date: D('2026-04-01'), type: 'INCOME', amount: 1000 }),
        tx({ date: D('2026-04-15'), type: 'INCOME', amount: 500 }),
        tx({ date: D('2026-04-20'), type: 'EXPENSE', amount: 800 }),
        tx({ date: D('2026-04-28'), type: 'EXPENSE', amount: 200 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result).toEqual([{ month: '2026-04', income: 1500, expense: 1000, net: 500 }]);
  });

  it('excludes TRANSFER rows from the totals', () => {
    const result = monthlyCashFlow(
      [
        tx({ date: D('2026-04-01'), type: 'INCOME', amount: 1000 }),
        tx({ date: D('2026-04-10'), type: 'TRANSFER', amount: 9999 }),
        tx({ date: D('2026-04-20'), type: 'EXPENSE', amount: 300 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result[0]).toEqual({ month: '2026-04', income: 1000, expense: 300, net: 700 });
  });

  it('respects the range — drops out-of-range transactions', () => {
    const result = monthlyCashFlow(
      [
        tx({ date: D('2026-03-31'), type: 'EXPENSE', amount: 999 }),
        tx({ date: D('2026-04-15'), type: 'EXPENSE', amount: 100 }),
        tx({ date: D('2026-05-01'), type: 'EXPENSE', amount: 999 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result).toEqual([{ month: '2026-04', income: 0, expense: 100, net: -100 }]);
  });

  it('handles range endpoints inclusively (from == tx.date, to == tx.date)', () => {
    const result = monthlyCashFlow(
      [
        tx({ date: D('2026-04-01'), type: 'INCOME', amount: 100 }),
        tx({ date: D('2026-04-30'), type: 'EXPENSE', amount: 50 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result[0]?.income).toBe(100);
    expect(result[0]?.expense).toBe(50);
  });

  it('crosses year boundaries correctly', () => {
    const result = monthlyCashFlow(
      [
        tx({ date: D('2025-11-15'), type: 'INCOME', amount: 1000 }),
        tx({ date: D('2025-12-15'), type: 'EXPENSE', amount: 200 }),
        tx({ date: D('2026-01-15'), type: 'EXPENSE', amount: 300 }),
        tx({ date: D('2026-02-15'), type: 'INCOME', amount: 1000 }),
      ],
      { from: D('2025-11-01'), to: D('2026-02-28') },
    );
    expect(result.map((r) => r.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(result[0]?.net).toBe(1000);
    expect(result[3]?.net).toBe(1000);
  });

  it('accepts amounts as number, string, or Prisma.Decimal-like (any toNumber)', () => {
    const result = monthlyCashFlow(
      [
        tx({ date: D('2026-04-01'), type: 'INCOME', amount: 100 }),
        tx({ date: D('2026-04-02'), type: 'INCOME', amount: '50.25' }),
        tx({
          date: D('2026-04-03'),
          type: 'INCOME',
          amount: { toNumber: () => 25.75 } as unknown as AggregationInput['amount'],
        }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result[0]?.income).toBeCloseTo(176, 2);
  });
});

describe('spendingByCategory', () => {
  it('returns an empty array when there are no expenses in range', () => {
    expect(spendingByCategory([], { from: D('2026-01-01'), to: D('2026-12-31') })).toEqual([]);
  });

  it('groups by category and sorts by total descending', () => {
    const result = spendingByCategory(
      [
        tx({ category: 'Alimentación', amount: 100 }),
        tx({ category: 'Transporte', amount: 300 }),
        tx({ category: 'Alimentación', amount: 200 }),
        tx({ category: 'Salud', amount: 50 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result.map((r) => r.category)).toEqual(['Alimentación', 'Transporte', 'Salud']);
    expect(result[0]).toEqual({
      category: 'Alimentación',
      total: 300,
      percent: (300 / 650) * 100,
      count: 2,
    });
  });

  it('collapses null/empty/whitespace categories into "Sin categoría"', () => {
    const result = spendingByCategory(
      [
        tx({ category: null, amount: 100 }),
        tx({ category: '', amount: 200 }),
        tx({ category: '   ', amount: 50 }),
        tx({ category: 'Salud', amount: 25 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    const uncategorized = result.find((r) => r.category === UNCATEGORIZED_LABEL);
    expect(uncategorized?.total).toBe(350);
    expect(uncategorized?.count).toBe(3);
  });

  it('excludes INCOME and TRANSFER rows', () => {
    const result = spendingByCategory(
      [
        tx({ type: 'INCOME', amount: 5000, category: 'Trabajo' }),
        tx({ type: 'TRANSFER', amount: 1000, category: 'Trabajo' }),
        tx({ type: 'EXPENSE', amount: 100, category: 'Alimentación' }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.category).toBe('Alimentación');
  });

  it('computes percent that sums to ~100 within rounding', () => {
    const result = spendingByCategory(
      [
        tx({ category: 'A', amount: 100 }),
        tx({ category: 'B', amount: 200 }),
        tx({ category: 'C', amount: 300 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    const sumPct = result.reduce((s, r) => s + r.percent, 0);
    expect(sumPct).toBeCloseTo(100, 5);
  });

  it('handles zero-total expense set without emitting NaN percents', () => {
    const result = spendingByCategory(
      [tx({ category: 'A', amount: 0 }), tx({ category: 'B', amount: 0 })],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    for (const r of result) expect(r.percent).toBe(0);
  });
});

describe('topMerchants', () => {
  it('returns an empty array when transactions is empty', () => {
    expect(topMerchants([], { from: D('2026-01-01'), to: D('2026-12-31'), limit: 5 })).toEqual([]);
  });

  it('groups by merchantName when present and sorts by total desc', () => {
    const result = topMerchants(
      [
        tx({ merchantName: 'Walmart', amount: 100 }),
        tx({ merchantName: 'Paiz', amount: 300 }),
        tx({ merchantName: 'Walmart', amount: 200 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30'), limit: 10 },
    );
    expect(result).toEqual([
      { merchantName: 'Walmart', merchantNit: '2345678-9', total: 300, count: 2 },
      { merchantName: 'Paiz', merchantNit: '2345678-9', total: 300, count: 1 },
    ]);
  });

  it('falls back to NIT as grouping key when merchantName is null', () => {
    const result = topMerchants(
      [
        tx({ merchantName: null, merchantNit: '1111111-1', amount: 50 }),
        tx({ merchantName: null, merchantNit: '1111111-1', amount: 75 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30'), limit: 5 },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.total).toBe(125);
    expect(result[0]?.count).toBe(2);
    expect(result[0]?.merchantName).toBeNull();
    expect(result[0]?.merchantNit).toBe('1111111-1');
  });

  it('uses the "Comercio desconocido" sentinel when both name and NIT are missing', () => {
    const result = topMerchants(
      [
        tx({ merchantName: null, merchantNit: null, amount: 10 }),
        tx({ merchantName: '', merchantNit: '   ', amount: 5 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30'), limit: 5 },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.merchantName).toBeNull();
    expect(result[0]?.merchantNit).toBeNull();
    expect(result[0]?.total).toBe(15);
  });

  it('backfills missing identifiers across sightings of the same merchant', () => {
    /*
     * First sighting has name but no NIT; second has NIT but the
     * same name. The bucket should end up with BOTH identifiers
     * filled so the UI can display the NIT badge.
     */
    const result = topMerchants(
      [
        tx({ merchantName: 'EEGSA', merchantNit: null, amount: 200 }),
        tx({ merchantName: 'EEGSA', merchantNit: '3456789-1', amount: 150 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30'), limit: 5 },
    );
    expect(result[0]?.merchantName).toBe('EEGSA');
    expect(result[0]?.merchantNit).toBe('3456789-1');
    expect(result[0]?.total).toBe(350);
  });

  it('clamps to `limit` after sorting', () => {
    const result = topMerchants(
      [
        tx({ merchantName: 'A', amount: 100 }),
        tx({ merchantName: 'B', amount: 200 }),
        tx({ merchantName: 'C', amount: 50 }),
        tx({ merchantName: 'D', amount: 300 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30'), limit: 2 },
    );
    expect(result.map((r) => r.merchantName)).toEqual(['D', 'B']);
  });

  it('returns an empty array when limit is 0 or negative', () => {
    const data = [tx({ merchantName: 'A', amount: 100 })];
    expect(topMerchants(data, { from: D('2026-04-01'), to: D('2026-04-30'), limit: 0 })).toEqual(
      [],
    );
    expect(topMerchants(data, { from: D('2026-04-01'), to: D('2026-04-30'), limit: -5 })).toEqual(
      [],
    );
  });

  it('excludes INCOME and TRANSFER rows', () => {
    const result = topMerchants(
      [
        tx({ type: 'INCOME', merchantName: 'Empresa', amount: 5000 }),
        tx({ type: 'TRANSFER', merchantName: 'Empresa', amount: 1000 }),
        tx({ type: 'EXPENSE', merchantName: 'Walmart', amount: 100 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30'), limit: 5 },
    );
    expect(result).toEqual([
      { merchantName: 'Walmart', merchantNit: '2345678-9', total: 100, count: 1 },
    ]);
  });

  it('respects the date range', () => {
    const result = topMerchants(
      [
        tx({ date: D('2026-03-31'), merchantName: 'Walmart', amount: 999 }),
        tx({ date: D('2026-04-15'), merchantName: 'Walmart', amount: 100 }),
        tx({ date: D('2026-05-01'), merchantName: 'Walmart', amount: 999 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30'), limit: 5 },
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.total).toBe(100);
  });
});

describe('single-transaction edge cases', () => {
  it('monthlyCashFlow handles a single transaction', () => {
    const result = monthlyCashFlow([tx({ date: D('2026-04-15'), type: 'EXPENSE', amount: 100 })], {
      from: D('2026-04-01'),
      to: D('2026-04-30'),
    });
    expect(result).toEqual([{ month: '2026-04', income: 0, expense: 100, net: -100 }]);
  });

  it('spendingByCategory handles a single transaction', () => {
    const result = spendingByCategory([tx({ category: 'Salud', amount: 100 })], {
      from: D('2026-04-01'),
      to: D('2026-04-30'),
    });
    expect(result).toEqual([{ category: 'Salud', total: 100, percent: 100, count: 1 }]);
  });

  it('topMerchants handles a single transaction', () => {
    const result = topMerchants([tx({ merchantName: 'Walmart', amount: 100 })], {
      from: D('2026-04-01'),
      to: D('2026-04-30'),
      limit: 5,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.merchantName).toBe('Walmart');
  });
});

describe('all-null edge cases', () => {
  it('spendingByCategory groups all-null categories into a single bucket', () => {
    const result = spendingByCategory(
      [tx({ category: null, amount: 100 }), tx({ category: null, amount: 200 })],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result).toEqual([{ category: UNCATEGORIZED_LABEL, total: 300, percent: 100, count: 2 }]);
  });

  it('topMerchants groups all-null merchants into "Comercio desconocido"', () => {
    const result = topMerchants(
      [
        tx({ merchantName: null, merchantNit: null, amount: 50 }),
        tx({ merchantName: null, merchantNit: null, amount: 25 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30'), limit: 5 },
    );
    /*
     * The UNKNOWN_MERCHANT_LABEL is the GROUPING key, not a display
     * value. The bucket keeps name=null, nit=null so the UI can
     * decide whether to render the sentinel or render an em-dash.
     */
    expect(result).toHaveLength(1);
    expect(result[0]?.merchantName).toBeNull();
    expect(result[0]?.merchantNit).toBeNull();
    expect(result[0]?.total).toBe(75);
    // Sanity: the constant is exported and stable.
    expect(UNKNOWN_MERCHANT_LABEL).toBe('Comercio desconocido');
  });
});

describe('negative amount edge cases', () => {
  /*
   * Defensive: the import path defines amount as the positive
   * magnitude with `type` carrying the sign convention. A
   * negative amount on an EXPENSE row would imply a refund / a
   * stored-procedure quirk. Aggregations sum verbatim so the
   * caller's invariant is preserved.
   */
  it('sums negative expense amounts verbatim (no abs)', () => {
    const result = monthlyCashFlow(
      [
        tx({ date: D('2026-04-01'), type: 'EXPENSE', amount: 100 }),
        tx({ date: D('2026-04-15'), type: 'EXPENSE', amount: -30 }),
      ],
      { from: D('2026-04-01'), to: D('2026-04-30') },
    );
    expect(result[0]?.expense).toBe(70);
    expect(result[0]?.net).toBe(-70);
  });
});
