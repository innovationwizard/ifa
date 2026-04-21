/**
 * Route categorization for auth gating.
 *
 * Single source of truth — imported by the proxy (server-side redirects)
 * and available to UI code that needs to show/hide nav items based on
 * auth state. Keep this list in sync with the route tree under `src/app/`.
 */

/**
 * Routes that require an authenticated user. Anonymous requests to any
 * prefix here are redirected to `/ingresar?next=<original>`.
 *
 * Includes the eight module prefixes under the `(app)` route group
 * (`(app)` is a pathless grouping so routes surface without the prefix)
 * and the onboarding entry point `/bienvenida` used by S-2.8.
 */
export const PROTECTED_PREFIXES = [
  '/dashboard',
  '/transacciones',
  '/contabilidad',
  '/reportes',
  '/inteligencia',
  '/logros',
  '/configuracion',
  '/ayuda',
  '/bienvenida',
  '/cambiar-a-empresa',
] as const;

/**
 * Auth pages — shown to anonymous users only. Authenticated users hitting
 * any of these are redirected to `/dashboard` (the user's home). The Supabase
 * callback route under `/auth/callback` is NOT in this list because it needs
 * to run for signed-in users too (it completes email confirmation + sets
 * the session cookie before redirecting onward).
 */
export const AUTH_PAGES = ['/ingresar', '/crear-cuenta', '/recuperar'] as const;

/**
 * Post-authentication landing route. Onboarding state may redirect further
 * (to `/bienvenida`) — that check lives in the `(app)` layout, not the
 * proxy, so we don't hit the database on every request.
 */
export const AUTHENTICATED_HOME = '/dashboard';

/**
 * Where to send anonymous users trying to reach a protected route.
 */
export const SIGN_IN_ROUTE = '/ingresar';

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}
