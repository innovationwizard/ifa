import { AUTHENTICATED_HOME } from './routes';

/**
 * Type-guard predicate: is `value` a safe relative destination?
 *
 * An attacker-controlled `next` is a classic open-redirect vector
 * (`/ingresar?next=https://evil.example/phish`). These rules together
 * block every bypass vector I know of:
 *   - Must be a string
 *   - Must start with a single `/`
 *   - Must NOT start with `//` (protocol-relative URL like `//evil.com`)
 *   - Must NOT contain `://` (absolute URL)
 *   - Must NOT contain `\\` (Windows-style backslash that some parsers
 *     interpret as a scheme separator)
 */
export function isSafeNext(next: string | null | undefined): next is string {
  if (typeof next !== 'string' || next.length === 0) return false;
  if (!next.startsWith('/')) return false;
  if (next.startsWith('//')) return false;
  if (next.includes('://')) return false;
  if (next.includes('\\')) return false;
  return true;
}

/**
 * Resolve `?next=` to a safe destination with a configurable fallback.
 * Default fallback is `AUTHENTICATED_HOME` (/dashboard) — the login flow
 * default. The email-confirmation callback passes `/bienvenida` instead,
 * which is why the fallback is parameterized.
 */
export function safeNext(
  next: string | null | undefined,
  fallback: string = AUTHENTICATED_HOME,
): string {
  return isSafeNext(next) ? next : fallback;
}
