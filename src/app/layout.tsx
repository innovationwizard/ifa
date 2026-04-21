import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from '@/i18n/config';
import './globals.css';

/*
 * Fonts loaded via next/font for zero-CLS, self-hosted delivery.
 * - Inter: variable, full weight range — default sans per scaffolding §5.2
 * - JetBrains Mono: for monetary amounts (tabular figures, aligned decimals,
 *   clear 0/O 1/l distinction per scaffolding §7.2). Numeric subset is
 *   enough in theory, but google-fonts doesn't support subsetting by glyph —
 *   we load Latin + numeric code points via the `subsets` option.
 */
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-inter',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

/*
 * Resolve the site's canonical URL in priority order:
 *   1. NEXT_PUBLIC_SITE_URL — explicit override (set in Vercel when a custom domain lands)
 *   2. VERCEL_URL — auto-injected by Vercel for every deployment (no protocol)
 *   3. localhost fallback for local dev
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'IFA — Inteligencia Financiera App',
    template: '%s — IFA',
  },
  description:
    'Automatiza la contabilidad de tu MIPYME guatemalteca integrando FEL y transacciones bancarias.',
  applicationName: 'Inteligencia Financiera App',
  authors: [{ name: 'Artificial Intelligence Developments' }],
  openGraph: {
    type: 'website',
    locale: 'es_GT',
    title: 'Inteligencia Financiera App',
    description:
      'Automatiza la contabilidad de tu MIPYME guatemalteca integrando FEL y transacciones bancarias.',
    siteName: 'Inteligencia Financiera App',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Inteligencia Financiera App',
    description:
      'Automatiza la contabilidad de tu MIPYME guatemalteca integrando FEL y transacciones bancarias.',
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const messages = await getMessages();

  return (
    <html lang={DEFAULT_LOCALE} className={`${inter.variable} ${jetBrainsMono.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider
          locale={DEFAULT_LOCALE}
          timeZone={DEFAULT_TIMEZONE}
          messages={messages}
        >
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
