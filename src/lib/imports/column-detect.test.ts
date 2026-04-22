import { describe, expect, it } from 'vitest';
import { detectColumns, validateMapping } from './column-detect';

describe('detectColumns', () => {
  it('recognizes a BAC signature with high confidence', () => {
    const result = detectColumns(['Fecha', 'Concepto', 'Débito', 'Crédito', 'Balance']);
    expect(result.detectedBank).toBe('BAC');
    expect(result.confidence).toBe(1);
    expect(result.mapping).toMatchObject({
      Fecha: 'date',
      Concepto: 'description',
      Débito: 'debit',
      Crédito: 'credit',
      Balance: 'ignore',
    });
  });

  it('recognizes a Banco Industrial signature', () => {
    const result = detectColumns([
      'Fecha Operación',
      'Descripción',
      'Retiros',
      'Depósitos',
      'Saldo',
    ]);
    expect(result.detectedBank).toBe('BANCO_INDUSTRIAL');
    expect(result.confidence).toBe(1);
    expect(result.mapping).toMatchObject({
      'Fecha Operación': 'date',
      Descripción: 'description',
      Retiros: 'debit',
      Depósitos: 'credit',
      Saldo: 'ignore',
    });
  });

  it('falls back to GENERIC for unrecognized headers with keyword matches', () => {
    const result = detectColumns(['date', 'description', 'amount', 'NIT']);
    expect(result.detectedBank).toBe('GENERIC');
    expect(result.mapping).toEqual({
      date: 'date',
      description: 'description',
      amount: 'amount',
      NIT: 'merchantNit',
    });
    expect(result.confidence).toBe(1);
  });

  it('handles accent + case variation', () => {
    const result = detectColumns(['FECHA', 'concepto', 'debito', 'credito', 'saldo']);
    expect(result.detectedBank).toBe('BAC');
  });

  it('gives 0 confidence when nothing matches', () => {
    const result = detectColumns(['col_a', 'col_b', 'col_c']);
    expect(result.detectedBank).toBe('GENERIC');
    expect(result.confidence).toBe(0);
    expect(result.mapping).toEqual({ col_a: 'ignore', col_b: 'ignore', col_c: 'ignore' });
  });

  it('maps "Importe" and "Monto" to amount', () => {
    expect(detectColumns(['Fecha', 'Detalle', 'Importe']).mapping.Importe).toBe('amount');
    expect(detectColumns(['Fecha', 'Detalle', 'Monto']).mapping.Monto).toBe('amount');
  });

  it('ignores "Sucursal", "Canal", "Referencia" noise columns', () => {
    const result = detectColumns(['Fecha', 'Concepto', 'Monto', 'Sucursal', 'Canal', 'Referencia']);
    expect(result.mapping.Sucursal).toBe('ignore');
    expect(result.mapping.Canal).toBe('ignore');
    expect(result.mapping.Referencia).toBe('ignore');
  });

  it('returns an empty mapping for empty headers', () => {
    const result = detectColumns([]);
    expect(result.mapping).toEqual({});
    expect(result.confidence).toBe(0);
  });
});

describe('validateMapping', () => {
  it('passes for a minimal valid mapping (date + description + amount)', () => {
    expect(validateMapping({ d: 'date', desc: 'description', a: 'amount' })).toEqual({
      ok: true,
      missing: [],
    });
  });

  it('passes for date + description + debit/credit pair', () => {
    expect(validateMapping({ f: 'date', c: 'description', db: 'debit', cr: 'credit' })).toEqual({
      ok: true,
      missing: [],
    });
  });

  it('passes with just debit (credit optional)', () => {
    expect(validateMapping({ f: 'date', c: 'description', db: 'debit' })).toEqual({
      ok: true,
      missing: [],
    });
  });

  it('flags missing date', () => {
    const result = validateMapping({ desc: 'description', a: 'amount' });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('date');
  });

  it('flags missing amount + debit + credit', () => {
    const result = validateMapping({ f: 'date', c: 'description' });
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('amount');
  });

  it('flags multiple missing fields', () => {
    const result = validateMapping({ x: 'ignore' });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining(['date', 'description', 'amount']));
  });
});
