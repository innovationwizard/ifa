/**
 * Typed environment-variable access.
 *
 * Every env var the app depends on passes through this module. Two critical
 * constraints drive the shape below:
 *
 *   1. Next.js inlines `NEXT_PUBLIC_*` values into the client bundle via
 *      compile-time string replacement, but ONLY for static property access
 *      (`process.env.NEXT_PUBLIC_FOO`). Dynamic access
 *      (`process.env[name]`, where `name` is a runtime value) does NOT get
 *      inlined — at runtime the browser sees an effectively empty
 *      `process.env` and reads come back `undefined`. So every public var
 *      below must be referenced by its literal name.
 *
 *   2. Server-only secrets (service role key, DB URLs, Anthropic key) must
 *      never be accessed from a module that can be imported into the client
 *      bundle. `getServerEnv()` reads them lazily inside a function that's
 *      gated on `typeof window`, so the values stay out of any code path
 *      imported by `'use client'` modules.
 */

// ---------------------------------------------------------------------------
// Public env vars — client-safe. Static access so Next can inline the values.
// ---------------------------------------------------------------------------

const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const rawDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE;
const rawVercelUrl = process.env.VERCEL_URL;

if (!rawSupabaseUrl || !rawSupabaseAnonKey) {
  throw new Error(
    'Missing required public env vars: NEXT_PUBLIC_SUPABASE_URL and ' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set. Copy from .env.example ' +
      'into .env.local (see docs_operations/vercel-setup.md).',
  );
}

export const publicEnv = {
  supabaseUrl: rawSupabaseUrl,
  supabaseAnonKey: rawSupabaseAnonKey,
  demoMode: rawDemoMode === 'true',
  /**
   * Canonical URL of the app. Falls back to `https://$VERCEL_URL` on Vercel,
   * then to localhost for dev.
   */
  siteUrl: rawSiteUrl ?? (rawVercelUrl ? `https://${rawVercelUrl}` : 'http://localhost:3000'),
} as const;

// ---------------------------------------------------------------------------
// Server-only env vars — static access too, but wrapped in a function that
// asserts we're on the server. Never touch this from a `'use client'` module.
// ---------------------------------------------------------------------------

function requireServerEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required server env var: ${name}. Set it in .env.local for ` +
        `local dev or in your Vercel project's Environment Variables for ` +
        `preview/production.`,
    );
  }
  return value;
}

/**
 * Server-only env vars. THROWS if called from a client bundle (where
 * `window` is defined). Touch these only from route handlers, server
 * actions, middleware/proxy, and server components.
 */
export function getServerEnv(): {
  supabaseServiceRoleKey: string;
  databaseUrl: string;
  directUrl: string;
  anthropicApiKey: string;
} {
  if (typeof window !== 'undefined') {
    throw new Error(
      'getServerEnv() called from a client bundle. Split the import so only ' +
        'server code touches server-only secrets.',
    );
  }
  return {
    supabaseServiceRoleKey: requireServerEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    databaseUrl: requireServerEnv('DATABASE_URL', process.env.DATABASE_URL),
    directUrl: requireServerEnv('DIRECT_URL', process.env.DIRECT_URL),
    anthropicApiKey: requireServerEnv('ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY),
  };
}

/**
 * Stripe server env vars — OPTIONAL by design. Returns `null` when the
 * secret key is not configured so the app runs in a trial-only,
 * Stripe-disabled mode during early development. Checkout/portal/webhook
 * handlers short-circuit gracefully when this is null.
 *
 * Required for billing:
 *   - STRIPE_SECRET_KEY              `sk_test_*` / `sk_live_*`
 *   - STRIPE_WEBHOOK_SECRET          `whsec_*` (signing secret for /webhook)
 *   - STRIPE_PRICE_INDIVIDUAL_ID     Price id for the $1/mo personal plan
 *   - STRIPE_PRICE_BUSINESS_ID       Price id for the $20/mo business plan
 *
 * When partially configured (secret key set but price ids missing), the
 * checkout route errors with a clear message so misconfiguration surfaces
 * loudly instead of silently falling back to trial-only mode.
 */
/**
 * Transactional-email env (Phase L4) — OPTIONAL by design, mirroring
 * `getStripeEnv()`. Returns `null` when no provider is configured so
 * the app runs in "email-disabled" mode during early development.
 * The `sendEmail` wrapper logs + skips when this is null (rather than
 * throwing) so missing email config never breaks user-facing flows.
 *
 * Required when configured:
 *   - EMAIL_PROVIDER             'resend' | 'ses'
 *   - EMAIL_FROM_ADDRESS         e.g. `noreply@ifa.gt`
 *   - EMAIL_FROM_NAME            display name, e.g. `IFA`
 *
 * Resend (`EMAIL_PROVIDER=resend`):
 *   - RESEND_API_KEY             `re_*` from resend.com → API Keys
 *
 * AWS SES (`EMAIL_PROVIDER=ses`):
 *   - AWS_SES_REGION             e.g. `us-east-1`
 *   - AWS_SES_ACCESS_KEY_ID      IAM user with `ses:SendEmail` only
 *   - AWS_SES_SECRET_ACCESS_KEY  paired secret
 *
 * Note: we use namespaced AWS_SES_* vars (not the default AWS_* vars)
 * so the SES credentials never leak into other AWS SDK calls and so
 * a Vercel project can have multiple AWS integrations without
 * collision.
 */
export function getEmailEnv(): {
  provider: 'resend' | 'ses';
  fromAddress: string;
  fromName: string;
  resendApiKey: string | null;
  awsSesRegion: string | null;
  awsSesAccessKeyId: string | null;
  awsSesSecretAccessKey: string | null;
} | null {
  if (typeof window !== 'undefined') {
    throw new Error(
      'getEmailEnv() called from a client bundle. Split the import so only ' +
        'server code touches email secrets.',
    );
  }
  const rawProvider = process.env.EMAIL_PROVIDER;
  if (!rawProvider) return null;
  if (rawProvider !== 'resend' && rawProvider !== 'ses') {
    throw new Error(
      `EMAIL_PROVIDER must be 'resend' or 'ses' (got '${rawProvider}'). ` +
        `See docs_operations/vercel-setup.md.`,
    );
  }
  return {
    provider: rawProvider,
    fromAddress: requireServerEnv('EMAIL_FROM_ADDRESS', process.env.EMAIL_FROM_ADDRESS),
    fromName: requireServerEnv('EMAIL_FROM_NAME', process.env.EMAIL_FROM_NAME),
    resendApiKey: process.env.RESEND_API_KEY ?? null,
    awsSesRegion: process.env.AWS_SES_REGION ?? null,
    awsSesAccessKeyId: process.env.AWS_SES_ACCESS_KEY_ID ?? null,
    awsSesSecretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY ?? null,
  };
}

export function getStripeEnv(): {
  secretKey: string;
  webhookSecret: string | null;
  priceIndividualId: string | null;
  priceBusinessId: string | null;
} | null {
  if (typeof window !== 'undefined') {
    throw new Error(
      'getStripeEnv() called from a client bundle. Split the import so only ' +
        'server code touches Stripe secrets.',
    );
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return {
    secretKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
    priceIndividualId: process.env.STRIPE_PRICE_INDIVIDUAL_ID ?? null,
    priceBusinessId: process.env.STRIPE_PRICE_BUSINESS_ID ?? null,
  };
}
