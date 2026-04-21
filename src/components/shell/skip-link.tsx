'use client';

import { useTranslations } from 'next-intl';

/**
 * Keyboard-only "skip to main content" link — invisible until focused.
 * Required for WCAG 2.4.1 "Bypass Blocks" compliance; a screen-reader or
 * keyboard user can jump past the sidebar directly into `#main`.
 */
export function SkipLink() {
  const t = useTranslations('nav');
  return (
    <a
      href="#main"
      className="bg-ifa-navy-800 text-ifa-white focus-visible:ring-ifa-teal-500 focus:rounded-ifa-button sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus-visible:ring-2"
    >
      {t('skipToContent')}
    </a>
  );
}
