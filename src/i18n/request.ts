import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from './config';

/**
 * next-intl request configuration.
 * Monolingual MVP: always es-GT, always America/Guatemala timezone.
 * No middleware-based locale routing — URLs have no locale segment.
 */
export default getRequestConfig(async () => {
  const messages = (await import('../messages/es-GT.json')).default;

  return {
    locale: DEFAULT_LOCALE,
    timeZone: DEFAULT_TIMEZONE,
    messages,
  };
});
