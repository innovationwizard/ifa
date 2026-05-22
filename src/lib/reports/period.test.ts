import { describe, expect, it } from 'vitest';
import { DEFAULT_PERIOD, parsePeriod, periodToSearchParams } from './period';

const NOW = new Date('2026-05-21T12:34:56Z');

function sp(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('parsePeriod', () => {
  it('defaults to 6m when the search params are empty', () => {
    const result = parsePeriod(sp(''), NOW);
    expect(result.key).toBe(DEFAULT_PERIOD);
    expect(result.from.toISOString().slice(0, 10)).toBe('2025-12-01');
    expect(result.to.toISOString().slice(0, 10)).toBe('2026-05-21');
  });

  it('defaults to 6m when the period key is unknown', () => {
    const result = parsePeriod(sp('period=banana'), NOW);
    expect(result.key).toBe(DEFAULT_PERIOD);
  });

  it.each([
    ['1m', '2026-05-01'],
    ['3m', '2026-03-01'],
    ['6m', '2025-12-01'],
    ['12m', '2025-06-01'],
  ])('honors period=%s and computes from = first-of-month minus N months', (key, expectedFrom) => {
    const result = parsePeriod(sp(`period=${key}`), NOW);
    expect(result.key).toBe(key);
    expect(result.from.toISOString().slice(0, 10)).toBe(expectedFrom);
    expect(result.to.toISOString().slice(0, 10)).toBe('2026-05-21');
  });

  it('handles custom period with valid from/to', () => {
    const result = parsePeriod(sp('period=custom&from=2026-01-01&to=2026-02-28'), NOW);
    expect(result.key).toBe('custom');
    expect(result.from.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(result.to.toISOString().slice(0, 10)).toBe('2026-02-28');
  });

  it('falls back to default when custom is missing from/to', () => {
    const result = parsePeriod(sp('period=custom'), NOW);
    expect(result.key).toBe(DEFAULT_PERIOD);
  });

  it('falls back to default when custom from/to are not valid ISO dates', () => {
    expect(parsePeriod(sp('period=custom&from=not-a-date&to=2026-01-01'), NOW).key).toBe(
      DEFAULT_PERIOD,
    );
    expect(parsePeriod(sp('period=custom&from=2026-01-01&to=01-01-2026'), NOW).key).toBe(
      DEFAULT_PERIOD,
    );
  });

  it('falls back to default when custom from > to (invalid range)', () => {
    const result = parsePeriod(sp('period=custom&from=2026-05-01&to=2026-04-01'), NOW);
    expect(result.key).toBe(DEFAULT_PERIOD);
  });

  it('crosses year boundaries correctly for 12m at the start of a year', () => {
    const result = parsePeriod(sp('period=12m'), new Date('2026-02-15T00:00:00Z'));
    expect(result.from.toISOString().slice(0, 10)).toBe('2025-03-01');
  });

  it('today edge: to is today at midnight UTC regardless of wall-clock hour', () => {
    const result = parsePeriod(sp('period=1m'), new Date('2026-05-21T23:59:00Z'));
    expect(result.to.toISOString().slice(0, 10)).toBe('2026-05-21');
  });
});

describe('periodToSearchParams', () => {
  it('emits only `period` for non-custom keys', () => {
    expect(
      periodToSearchParams({
        key: '6m',
        from: new Date('2025-12-01T00:00:00Z'),
        to: new Date('2026-05-21T00:00:00Z'),
      }),
    ).toBe('period=6m');
  });

  it('emits period + from + to for custom', () => {
    expect(
      periodToSearchParams({
        key: 'custom',
        from: new Date('2026-01-01T00:00:00Z'),
        to: new Date('2026-02-28T00:00:00Z'),
      }),
    ).toBe('period=custom&from=2026-01-01&to=2026-02-28');
  });

  it('round-trips through parsePeriod', () => {
    const original = parsePeriod(sp('period=3m'), NOW);
    const reparsed = parsePeriod(sp(periodToSearchParams(original)), NOW);
    expect(reparsed).toEqual(original);
  });
});
