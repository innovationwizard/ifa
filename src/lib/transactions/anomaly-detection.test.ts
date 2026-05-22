import { describe, expect, it } from 'vitest';
import { hasActiveAnomalyFlag, readAnomalyMetadata } from './anomaly-detection';

describe('readAnomalyMetadata', () => {
  it('returns {} for null / undefined / non-object input', () => {
    expect(readAnomalyMetadata(null)).toEqual({});
    expect(readAnomalyMetadata(undefined)).toEqual({});
    expect(readAnomalyMetadata('not-an-object')).toEqual({});
    expect(readAnomalyMetadata(42)).toEqual({});
  });

  it('returns {} when metadata exists but has no anomaly slice', () => {
    expect(readAnomalyMetadata({ duplicateDismissed: true })).toEqual({});
  });

  it('extracts a well-formed merchant_zscore record', () => {
    const meta = {
      anomaly: {
        method: 'merchant_zscore',
        zScore: 4.2,
        detectedAt: '2026-05-21T12:00:00Z',
      },
    };
    expect(readAnomalyMetadata(meta)).toEqual({
      method: 'merchant_zscore',
      zScore: 4.2,
      detectedAt: '2026-05-21T12:00:00Z',
    });
  });

  it('extracts a new_merchant record with the dismissed flag preserved', () => {
    const meta = {
      anomaly: {
        method: 'new_merchant',
        zScore: 0,
        detectedAt: '2026-05-21T12:00:00Z',
        dismissed: true,
      },
    };
    const result = readAnomalyMetadata(meta);
    expect(result.method).toBe('new_merchant');
    expect(result.dismissed).toBe(true);
  });

  it('drops fields with wrong types instead of crashing', () => {
    const meta = {
      anomaly: {
        method: 'bogus_method',
        zScore: 'not-a-number',
        detectedAt: 12345,
        dismissed: 'true',
      },
    };
    expect(readAnomalyMetadata(meta)).toEqual({});
  });

  it('treats NaN / Infinity zScore as missing', () => {
    expect(
      readAnomalyMetadata({ anomaly: { method: 'merchant_zscore', zScore: Number.NaN } }).zScore,
    ).toBeUndefined();
    expect(
      readAnomalyMetadata({
        anomaly: { method: 'merchant_zscore', zScore: Number.POSITIVE_INFINITY },
      }).zScore,
    ).toBeUndefined();
  });
});

describe('hasActiveAnomalyFlag', () => {
  it('true when a method is set and dismissed is absent', () => {
    expect(
      hasActiveAnomalyFlag({
        anomaly: { method: 'merchant_zscore', zScore: 4.2, detectedAt: '2026-05-21T00:00:00Z' },
      }),
    ).toBe(true);
  });

  it('false when no method is recorded', () => {
    expect(hasActiveAnomalyFlag(null)).toBe(false);
    expect(hasActiveAnomalyFlag({})).toBe(false);
    expect(hasActiveAnomalyFlag({ anomaly: {} })).toBe(false);
  });

  it('false when the user has dismissed the flag', () => {
    expect(
      hasActiveAnomalyFlag({
        anomaly: {
          method: 'new_merchant',
          zScore: 0,
          detectedAt: '2026-05-21T00:00:00Z',
          dismissed: true,
        },
      }),
    ).toBe(false);
  });

  it('co-exists with duplicate-detection metadata on the same row', () => {
    /*
     * Both detectors write to disjoint top-level keys. Verifying that
     * the anomaly reader doesn't get confused by a `duplicateDismissed`
     * sibling key.
     */
    const meta = {
      possibleDuplicateOf: 'tx_other_id',
      duplicateDismissed: false,
      anomaly: {
        method: 'merchant_zscore',
        zScore: -4.5,
        detectedAt: '2026-05-21T00:00:00Z',
      },
    };
    expect(hasActiveAnomalyFlag(meta)).toBe(true);
  });
});
