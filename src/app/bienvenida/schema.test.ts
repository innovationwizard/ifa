import { describe, expect, it } from 'vitest';
import { normalizeOnboarding, onboardingSchema } from './schema';

describe('onboardingSchema', () => {
  it('accepts a plain name with no DPI', () => {
    const result = onboardingSchema.safeParse({ displayName: 'Ana López' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe('Ana López');
      expect(result.data.dpiNumber).toBeUndefined();
    }
  });

  it('accepts a name and a DPI number', () => {
    const result = onboardingSchema.safeParse({
      displayName: 'Juan Pérez',
      dpiNumber: '1234 56789 0101',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dpiNumber).toBe('1234 56789 0101');
    }
  });

  it('trims whitespace around the name', () => {
    const result = onboardingSchema.safeParse({ displayName: '   María   ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBe('María');
    }
  });

  it('rejects a name shorter than 2 characters', () => {
    expect(onboardingSchema.safeParse({ displayName: 'A' }).success).toBe(false);
  });

  it('rejects a name longer than 100 characters', () => {
    expect(onboardingSchema.safeParse({ displayName: 'x'.repeat(101) }).success).toBe(false);
  });

  it('rejects a DPI longer than 50 characters', () => {
    expect(
      onboardingSchema.safeParse({ displayName: 'Ok', dpiNumber: '1'.repeat(51) }).success,
    ).toBe(false);
  });

  it('accepts free-form DPI content — no format enforcement', () => {
    /*
     * Locked product decision: DPI is opt-in metadata never validated.
     * The schema must accept anything the user types (within the length
     * cap) so we don't reject legitimate variations of their CUI.
     */
    const result = onboardingSchema.safeParse({
      displayName: 'Ok',
      dpiNumber: 'CUI: 1234-56789 0101',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dpiNumber).toBe('CUI: 1234-56789 0101');
    }
  });
});

describe('normalizeOnboarding', () => {
  it('passes a real DPI through verbatim', () => {
    expect(normalizeOnboarding({ displayName: 'Ana', dpiNumber: '1234567890101' })).toEqual({
      displayName: 'Ana',
      dpiNumber: '1234567890101',
    });
  });

  it('collapses undefined DPI to null', () => {
    expect(normalizeOnboarding({ displayName: 'Ana' })).toEqual({
      displayName: 'Ana',
      dpiNumber: null,
    });
  });

  it('collapses an empty-string DPI to null', () => {
    expect(normalizeOnboarding({ displayName: 'Ana', dpiNumber: '' })).toEqual({
      displayName: 'Ana',
      dpiNumber: null,
    });
  });

  it('collapses a whitespace-only DPI to null', () => {
    expect(normalizeOnboarding({ displayName: 'Ana', dpiNumber: '   ' })).toEqual({
      displayName: 'Ana',
      dpiNumber: null,
    });
  });
});
