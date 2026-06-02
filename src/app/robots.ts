import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env';

/**
 * Phase L7 — robots policy.
 *
 * Allow indexing of public marketing + legal routes. Disallow every
 * authed surface even though the proxy already 302s anonymous
 * requests — defense in depth, and saves crawl budget by not
 * making bots discover the redirect chain.
 *
 * `/api/*` is disallowed too. Most of those are 401-gated for anon
 * traffic, but `/api/stripe/webhook` accepts unauthenticated POSTs
 * (signed by Stripe) and we don't want bots probing it.
 */

export default function robots(): MetadataRoute.Robots {
  const base = publicEnv.siteUrl.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/precios', '/contacto', '/privacidad', '/terminos', '/ingresar'],
        disallow: [
          '/dashboard',
          '/dashboard/',
          '/transacciones',
          '/transacciones/',
          '/configuracion',
          '/configuracion/',
          '/reportes',
          '/reportes/',
          '/contabilidad',
          '/contabilidad/',
          '/inteligencia',
          '/inteligencia/',
          '/logros',
          '/logros/',
          '/ayuda',
          '/bienvenida',
          '/cambiar-a-empresa',
          '/design-system',
          '/api/',
          '/auth/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
