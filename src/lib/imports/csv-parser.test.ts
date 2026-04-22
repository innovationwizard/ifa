import { describe, expect, it } from 'vitest';
import { mapRows, parseDateFlexible, parseNumber } from './csv-parser';

describe('parseDateFlexible', () => {
  it('parses yyyy-mm-dd', () => {
    const d = parseDateFlexible('2026-04-21');
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString().slice(0, 10)).toBe('2026-04-21');
  });

  it('parses dd/mm/yyyy (Guatemala convention)', () => {
    const d = parseDateFlexible('21/04/2026');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-04-21');
  });

  it('parses dd-mm-yyyy', () => {
    const d = parseDateFlexible('21-04-2026');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-04-21');
  });

  it('parses dd/mm/yy by expanding to 20yy', () => {
    const d = parseDateFlexible('21/04/26');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-04-21');
  });

  it('rejects impossible dates (Feb 31)', () => {
    expect(parseDateFlexible('31/02/2026')).toBeUndefined();
  });

  it('returns undefined for empty or garbage', () => {
    expect(parseDateFlexible('')).toBeUndefined();
    expect(parseDateFlexible('no-es-fecha')).toBeUndefined();
  });
});

describe('parseNumber', () => {
  it('parses plain numbers', () => {
    expect(parseNumber('123')).toBe(123);
    expect(parseNumber('123.45')).toBe(123.45);
    expect(parseNumber('-123.45')).toBe(-123.45);
  });

  it('parses US/GT thousands (1,234.56)', () => {
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('1,000,000.00')).toBe(1000000);
  });

  it('parses EU thousands (1.234,56)', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('1.000.000,00')).toBe(1000000);
  });

  it('treats a lone comma with 3 trailing digits as thousands', () => {
    expect(parseNumber('1,000')).toBe(1000);
  });

  it('treats a lone comma with non-3 trailing digits as decimal', () => {
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber('1,50')).toBe(1.5);
  });

  it('parses accounting-notation parens as negative', () => {
    expect(parseNumber('(1,234.56)')).toBe(-1234.56);
  });

  it('strips currency prefixes', () => {
    expect(parseNumber('Q 1,234.56')).toBe(1234.56);
    expect(parseNumber('$100.00')).toBe(100);
    expect(parseNumber('USD 500')).toBe(500);
  });

  it('returns undefined for empty or garbage', () => {
    expect(parseNumber('')).toBeUndefined();
    expect(parseNumber('abc')).toBeUndefined();
  });
});

describe('mapRows', () => {
  it('maps a BAC-style row with separate debit/credit columns', () => {
    const result = mapRows(
      [{ Fecha: '21/04/2026', Concepto: 'GASOLINERA SHELL', Débito: '150.00', Crédito: '' }],
      { Fecha: 'date', Concepto: 'description', Débito: 'debit', Crédito: 'credit' },
    );
    expect(result.errors).toEqual([]);
    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0]!;
    expect(tx.amount).toBe(-150);
    expect(tx.type).toBe('EXPENSE');
    expect(tx.description).toBe('GASOLINERA SHELL');
    expect(tx.date.toISOString().slice(0, 10)).toBe('2026-04-21');
    expect(tx.externalId.startsWith('csv:')).toBe(true);
  });

  it('maps a credit row as INCOME', () => {
    const result = mapRows(
      [{ fecha: '2026-04-21', concepto: 'DEPOSITO NOMINA', debito: '', credito: '5000.00' }],
      { fecha: 'date', concepto: 'description', debito: 'debit', credito: 'credit' },
    );
    expect(result.transactions[0]?.type).toBe('INCOME');
    expect(result.transactions[0]?.amount).toBe(5000);
  });

  it('maps a unified amount column, preserving sign', () => {
    const result = mapRows(
      [
        { d: '2026-04-21', desc: 'A', amt: '-100.50' },
        { d: '2026-04-21', desc: 'B', amt: '200.00' },
      ],
      { d: 'date', desc: 'description', amt: 'amount' },
    );
    expect(result.transactions[0]?.amount).toBe(-100.5);
    expect(result.transactions[0]?.type).toBe('EXPENSE');
    expect(result.transactions[1]?.amount).toBe(200);
    expect(result.transactions[1]?.type).toBe('INCOME');
  });

  it('produces deterministic externalId hashes for identical rows', () => {
    const rows = [{ d: '2026-04-21', desc: 'CAFE LUNA', amt: '25.00' }];
    const mapping = { d: 'date' as const, desc: 'description' as const, amt: 'amount' as const };
    const a = mapRows(rows, mapping);
    const b = mapRows(rows, mapping);
    expect(a.transactions[0]?.externalId).toBe(b.transactions[0]?.externalId);
  });

  it('collects errors for invalid rows instead of throwing', () => {
    const result = mapRows(
      [
        { d: 'no-es-fecha', desc: 'X', amt: '100' },
        { d: '2026-04-21', desc: '', amt: '100' },
        { d: '2026-04-21', desc: 'Y', amt: 'no-es-numero' },
      ],
      { d: 'date', desc: 'description', amt: 'amount' },
    );
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(3);
    expect(result.errors[0]?.message).toMatch(/fecha/);
    expect(result.errors[1]?.message).toMatch(/descripci/);
    expect(result.errors[2]?.message).toMatch(/monto/);
  });

  it('picks up merchantNit when the column is mapped', () => {
    const result = mapRows([{ d: '2026-04-21', desc: 'X', amt: '100', n: '1234567' }], {
      d: 'date',
      desc: 'description',
      amt: 'amount',
      n: 'merchantNit',
    });
    expect(result.transactions[0]?.merchantNit).toBe('1234567');
  });

  it('rounds amounts to 2 decimal places', () => {
    const result = mapRows([{ d: '2026-04-21', desc: 'X', amt: '100.125' }], {
      d: 'date',
      desc: 'description',
      amt: 'amount',
    });
    expect(result.transactions[0]?.amount).toBe(100.13);
  });
});
