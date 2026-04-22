import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, getServerEnv } from '@/lib/env';

/**
 * Service-role Supabase client for server-only storage operations.
 *
 * Used for:
 *   - Creating signed upload URLs that let the browser upload large
 *     files directly to Supabase Storage without round-tripping
 *     through Next's 4.5MB serverless body limit.
 *   - Downloading uploaded CSV files for server-side parsing
 *     (/api/v1/transactions/import).
 *
 * This client bypasses Row Level Security. Never expose it to a
 * client bundle; the `import 'server-only'` directive at the top of
 * this file makes Next throw at build time if a client component
 * tries to import us transitively.
 *
 * Cached module-level so the same HTTP connection pool is reused
 * across requests on a warm Vercel function.
 */
let cached: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const { supabaseServiceRoleKey } = getServerEnv();
  cached = createClient(publicEnv.supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const IMPORTS_BUCKET = 'imports';
