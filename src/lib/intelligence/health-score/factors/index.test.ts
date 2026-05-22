import { describe, expect, it } from 'vitest';
import { FACTORS, FACTOR_WEIGHTS } from './index';

describe('FACTOR_WEIGHTS', () => {
  it('sums to exactly 100 so the engine output max is 1000', () => {
    const sum = Object.values(FACTOR_WEIGHTS).reduce((s, v) => s + v, 0);
    expect(sum).toBe(100);
  });

  it('has exactly six factor keys matching the §2 table', () => {
    expect(Object.keys(FACTOR_WEIGHTS).sort()).toEqual(
      [
        'anomalyRate',
        'cashFlowConsistency',
        'incomeStability',
        'recurringSpending',
        'savingsRate',
        'spendingDiscipline',
      ].sort(),
    );
  });

  it('FACTORS registry has exactly the same keys as FACTOR_WEIGHTS', () => {
    expect(Object.keys(FACTORS).sort()).toEqual(Object.keys(FACTOR_WEIGHTS).sort());
  });
});

describe('FACTORS registry', () => {
  it('each factor is callable with an empty input and returns a well-formed FactorResult', () => {
    const NOW = new Date('2026-05-21T00:00:00Z');
    for (const [key, fn] of Object.entries(FACTORS)) {
      const result = fn({ transactions: [], now: NOW });
      expect(typeof result.score, key).toBe('number');
      expect(Number.isFinite(result.score), key).toBe(true);
      expect(result.score, key).toBeGreaterThanOrEqual(0);
      expect(result.score, key).toBeLessThanOrEqual(100);
      expect(typeof result.partial, key).toBe('boolean');
      expect(typeof result.inputs, key).toBe('object');
    }
  });
});
