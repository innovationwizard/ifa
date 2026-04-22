import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerSideClient } from '@/lib/auth/server';
import { safeNext } from '@/lib/auth/safe-next';
import { ensureUserAndProfile } from '@/lib/auth/ensure-user-profile';

/**
 * Email-confirmation + magic-link + OAuth landing route.
 *
 * Supabase's confirmation links point here with a `code` query param. We
 * exchange it for a session cookie, ensure the IFA-side User + Profile
 * rows exist (first-sign-in bootstrap — S-2.7), and redirect onward:
 *
 *   - If `?next=<safe-path>` was supplied, honor it.
 *   - First-time sign-ins (no Profile yet before bootstrap) land on
 *     `/bienvenida` for onboarding.
 *   - Returning users land on `/dashboard`.
 *
 * This route is intentionally NOT listed in AUTH_PAGES (the proxy does
 * not redirect authenticated users away from it): the callback MUST run
 * even when a session is partially established, otherwise the
 * user-confirmed-but-not-in-our-user-table edge case can deadlock.
 *
 * Errors redirect to /ingresar with a ?error= marker so the login page
 * can surface a message.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next');

  if (!code) {
    const redirect = url.clone();
    redirect.pathname = '/ingresar';
    redirect.search = '?error=missing_code';
    return NextResponse.redirect(redirect);
  }

  const supabase = await createSupabaseServerSideClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    const redirect = url.clone();
    redirect.pathname = '/ingresar';
    redirect.search = '?error=exchange_failed';
    return NextResponse.redirect(redirect);
  }

  let isFirstSignIn: boolean;
  try {
    const bootstrap = await ensureUserAndProfile(data.user);
    isFirstSignIn = bootstrap.isFirstSignIn;
  } catch (bootstrapError) {
    /*
     * Session is valid but our User/Profile bootstrap failed. This
     * shouldn't happen under normal conditions, but swallowing the
     * error and sending the user into the app would yield a broken
     * state (missing rows → (app) layout redirects to /bienvenida,
     * which also depends on bootstrap). Bounce back to /ingresar
     * with a generic error marker so the user can retry.
     */
    console.error('[auth/callback] ensureUserAndProfile failed', bootstrapError);
    const redirect = url.clone();
    redirect.pathname = '/ingresar';
    redirect.search = '?error=bootstrap_failed';
    return NextResponse.redirect(redirect);
  }

  /*
   * Default destination: /bienvenida for first-time users (onboarding
   * lives there), /dashboard for returning users. A `?next=` override
   * always wins if it resolves to a safe path.
   */
  const fallback = isFirstSignIn ? '/bienvenida' : '/dashboard';
  const destination = safeNext(nextParam, fallback);
  const redirect = url.clone();
  redirect.pathname = destination;
  redirect.search = '';
  return NextResponse.redirect(redirect);
}
