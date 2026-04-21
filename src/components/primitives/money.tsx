import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/i18n/format';

interface MoneyProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The amount to display, as a plain number (not cents). */
  amount: number;
  /** ISO-4217 currency code. Default: GTQ. */
  currency?: string;
  /** Prefix positive amounts with `+`. Useful for deltas. */
  showSign?: boolean;
}

/**
 * Render a monetary amount with tabular figures and locale-aware formatting.
 * Negative values use Latin-American accounting convention: parentheses
 * around the value (scaffolding §12.3).
 *
 * Uses JetBrains Mono so decimal points align in columns (scaffolding §7.2).
 */
export function Money({ amount, currency = 'GTQ', showSign, className, ...rest }: MoneyProps) {
  return (
    <span
      className={cn('font-mono whitespace-nowrap tabular-nums', className)}
      data-negative={amount < 0 ? 'true' : undefined}
      {...rest}
    >
      {formatMoney(amount, { currency, showSign: showSign ?? false })}
    </span>
  );
}
