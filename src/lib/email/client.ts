import 'server-only';
import { getEmailEnv } from '@/lib/env';
import { resendProvider } from './providers/resend';
import { sesProvider } from './providers/ses';
import type { EmailAddress, EmailProvider } from './types';

/**
 * Email provider selector — Phase L4.
 *
 * Reads `EMAIL_PROVIDER` from env once and caches the resolved
 * provider. Throws via the underlying provider if its credentials
 * are missing — credential errors should surface loudly at the first
 * send attempt rather than silently degrade.
 *
 * Returns `null` when no provider is configured (the friends-and-
 * family beta runs in this mode until the founder configures Resend
 * or SES). Callers must handle the null case — see `sendEmail`.
 */

let cached: EmailProvider | null | undefined;

export function getEmailProvider(): EmailProvider | null {
  if (cached !== undefined) return cached;
  const env = getEmailEnv();
  if (!env) {
    cached = null;
    return cached;
  }
  cached = env.provider === 'ses' ? sesProvider : resendProvider;
  return cached;
}

/**
 * Default From address derived from env. Centralizing this here keeps
 * every callsite consistent and prevents callers from accidentally
 * sending under the wrong domain (which would fail DKIM/SPF anyway).
 */
export function getDefaultFromAddress(): EmailAddress | null {
  const env = getEmailEnv();
  if (!env) return null;
  return { email: env.fromAddress, name: env.fromName };
}

/**
 * Test-only: reset the module-level cache so `vi.mock`-based tests
 * can swap providers between cases. Not exported from a barrel —
 * import via the file path explicitly so production code can't reach it.
 */
export function _resetEmailProviderCacheForTests(): void {
  cached = undefined;
}
