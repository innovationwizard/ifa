import { describe, expect, it } from 'vitest';
import { SCORE_MAX, SCORE_MIN, TIER_BANDS, scoreTier, tierColor } from './tier';

describe('scoreTier — boundary values', () => {
  /*
   * The plan pins these six values explicitly: 399 → crítico,
   * 400 → enRiesgo, 599 → enRiesgo, 600 → estable, 799 → estable,
   * 800 → excelente. Each tier's bounds (low + high) tested so a
   * future weight tweak can't silently shift a band edge.
   */
  it.each([
    [0, 'critico'],
    [399, 'critico'],
    [400, 'enRiesgo'],
    [599, 'enRiesgo'],
    [600, 'estable'],
    [799, 'estable'],
    [800, 'excelente'],
    [1000, 'excelente'],
  ])('score=%d → %s', (score, expected) => {
    expect(scoreTier(score)).toBe(expected);
  });
});

describe('scoreTier — defensive clamp', () => {
  it('clamps negative scores to the lowest tier', () => {
    expect(scoreTier(-50)).toBe('critico');
  });
  it('clamps scores above SCORE_MAX to the top tier', () => {
    expect(scoreTier(9999)).toBe('excelente');
  });
  it('treats non-finite scores as critico (defensive default)', () => {
    /*
     * Non-finite values (NaN, ±Infinity) are treated as garbage and
     * land in `critico` — the safest visual default. Distinct from
     * "out of range but finite" which clamps to the nearest valid
     * tier per the test above.
     */
    expect(scoreTier(Number.NaN)).toBe('critico');
    expect(scoreTier(Number.POSITIVE_INFINITY)).toBe('critico');
    expect(scoreTier(Number.NEGATIVE_INFINITY)).toBe('critico');
  });
});

describe('tierColor', () => {
  it.each([
    ['critico', '#dc2626'],
    ['enRiesgo', '#e5930b'],
    ['estable', '#0fa698'],
    ['excelente', '#0d847a'],
  ] as const)('%s → %s', (tier, hex) => {
    expect(tierColor(tier)).toBe(hex);
  });
});

describe('TIER_BANDS', () => {
  it('covers the full [SCORE_MIN, SCORE_MAX] range with no gaps', () => {
    let cursor = SCORE_MIN;
    for (const band of TIER_BANDS) {
      expect(band.from).toBe(cursor);
      cursor = band.to + 1;
    }
    expect(cursor).toBe(SCORE_MAX + 1);
  });
});
