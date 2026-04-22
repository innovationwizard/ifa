import { describe, expect, it } from 'vitest';
import { filtersFromSearchParams, filtersToSearchParams, isFilterEmpty } from './filters';

describe('filtersFromSearchParams', () => {
  it('returns empty object for empty params', () => {
    expect(filtersFromSearchParams(new URLSearchParams())).toEqual({});
  });

  it('reads known filter keys', () => {
    const params = new URLSearchParams({
      q: 'gasolina',
      source: 'BANK_CSV',
      reconciliationStatus: 'UNMATCHED',
      dateFrom: '2026-01-01',
      dateTo: '2026-03-31',
      amountMin: '100',
      amountMax: '5000',
    });
    expect(filtersFromSearchParams(params)).toEqual({
      q: 'gasolina',
      source: 'BANK_CSV',
      reconciliationStatus: 'UNMATCHED',
      dateFrom: '2026-01-01',
      dateTo: '2026-03-31',
      amountMin: 100,
      amountMax: 5000,
    });
  });

  it('drops unknown enum values silently', () => {
    const params = new URLSearchParams({ source: 'NOT_A_SOURCE' });
    expect(filtersFromSearchParams(params)).toEqual({});
  });

  it('drops malformed date strings', () => {
    const params = new URLSearchParams({ dateFrom: 'yesterday' });
    expect(filtersFromSearchParams(params)).toEqual({});
  });

  it('drops non-numeric amount values', () => {
    const params = new URLSearchParams({ amountMin: 'abc' });
    expect(filtersFromSearchParams(params)).toEqual({});
  });

  it('drops an empty q', () => {
    const params = new URLSearchParams({ q: '' });
    expect(filtersFromSearchParams(params)).toEqual({});
  });
});

describe('filtersToSearchParams', () => {
  it('emits no params for an empty filter', () => {
    expect(filtersToSearchParams({}).toString()).toBe('');
  });

  it('roundtrips a populated filter', () => {
    const filters = {
      q: 'cafe',
      source: 'MANUAL' as const,
      reconciliationStatus: 'MATCHED' as const,
      dateFrom: '2026-02-01',
      dateTo: '2026-02-28',
      amountMin: 10,
      amountMax: 500,
    };
    const params = filtersToSearchParams(filters);
    expect(filtersFromSearchParams(params)).toEqual(filters);
  });

  it('omits undefined numeric fields (not emitted as "undefined")', () => {
    const params = filtersToSearchParams({ q: 'x' });
    expect(params.has('amountMin')).toBe(false);
    expect(params.has('amountMax')).toBe(false);
  });
});

describe('isFilterEmpty', () => {
  it('true for an empty object', () => {
    expect(isFilterEmpty({})).toBe(true);
  });

  it('false when q is set', () => {
    expect(isFilterEmpty({ q: 'x' })).toBe(false);
  });

  it('false when amountMin is 0 (zero is still a filter)', () => {
    expect(isFilterEmpty({ amountMin: 0 })).toBe(false);
  });
});
