import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

/**
 * Phase L7 — sitemap for SEO + crawler hygiene.
 *
 * Only the public routes belong in the sitemap. Authed routes
 * (`/dashboard/*`, `/transacciones/*`, `/configuracion/*`) are
 * proxy-gated, so listing them would just train crawlers to
 * burn requests on 302s.
 *
 * Update this list when a new public route lands. Next 13+'s
 * convention serves the result at `/sitemap.xml`.
 */

const PUBLIC_PATHS = [
  '/', //
  '/precios',
  '/contacto',
  '/privacidad',
  '/terminos',
  '/ingresar',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicEnv.siteUrl.replace(/\/$/, '');
  /*
   * `lastModified` is intentionally NOT set per-URL. Without it,
   * crawlers fall back to their own heuristics (last fetch time,
   * etag, etc.) which is more honest than us claiming "everything
   * just changed" on every deploy.
   *
   * Priority is also omitted; Google explicitly ignores it. Bing
   * + Yandex still honor it for relative ranking — defer until we
   * care about that scale.
   */
  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path === '/' || path === '/precios' ? 'weekly' : 'monthly',
  }));
}
