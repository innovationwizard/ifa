import { describe, expect, it } from 'vitest';
import { normalizeUpgrade, upgradeSchema } from './schema';

describe('upgradeSchema', () => {
  it('accepts a name with no NIT', () => {
    const result = upgradeSchema.safeParse({ displayName: 'Café Aurora' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBe('Café Aurora');
  });

  it('trims whitespace around the name', () => {
    const result = upgradeSchema.safeParse({ displayName: '   Mi Tienda S.A.   ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.displayName).toBe('Mi Tienda S.A.');
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(upgradeSchema.safeParse({ displayName: 'A' }).success).toBe(false);
  });

  it('rejects a name longer than 100 characters', () => {
    expect(upgradeSchema.safeParse({ displayName: 'x'.repeat(101) }).success).toBe(false);
  });

  it('rejects a NIT longer than 20 characters', () => {
    expect(upgradeSchema.safeParse({ displayName: 'Ok', nit: '1'.repeat(21) }).success).toBe(false);
  });

  it('accepts free-form NIT content — no format enforcement', () => {
    /*
     * Locked product decision: NIT is optional metadata, never
     * validated. Keep this test — a future contributor should not
     * regress the schema into format validation.
     */
    const result = upgradeSchema.safeParse({
      displayName: 'Negocio',
      nit: 'NIT 1234567-8',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nit).toBe('NIT 1234567-8');
  });
});

describe('normalizeUpgrade', () => {
  it('passes a real NIT through verbatim', () => {
    expect(normalizeUpgrade({ displayName: 'Negocio', nit: '12345678' })).toEqual({
      displayName: 'Negocio',
      nit: '12345678',
    });
  });

  it('collapses undefined NIT to null', () => {
    expect(normalizeUpgrade({ displayName: 'Negocio' })).toEqual({
      displayName: 'Negocio',
      nit: null,
    });
  });

  it('collapses empty-string NIT to null', () => {
    expect(normalizeUpgrade({ displayName: 'Negocio', nit: '' })).toEqual({
      displayName: 'Negocio',
      nit: null,
    });
  });

  it('collapses whitespace-only NIT to null', () => {
    expect(normalizeUpgrade({ displayName: 'Negocio', nit: '   ' })).toEqual({
      displayName: 'Negocio',
      nit: null,
    });
  });
});
