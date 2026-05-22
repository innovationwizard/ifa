import { describe, expect, it } from 'vitest';
import { recurringSpending } from './recurring-spending';
import type { FactorTransaction } from '../types';

const NOW = new Date('2026-05-21T00:00:00Z');
const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function tx(date: string, merchantNit: string | null, amount = 100): FactorTransaction {
  return {
    date: D(date),
    type: 'EXPENSE',
    amount,
    merchantName: merchantNit ? null : 'AnonMerchant',
    merchantNit,
    metadata: {},
  };
}

describe('recurringSpending', () => {
  it('returns partial:true on empty input', () => {
    const r = recurringSpending({ transactions: [], now: NOW });
    expect(r.partial).toBe(true);
    expect(r.score).toBe(0);
    expect(r.inputs.totalExpenses).toBe(0);
  });

  it('scores 100 when every expense is recurring (3+ at same merchant)', () => {
    /*
     * 12 rows at the same merchant — recurring count = 12, total = 12.
     */
    const transactions = Array.from({ length: 12 }, (_, i) =>
      tx(
        `2026-${String(3 + (i % 3)).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        'NIT-1',
      ),
    );
    const r = recurringSpending({ transactions, now: NOW });
    expect(r.score).toBe(100);
    expect(r.partial).toBe(false);
    expect(r.inputs.recurringCount).toBe(12);
    expect(r.inputs.distinctMerchants).toBe(1);
  });

  it('scores 50 when half the rows are recurring', () => {
    const transactions = [
      // 5 rows at NIT-A (recurring)
      tx('2026-03-01', 'NIT-A'),
      tx('2026-03-15', 'NIT-A'),
      tx('2026-04-01', 'NIT-A'),
      tx('2026-04-15', 'NIT-A'),
      tx('2026-05-01', 'NIT-A'),
      // 5 distinct one-off merchants
      tx('2026-03-10', 'NIT-1'),
      tx('2026-03-20', 'NIT-2'),
      tx('2026-04-10', 'NIT-3'),
      tx('2026-04-20', 'NIT-4'),
      tx('2026-05-10', 'NIT-5'),
    ];
    const r = recurringSpending({ transactions, now: NOW });
    expect(r.score).toBe(50);
    expect(r.inputs.recurringCount).toBe(5);
    expect(r.inputs.totalExpenses).toBe(10);
    expect(r.inputs.distinctMerchants).toBe(6);
  });

  it('scores 0 when no merchant repeats 3 times', () => {
    const transactions = Array.from({ length: 12 }, (_, i) =>
      tx(`2026-04-${String(i + 1).padStart(2, '0')}`, `NIT-${String(i)}`),
    );
    const r = recurringSpending({ transactions, now: NOW });
    expect(r.score).toBe(0);
    expect(r.inputs.recurringCount).toBe(0);
  });

  it('returns partial:true when fewer than 10 expenses in window', () => {
    const r = recurringSpending({
      transactions: [tx('2026-05-15', 'NIT-A'), tx('2026-05-16', 'NIT-A')],
      now: NOW,
    });
    expect(r.partial).toBe(true);
    expect(r.inputs.totalExpenses).toBe(2);
  });

  it('excludes rows with no merchant identifier', () => {
    const transactions: FactorTransaction[] = [
      ...Array.from({ length: 5 }, (_, i) =>
        tx(`2026-04-${String(i + 1).padStart(2, '0')}`, 'NIT-A'),
      ),
      // 5 rows with neither name nor NIT — should be ignored
      ...Array.from({ length: 5 }, (_, i) => ({
        date: D(`2026-04-${String(i + 10).padStart(2, '0')}`),
        type: 'EXPENSE' as const,
        amount: 50,
        merchantName: null,
        merchantNit: null,
        metadata: {},
      })),
    ];
    const r = recurringSpending({ transactions, now: NOW });
    /*
     * totalExpenses still counts ALL EXPENSE rows in the window
     * (including the no-merchant ones, because the filter is by
     * date+type, not by merchant). But the no-merchant rows can't
     * be recurring (they don't form a key). So 5 recurring of 10
     * total = 50.
     */
    expect(r.inputs.totalExpenses).toBe(10);
    expect(r.inputs.recurringCount).toBe(5);
    expect(r.score).toBe(50);
  });
});
