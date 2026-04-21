/**
 * Typed environment-variable access.
 *
 * Why this module exists: `process.env.*` is `string | undefined`, so naive
 * usage either litters the codebase with `!` non-null assertions (forbidden
 * by our strict-TS rules) or risks runtime `undefined` reaching real code.
 * Every env var the app depends on passes through `requireEnv()` exactly
 * once here, with a clear error if it's missing.
 *
 * Public-safe vars (prefixed `NEXT_PUBLIC_`) are read on the client; the
 * server-only vars (SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, database
 * URLs) are gated behind a runtime guard so a mis-import on the client
 * throws loudly rather than leaking secrets silently.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy from .env.example into .env.local (see docs_operations/vercel-setup.md).`,
    );
  }
  return value;
}

function assertServer(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Server-only env var imported into client code. Split the import into a server module.',
    );
  }
}

/**
 * Public env vars — safe on both client and server.
 * Keep this surface intentionally small; every addition here is shipped
 * to every browser bundle.
 */
export const publicEnv = {
  supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true',
  /**
   * Canonical URL of the app. Falls back to `https://$VERCEL_URL` on Vercel,
   * then to localhost for dev.
   */
  siteUrl:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
} as const;

/**
 * Server-only env vars — THROWS if imported into a client bundle. Touch
 * these only from route handlers, server actions, middleware, and server
 * components.
 */
export function getServerEnv(): {
  supabaseServiceRoleKey: string;
  databaseUrl: string;
  directUrl: string;
  anthropicApiKey: string;
} {
  assertServer();
  return {
    supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    databaseUrl: requireEnv('DATABASE_URL'),
    directUrl: requireEnv('DIRECT_URL'),
    anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
  };
}
