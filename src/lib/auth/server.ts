import { cookies } from 'next/headers';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

/**
 * Supabase client for server components, route handlers, and server actions.
 *
 * Every call reads the request's cookies fresh so session-refresh writes
 * from `middleware.ts` are picked up immediately. In server components
 * the cookie setter may throw because Next's Server Component runtime
 * is read-only for cookies — we swallow that error per Supabase's
 * official guidance since the middleware has already refreshed the
 * session before the request reaches the component.
 */
export async function createSupabaseServerSideClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createSupabaseServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /*
           * why: Server Components cannot mutate cookies. When called from
           * a Server Component the `set` method throws; swallowing the
           * error is safe because middleware.ts has already refreshed the
           * session cookie for this request. Called from route handlers
           * and server actions, the write succeeds normally.
           */
        }
      },
    },
  });
}

/**
 * Shortcut for "who is the current user?" in server code.
 * Returns the Supabase User or null. Uses `getUser()` which revalidates
 * the token against Supabase Auth — NEVER use `getSession()` in server
 * code to authorize (its token is client-controllable).
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerSideClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}
