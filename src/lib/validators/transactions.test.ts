import { describe, expect, it } from 'vitest';
import { listTransactionsQuerySchema } from './transactions';

describe('listTransactionsQuerySchema', () => {
  describe('happy paths', () => {
    it('accepts an empty query (all filters optional)', () => {
      const result = listTransactionsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('coerces limit from string to int', () => {
      const result = listTransactionsQuerySchema.safeParse({ limit: '25' });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.limit).toBe(25);
    });

    it('coerces dateFrom / dateTo from YYYY-MM-DD strings to Date', () => {
      const result = listTransactionsQuerySchema.safeParse({
        dateFrom: '2026-01-01',
        dateTo: '2026-03-31',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.dateFrom).toBeInstanceOf(Date);
        expect(result.data.dateTo).toBeInstanceOf(Date);
      }
    });

    it('accepts a complete cursor pair', () => {
      const result = listTransactionsQuerySchema.safeParse({
        cursorId: '01900000-0000-7000-8000-000000000000',
        cursorDate: '2026-02-15',
      });
      expect(result.success).toBe(true);
    });

    it('accepts valid enum values', () => {
      for (const source of ['FEL', 'TPV', 'BANK_CSV', 'MANUAL']) {
        expect(listTransactionsQuerySchema.safeParse({ source }).success).toBe(true);
      }
    });
  });

  describe('limit bounds', () => {
    it('rejects limit below 1', () => {
      expect(listTransactionsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    });

    it('rejects limit above 500 (request-side cap)', () => {
      expect(listTransactionsQuerySchema.safeParse({ limit: '501' }).success).toBe(false);
    });

    it('rejects non-integer limit', () => {
      expect(listTransactionsQuerySchema.safeParse({ limit: '25.5' }).success).toBe(false);
    });
  });

  describe('cursor pairing', () => {
    it('rejects cursorId without cursorDate', () => {
      const result = listTransactionsQuerySchema.safeParse({
        cursorId: '01900000-0000-7000-8000-000000000000',
      });
      expect(result.success).toBe(false);
    });

    it('rejects cursorDate without cursorId', () => {
      const result = listTransactionsQuerySchema.safeParse({ cursorDate: '2026-02-15' });
      expect(result.success).toBe(false);
    });

    it('rejects a malformed cursor id (not a UUID)', () => {
      const result = listTransactionsQuerySchema.safeParse({
        cursorId: 'not-a-uuid',
        cursorDate: '2026-02-15',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('range ordering', () => {
    it('rejects dateFrom after dateTo', () => {
      const result = listTransactionsQuerySchema.safeParse({
        dateFrom: '2026-06-01',
        dateTo: '2026-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('rejects amountMin greater than amountMax', () => {
      const result = listTransactionsQuerySchema.safeParse({
        amountMin: '500',
        amountMax: '100',
      });
      expect(result.success).toBe(false);
    });

    it('accepts equal dateFrom/dateTo (single-day range)', () => {
      const result = listTransactionsQuerySchema.safeParse({
        dateFrom: '2026-03-15',
        dateTo: '2026-03-15',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('string caps', () => {
    it('rejects merchantNit longer than 50 chars', () => {
      expect(listTransactionsQuerySchema.safeParse({ merchantNit: '1'.repeat(51) }).success).toBe(
        false,
      );
    });

    it('rejects q longer than 100 chars', () => {
      expect(listTransactionsQuerySchema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false);
    });

    it('trims whitespace around merchantNit + q', () => {
      const result = listTransactionsQuerySchema.safeParse({
        merchantNit: '  12345678  ',
        q: '  gasolina  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.merchantNit).toBe('12345678');
        expect(result.data.q).toBe('gasolina');
      }
    });
  });

  describe('unknown values', () => {
    it('rejects a bogus source enum', () => {
      expect(listTransactionsQuerySchema.safeParse({ source: 'NOT_A_SOURCE' }).success).toBe(false);
    });
  });
});
