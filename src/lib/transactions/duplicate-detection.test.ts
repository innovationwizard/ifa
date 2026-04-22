import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  amountToString,
  duplicateWindow,
  hasActiveDuplicateFlag,
  readDuplicateMetadata,
  tripletKey,
} from './duplicate-detection';

describe('tripletKey', () => {
  it('emits a deterministic pipe-delimited key', () => {
    const key = tripletKey({
      date: new Date('2026-04-21T00:00:00Z'),
      amount: '-150.00',
      description: 'GASOLINERA SHELL',
    });
    expect(key).toBe('2026-04-21|-150.00|GASOLINERA SHELL');
  });

  it('ignores the time-of-day portion of the Date', () => {
    const a = tripletKey({
      date: new Date('2026-04-21T00:00:00Z'),
      amount: '100.00',
      description: 'X',
    });
    const b = tripletKey({
      date: new Date('2026-04-21T23:59:59Z'),
      amount: '100.00',
      description: 'X',
    });
    expect(a).toBe(b);
  });
});

describe('duplicateWindow', () => {
  it('produces a ±90-day range by default', () => {
    const around = new Date('2026-04-21T00:00:00Z');
    const { gte, lte } = duplicateWindow(around);
    expect(gte.toISOString().slice(0, 10)).toBe('2026-01-21');
    expect(lte.toISOString().slice(0, 10)).toBe('2026-07-20');
  });

  it('honors a custom day count', () => {
    const around = new Date('2026-04-21T00:00:00Z');
    const { gte, lte } = duplicateWindow(around, 7);
    expect(gte.toISOString().slice(0, 10)).toBe('2026-04-14');
    expect(lte.toISOString().slice(0, 10)).toBe('2026-04-28');
  });
});

describe('amountToString', () => {
  it('normalizes a number to 2 decimals', () => {
    expect(amountToString(100)).toBe('100.00');
    expect(amountToString(100.5)).toBe('100.50');
    expect(amountToString(-1.234)).toBe('-1.23');
  });

  it('normalizes a string to 2 decimals', () => {
    expect(amountToString('100')).toBe('100.00');
    expect(amountToString('-1.5')).toBe('-1.50');
  });

  it('normalizes a Decimal to 2 decimals', () => {
    expect(amountToString(new Prisma.Decimal('100.5'))).toBe('100.50');
  });
});

describe('readDuplicateMetadata', () => {
  it('returns empty object for null/undefined/non-object input', () => {
    expect(readDuplicateMetadata(null)).toEqual({});
    expect(readDuplicateMetadata(undefined)).toEqual({});
    expect(readDuplicateMetadata('string')).toEqual({});
    expect(readDuplicateMetadata(42)).toEqual({});
  });

  it('extracts possibleDuplicateOf when it is a string', () => {
    expect(readDuplicateMetadata({ possibleDuplicateOf: 'tx-123' })).toEqual({
      possibleDuplicateOf: 'tx-123',
    });
  });

  it('ignores possibleDuplicateOf when it is the wrong shape', () => {
    expect(readDuplicateMetadata({ possibleDuplicateOf: 42 })).toEqual({});
  });

  it('extracts duplicateDismissed only when strictly true', () => {
    expect(readDuplicateMetadata({ duplicateDismissed: true })).toEqual({
      duplicateDismissed: true,
    });
    expect(readDuplicateMetadata({ duplicateDismissed: 'yes' })).toEqual({});
    expect(readDuplicateMetadata({ duplicateDismissed: 1 })).toEqual({});
  });
});

describe('hasActiveDuplicateFlag', () => {
  it('true when possibleDuplicateOf set and not dismissed', () => {
    expect(hasActiveDuplicateFlag({ possibleDuplicateOf: 'x' })).toBe(true);
  });

  it('false when dismissed', () => {
    expect(hasActiveDuplicateFlag({ possibleDuplicateOf: 'x', duplicateDismissed: true })).toBe(
      false,
    );
  });

  it('false when no duplicate link', () => {
    expect(hasActiveDuplicateFlag({})).toBe(false);
    expect(hasActiveDuplicateFlag({ duplicateDismissed: true })).toBe(false);
  });
});
