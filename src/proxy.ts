import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Next.js proxy (formerly "middleware") — runs on every request NOT matched
 * by the `config.matcher` exclusions. Its sole responsibility in S-2.1 is
 * to refresh the Supabase session cookie so that the access_token stays
 * valid on the user's next navigation.
 *
 * Route protection (redirecting unauthenticated users away from `(app)/*`
 * and `/onboarding/*`) lands in S-2.2; for now the proxy's only behavior
 * is the session refresh.
 *
 * File convention: Next.js 16 renamed `src/middleware.ts` → `src/proxy.ts`
 * and the exported function to `proxy`. The signature and runtime are
 * identical.
 *
 * Pattern follows Supabase's official SSR cookbook: we create a Supabase
 * server client wired to BOTH the request cookies (read) and the response
 * cookies (write). Calling `supabase.auth.getUser()` triggers the refresh
 * if the token is close to expiry.
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

  // Refresh the session if it's close to expiry. Do NOT use getSession()
  // here — it reads the cookie without revalidating and can be spoofed.
  await supabase.auth.getUser();

  return response;
}

/**
 * Skip static assets and Next internals. Everything else (pages, API routes,
 * server components) runs through the proxy so the session stays fresh.
 * Icon + OG-image routes are excluded because they are static-prerendered and
 * should not pay the proxy round-trip cost.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
