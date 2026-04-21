import { describe, expect, it } from 'vitest';
import { isAuthPage, isProtectedPath } from './routes';

describe('isProtectedPath', () => {
  it.each([
    '/dashboard',
    '/dashboard/salud',
    '/transacciones',
    '/transacciones/abc-123',
    '/contabilidad/catalogo',
    '/reportes/iva',
    '/inteligencia/anomalias',
    '/logros',
    '/configuracion/seguridad',
    '/ayuda',
    '/bienvenida',
    '/cambiar-a-empresa',
  ])('treats %s as protected', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each(['/', '/ingresar', '/ingresar/revisa-tu-correo', '/design-system', '/terminos'])(
    'does NOT treat %s as protected',
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );

  it('prefix match does not over-reach — /dashboardsomething is not /dashboard', () => {
    expect(isProtectedPath('/dashboardsomething')).toBe(false);
  });
});

describe('isAuthPage', () => {
  it.each(['/ingresar', '/ingresar/revisa-tu-correo'])('treats %s as auth page', (path) => {
    expect(isAuthPage(path)).toBe(true);
  });

  it.each(['/', '/dashboard', '/auth/callback', '/design-system', '/terminos', '/precios'])(
    'does NOT treat %s as auth page',
    (path) => {
      expect(isAuthPage(path)).toBe(false);
    },
  );

  it('auth callback is exempt — it needs to run for signed-in users too', () => {
    expect(isAuthPage('/auth/callback')).toBe(false);
  });
});
