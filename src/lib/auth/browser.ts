'use client';

import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Supabase client for client components and browser-side code.
 *
 * Reads/writes session state via the same cookie jar that the server
 * client uses, so a sign-in from a client form immediately reflects
 * into subsequent server-component renders once the session cookie is
 * set.
 *
 * Instantiate lazily at use site — Supabase's browser client is cheap
 * and keeps no singletons internally beyond the realtime channel, so
 * creating one per hook is both safe and clearer than a module-level
 * singleton (which would force `'use client'` on the module's import
 * graph in unexpected places).
 */
export function createSupabaseBrowserSideClient() {
  return createSupabaseBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
