import { AUTHENTICATED_HOME } from './routes';

/**
 * Sanitize the `?next=` redirect param.
 *
 * The login flow preserves where the user was headed before being
 * bounced to `/ingresar`. An attacker-controlled `next` is a classic
 * open-redirect vector: `/ingresar?next=https://evil.example/phish`
 * would send the user off the site post-login if we didn't guard it.
 *
 * Rules:
 *   - Must be a string
 *   - Must start with a single `/`
 *   - Must NOT start with `//` (protocol-relative URL like `//evil.com`)
 *   - Must NOT contain `://` (absolute URL)
 *   - Must NOT contain `\\` (Windows-style backslash that some parsers
 *     interpret as a scheme separator)
 *
 * Anything else resolves to the authenticated home (/dashboard).
 */
export function safeNext(next: string | null | undefined): string {
  if (typeof next !== 'string' || next.length === 0) return AUTHENTICATED_HOME;
  if (!next.startsWith('/')) return AUTHENTICATED_HOME;
  if (next.startsWith('//')) return AUTHENTICATED_HOME;
  if (next.includes('://')) return AUTHENTICATED_HOME;
  if (next.includes('\\')) return AUTHENTICATED_HOME;
  return next;
}
