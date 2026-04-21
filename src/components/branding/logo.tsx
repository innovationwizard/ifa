import type { ComponentProps } from 'react';
import { HandCoins } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LogoVariant = 'full' | 'compact' | 'icon';

interface LogoProps extends Omit<ComponentProps<'span'>, 'children'> {
  /** Lockup variant. Default: `compact`. */
  variant?: LogoVariant;
  /** Size in pixels for the icon. Default scales with variant. */
  iconSize?: number;
  /** Accessible label when the variant has no visible wordmark. */
  ariaLabel?: string;
}

const VARIANT_ICON_SIZE: Record<LogoVariant, number> = {
  full: 28,
  compact: 20,
  icon: 24,
};

/**
 * IFA brand lockup — `HandCoins` from lucide-react (locked in D-2).
 *
 * Color: uses `currentColor`, so set `text-ifa-navy-800` / `text-ifa-white`
 * on the wrapping element. Icon stroke and wordmark inherit the same color.
 */
export function Logo({ variant = 'compact', iconSize, ariaLabel, className, ...rest }: LogoProps) {
  const size = iconSize ?? VARIANT_ICON_SIZE[variant];
  const resolvedAriaLabel = ariaLabel ?? 'Inteligencia Financiera App';

  if (variant === 'icon') {
    return (
      <span
        className={cn('inline-flex items-center justify-center', className)}
        role="img"
        aria-label={resolvedAriaLabel}
        {...rest}
      >
        <HandCoins size={size} strokeWidth={2} aria-hidden="true" />
      </span>
    );
  }

  const wordmark = variant === 'full' ? 'Inteligencia Financiera App' : 'IFA';

  return (
    <span
      className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}
      {...rest}
    >
      <HandCoins size={size} strokeWidth={2} aria-hidden="true" />
      <span>{wordmark}</span>
    </span>
  );
}
