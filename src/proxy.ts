import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';
import { AUTHENTICATED_HOME, SIGN_IN_ROUTE, isAuthPage, isProtectedPath } from '@/lib/auth/routes';

/**
 * Next.js proxy (formerly "middleware") — runs on every request not
 * excluded by `config.matcher`.
 *
 * Two responsibilities:
 *   1. Refresh the Supabase session cookie (S-2.1). Ensures access_token
 *      stays valid on the user's next navigation.
 *   2. Enforce auth on protected routes (S-2.2):
 *        - Anonymous → any protected prefix  ⇒  redirect to /ingresar
 *          with `?next=<original-path>` preserved so the login flow
 *          can return the user to their intent on success.
 *        - Authenticated → any auth page (/ingresar, /crear-cuenta,
 *          /recuperar)  ⇒  redirect to /dashboard. The onboarding-
 *          state-based redirect (→ /bienvenida) lives in the (app)
 *          layout so the proxy doesn't hit the database on every
 *          request; see project_compute_constraints.md.
 *
 * File convention: Next.js 16 renamed `src/middleware.ts` →
 * `src/proxy.ts` and the exported function to `proxy`. Signature and
 * runtime are identical.
 *
 * Pattern follows Supabase's official SSR cookbook: we create a
 * Supabase server client wired to BOTH the request cookies (read) and
 * the response cookies (write). Calling `supabase.auth.getUser()`
 * triggers the refresh if the token is close to expiry AND is the
 * authoritative answer to "is there a valid session?" — never use
 * `getSession()` for authorization because its token is
 * client-spoofable.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Revalidates against Supabase Auth. Returning null here means "no
  // authenticated session for this request"; anything else means the
  // request is authenticated.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && isProtectedPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = SIGN_IN_ROUTE;
    redirectUrl.search = '';
    /*
     * Preserve the original destination (path + querystring) so the
     * /ingresar page can route the user back to their intent after a
     * successful sign-in. The `next` param is sanitized downstream in
     * S-2.3 to prevent open-redirect abuse.
     */
    redirectUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthPage(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = AUTHENTICATED_HOME;
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

/**
 * Skip static assets and Next internals. Everything else (pages, API
 * routes, server components) runs through the proxy so the session
 * stays fresh and protection rules apply.
 * Icon + OG-image routes are excluded because they are static-prerendered
 * and should not pay the proxy round-trip cost.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
