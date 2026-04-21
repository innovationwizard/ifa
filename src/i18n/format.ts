import { DEFAULT_LOCALE, DEFAULT_TIMEZONE } from './config';

/**
 * Canonical formatters. Every monetary, numeric, or date display in the app
 * should route through one of these so changes to locale/timezone are
 * trivially testable.
 *
 * Negative amounts are rendered with Latin American accounting convention
 * (parentheses around the value) per scaffolding §12.3.
 */

interface FormatMoneyOptions {
  currency?: string;
  showSign?: boolean;
}

const currencyCache = new Map<string, Intl.NumberFormat>();

function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  const cached = currencyCache.get(currency);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  currencyCache.set(currency, formatter);
  return formatter;
}

export function formatMoney(amount: number, options: FormatMoneyOptions = {}): string {
  const currency = options.currency ?? 'GTQ';
  const formatter = getCurrencyFormatter(currency);
  if (amount < 0) {
    return `(${formatter.format(Math.abs(amount))})`;
  }
  if (options.showSign && amount > 0) {
    return `+${formatter.format(amount)}`;
  }
  return formatter.format(amount);
}

const dateShortFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  timeZone: DEFAULT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const dateLongFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  timeZone: DEFAULT_TIMEZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  timeZone: DEFAULT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDateShort(date: Date): string {
  return dateShortFormatter.format(date);
}

export function formatDateLong(date: Date): string {
  return dateLongFormatter.format(date);
}

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

const numberFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

const percentFormatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}
