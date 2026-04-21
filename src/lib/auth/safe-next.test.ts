import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('returns /dashboard as the safe default', () => {
    expect(safeNext(null)).toBe('/dashboard');
    expect(safeNext(undefined)).toBe('/dashboard');
    expect(safeNext('')).toBe('/dashboard');
  });

  it('accepts safe relative paths unchanged', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard');
    expect(safeNext('/transacciones/abc-123')).toBe('/transacciones/abc-123');
    expect(safeNext('/reportes/iva?period=2026-04')).toBe('/reportes/iva?period=2026-04');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeNext('//evil.example/phish')).toBe('/dashboard');
  });

  it('rejects absolute URLs regardless of scheme', () => {
    expect(safeNext('https://evil.example/phish')).toBe('/dashboard');
    expect(safeNext('http://evil.example')).toBe('/dashboard');
    expect(safeNext('javascript://evil')).toBe('/dashboard');
    expect(safeNext('data:text/html,<script>alert(1)</script>')).toBe('/dashboard');
  });

  it('rejects paths that do not start with /', () => {
    expect(safeNext('dashboard')).toBe('/dashboard');
    expect(safeNext('evil.com')).toBe('/dashboard');
  });

  it('rejects paths containing backslashes (Windows scheme escape)', () => {
    expect(safeNext('/\\evil.com')).toBe('/dashboard');
    expect(safeNext('\\\\evil.com')).toBe('/dashboard');
  });

  it('accepts paths with query strings and fragments', () => {
    expect(safeNext('/transacciones?filter=unmatched')).toBe('/transacciones?filter=unmatched');
    expect(safeNext('/dashboard#salud')).toBe('/dashboard#salud');
  });
});
