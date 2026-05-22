import { describe, expect, it } from 'vitest';
import { anomalyRate } from './anomaly-rate';
import type { FactorTransaction } from '../types';

const NOW = new Date('2026-05-21T00:00:00Z');
const D = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

function expense(
  date: string,
  opts: { anomaly?: boolean; dismissed?: boolean } = {},
): FactorTransaction {
  const metadata: Record<string, unknown> = {};
  if (opts.anomaly) {
    metadata.anomaly = {
      method: 'merchant_zscore',
      zScore: 4.2,
      detectedAt: '2026-05-01T00:00:00Z',
      ...(opts.dismissed ? { dismissed: true } : {}),
    };
  }
  return {
    date: D(date),
    type: 'EXPENSE',
    amount: 100,
    merchantName: 'X',
    merchantNit: null,
    metadata,
  };
}

describe('anomalyRate', () => {
  it('returns partial:true on empty input', () => {
    const r = anomalyRate({ transactions: [], now: NOW });
    expect(r.partial).toBe(true);
    expect(r.score).toBe(100);
    expect(r.inputs.anomalyCount).toBe(0);
  });

  it('scores 100 when no expense carries an anomaly flag', () => {
    const transactions = Array.from({ length: 12 }, (_, i) =>
      expense(`2026-04-${String(i + 1).padStart(2, '0')}`),
    );
    const r = anomalyRate({ transactions, now: NOW });
    expect(r.score).toBe(100);
    expect(r.partial).toBe(false);
    expect(r.inputs.anomalyCount).toBe(0);
  });

  it('drops to 0 when ≥10% of expenses are flagged', () => {
    /*
     * 10 rows, 1 with anomaly = 10% rate → score = 100 − min(100, 10×10)
     * = 100 − 100 = 0. Hits the floor.
     */
    const transactions: FactorTransaction[] = [
      expense('2026-04-01', { anomaly: true }),
      ...Array.from({ length: 9 }, (_, i) => expense(`2026-04-${String(i + 2).padStart(2, '0')}`)),
    ];
    const r = anomalyRate({ transactions, now: NOW });
    expect(r.score).toBe(0);
    expect(r.inputs.anomalyCount).toBe(1);
    expect(r.inputs.totalExpenses).toBe(10);
  });

  it('scores 50 at 5% anomaly rate (the mid-point)', () => {
    /*
     * 20 rows, 1 with anomaly = 5% rate → score = 100 − min(100, 5×10)
     * = 100 − 50 = 50.
     */
    const transactions: FactorTransaction[] = [
      expense('2026-04-01', { anomaly: true }),
      ...Array.from({ length: 19 }, (_, i) =>
        expense(`2026-04-${String((i % 28) + 2).padStart(2, '0')}`),
      ),
    ];
    const r = anomalyRate({ transactions, now: NOW });
    expect(r.score).toBe(50);
  });

  it('ignores user-dismissed anomalies', () => {
    const transactions: FactorTransaction[] = [
      expense('2026-04-01', { anomaly: true, dismissed: true }),
      expense('2026-04-02', { anomaly: true, dismissed: true }),
      ...Array.from({ length: 10 }, (_, i) => expense(`2026-04-${String(i + 3).padStart(2, '0')}`)),
    ];
    const r = anomalyRate({ transactions, now: NOW });
    expect(r.score).toBe(100);
    expect(r.inputs.anomalyCount).toBe(0);
  });

  it('returns partial:true when fewer than 10 expenses in window', () => {
    const transactions = Array.from({ length: 4 }, (_, i) =>
      expense(`2026-05-${String(i + 1).padStart(2, '0')}`, { anomaly: i === 0 }),
    );
    const r = anomalyRate({ transactions, now: NOW });
    expect(r.partial).toBe(true);
    expect(r.inputs.totalExpenses).toBe(4);
  });
});
