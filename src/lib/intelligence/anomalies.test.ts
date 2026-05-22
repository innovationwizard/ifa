import { describe, expect, it } from 'vitest';
import {
  MAX_HISTORY_FOR_NEW_MERCHANT,
  MIN_HISTORY_FOR_ZSCORE,
  ZSCORE_THRESHOLD,
  detectAnomaly,
} from './anomalies';

describe('detectAnomaly — new_merchant method', () => {
  it('flags an empty history as new_merchant', () => {
    const result = detectAnomaly({ amount: 100, merchantHistory: [] });
    expect(result).toEqual({ method: 'new_merchant', zScore: 0 });
  });

  it('flags a single-prior-sighting history as new_merchant', () => {
    const result = detectAnomaly({ amount: 100, merchantHistory: [85] });
    expect(result).toEqual({ method: 'new_merchant', zScore: 0 });
  });

  it('exposes the MAX_HISTORY_FOR_NEW_MERCHANT constant correctly', () => {
    expect(MAX_HISTORY_FOR_NEW_MERCHANT).toBe(1);
  });
});

describe('detectAnomaly — in-between history (2..9)', () => {
  it.each([2, 3, 5, 9])(
    'returns null for %d prior sightings (not enough for z-score, not new)',
    (count) => {
      const history = Array.from({ length: count }, (_, i) => 100 + i);
      const result = detectAnomaly({ amount: 99999, merchantHistory: history });
      expect(result).toBeNull();
    },
  );

  it('exposes the MIN_HISTORY_FOR_ZSCORE constant correctly', () => {
    expect(MIN_HISTORY_FOR_ZSCORE).toBe(10);
  });
});

describe('detectAnomaly — merchant_zscore method', () => {
  /*
   * Tight cluster around 100 with stdDev exactly 1 — chosen so the
   * z-score math is trivially auditable in the assertions below.
   * 10 values: five at 99, five at 101 → mean = 100, popVar = 1,
   * popStdDev = 1.
   */
  const TIGHT_HISTORY = [99, 99, 99, 99, 99, 101, 101, 101, 101, 101];

  it('does NOT flag amounts inside ±3σ', () => {
    const result = detectAnomaly({ amount: 102, merchantHistory: TIGHT_HISTORY });
    expect(result).toBeNull();
  });

  it('does NOT flag exactly-3σ (strict inequality)', () => {
    const result = detectAnomaly({ amount: 103, merchantHistory: TIGHT_HISTORY });
    expect(result).toBeNull();
  });

  it('flags amounts above +3σ with a positive signed zScore', () => {
    const result = detectAnomaly({ amount: 200, merchantHistory: TIGHT_HISTORY });
    expect(result?.method).toBe('merchant_zscore');
    expect(result?.zScore).toBeCloseTo(100, 5);
  });

  it('flags amounts below −3σ with a negative signed zScore', () => {
    const result = detectAnomaly({ amount: 0, merchantHistory: TIGHT_HISTORY });
    expect(result?.method).toBe('merchant_zscore');
    expect(result?.zScore).toBeCloseTo(-100, 5);
  });

  it('flags a value just past +3σ on a clean fixture (stdDev = 1)', () => {
    /*
     * Reuses TIGHT_HISTORY (mean=100, popStd=1 exactly) so the
     * threshold is a clean integer multiple. The "exactly 3σ"
     * test above covers the not-flagged case; this one pins the
     * just-past-3σ case using the same fixture for parity.
     */
    const result = detectAnomaly({ amount: 103.01, merchantHistory: TIGHT_HISTORY });
    expect(result?.method).toBe('merchant_zscore');
    expect(result?.zScore).toBeCloseTo(3.01, 5);
  });

  it('exposes the ZSCORE_THRESHOLD constant correctly', () => {
    expect(ZSCORE_THRESHOLD).toBe(3);
  });
});

describe('detectAnomaly — degenerate cases', () => {
  it('returns null when stdDev is 0 (flat history) to avoid divide-by-zero', () => {
    const flat = Array.from({ length: 12 }, () => 50);
    expect(detectAnomaly({ amount: 51, merchantHistory: flat })).toBeNull();
    expect(detectAnomaly({ amount: 9999, merchantHistory: flat })).toBeNull();
  });

  it('is symmetric in history order (sort-independent)', () => {
    const ascending = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const descending = [...ascending].reverse();
    const a = detectAnomaly({ amount: 200, merchantHistory: ascending });
    const b = detectAnomaly({ amount: 200, merchantHistory: descending });
    expect(a).toEqual(b);
  });

  it('handles negative amounts in history (e.g., refunds) without crashing', () => {
    const withRefund = [50, 50, 50, 50, 50, -10, 50, 50, 50, 50];
    const result = detectAnomaly({ amount: 60, merchantHistory: withRefund });
    // No specific magnitude assertion — just verifying it returns either
    // null or a well-formed AnomalyResult (no NaN / no throw).
    if (result !== null) {
      expect(Number.isFinite(result.zScore)).toBe(true);
      expect(result.method).toBe('merchant_zscore');
    }
  });
});
