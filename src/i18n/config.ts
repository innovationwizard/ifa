/**
 * i18n configuration — single source of truth for locale, timezone, and
 * default formatters. The MVP is monolingual (es-GT) per the plan; this
 * module centralizes the configuration so adding a locale later is a
 * structural change rather than a scatter-hunt through the codebase.
 */

export const DEFAULT_LOCALE = 'es-GT' as const;
export const SUPPORTED_LOCALES = ['es-GT'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Guatemala uses CST (UTC-6) year-round with no daylight saving time
 * (scaffolding §12.4). Every date displayed in the app uses this timezone
 * unless the data model explicitly stores a different zone.
 */
export const DEFAULT_TIMEZONE = 'America/Guatemala' as const;

/**
 * Default currency — Guatemalan Quetzal. USD is secondary for common
 * cross-border commerce (scaffolding §12.3) but is opted into per-record.
 */
export const DEFAULT_CURRENCY = 'GTQ' as const;
