import { describe, expect, it } from 'vitest';
import { buildTransactionListWhere, clampLimit } from './transaction';

describe('clampLimit', () => {
  it('uses the default (50) when no value is provided', () => {
    expect(clampLimit(undefined)).toBe(50);
  });

  it('returns the provided value when within [1, 200]', () => {
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit(100)).toBe(100);
  });

  it('clamps to 1 at the lower bound', () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-5)).toBe(1);
  });

  it('clamps to 200 at the upper bound', () => {
    expect(clampLimit(500)).toBe(200);
  });

  it('floors non-integer inputs', () => {
    expect(clampLimit(50.9)).toBe(50);
  });

  it('falls back to default for non-finite inputs', () => {
    expect(clampLimit(Number.NaN)).toBe(50);
    expect(clampLimit(Number.POSITIVE_INFINITY)).toBe(50);
  });
});

describe('buildTransactionListWhere', () => {
  it('returns an empty object when no filters and no cursor', () => {
    expect(buildTransactionListWhere({}, null)).toEqual({});
  });

  it('maps a source filter verbatim', () => {
    expect(buildTransactionListWhere({ source: 'BANK_CSV' }, null)).toEqual({
      source: 'BANK_CSV',
    });
  });

  it('maps a reconciliationStatus filter', () => {
    expect(buildTransactionListWhere({ reconciliationStatus: 'MATCHED' }, null)).toEqual({
      reconciliationStatus: 'MATCHED',
    });
  });

  it('composes dateFrom + dateTo into a range', () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-03-31');
    expect(buildTransactionListWhere({ dateFrom: from, dateTo: to }, null)).toEqual({
      date: { gte: from, lte: to },
    });
  });

  it('omits the half of a date range that is missing', () => {
    const from = new Date('2026-01-01');
    expect(buildTransactionListWhere({ dateFrom: from }, null)).toEqual({
      date: { gte: from },
    });
  });

  it('composes amountMin + amountMax into a range', () => {
    expect(buildTransactionListWhere({ amountMin: 100, amountMax: 1000 }, null)).toEqual({
      amount: { gte: 100, lte: 1000 },
    });
  });

  it('maps merchantNit + q (case-insensitive contains)', () => {
    expect(buildTransactionListWhere({ merchantNit: '12345678', q: 'gasolina' }, null)).toEqual({
      merchantNit: '12345678',
      description: { contains: 'gasolina', mode: 'insensitive' },
    });
  });

  it('wraps base filters + cursor in a top-level AND with the keyset OR', () => {
    const cursor = { id: 'row-42', date: new Date('2026-02-15') };
    const result = buildTransactionListWhere({ source: 'BANK_CSV' }, cursor);
    expect(result).toEqual({
      AND: [
        { source: 'BANK_CSV' },
        {
          OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
        },
      ],
    });
  });

  it('cursor-only (no filters) still wraps in AND so the shape stays predictable', () => {
    const cursor = { id: 'row-7', date: new Date('2026-04-10') };
    const result = buildTransactionListWhere({}, cursor);
    expect(result).toEqual({
      AND: [
        {},
        {
          OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }],
        },
      ],
    });
  });
});
