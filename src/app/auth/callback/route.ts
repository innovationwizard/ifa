import { type NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerSideClient } from '@/lib/auth/server';
import { safeNext } from '@/lib/auth/safe-next';

/**
 * Email-confirmation + magic-link landing route.
 *
 * Supabase's confirmation links point here with a `code` query param. We
 * exchange it for a session cookie and redirect the user onward:
 *   - If `?next=<safe-path>` was supplied, go there (used by future flows
 *     that want to resume a specific page post-signup).
 *   - Otherwise, default to `/bienvenida` (S-2.8 single-step onboarding).
 *     The onboarding page itself checks `profile.onboardingCompleted` and
 *     forwards to /dashboard when it's already done.
 *
 * This route is intentionally NOT listed in AUTH_PAGES (the proxy does
 * not redirect authenticated users away from it): the callback MUST run
 * even when a session is partially established, otherwise the
 * user-confirmed-but-not-in-our-user-table edge case can deadlock.
 *
 * Errors redirect to /ingresar with a ?error= marker so the login page
 * can surface a message. Login page surface for these error codes lands
 * with S-2.5 where we'll need similar plumbing for reset tokens.
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
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const redirect = url.clone();
    redirect.pathname = '/ingresar';
    redirect.search = '?error=exchange_failed';
    return NextResponse.redirect(redirect);
  }

  const destination = safeNext(nextParam, '/bienvenida');
  const redirect = url.clone();
  redirect.pathname = destination;
  redirect.search = '';
  return NextResponse.redirect(redirect);
}
