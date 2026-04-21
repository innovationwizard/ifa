'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { NavItem as NavItemConfig } from './nav-config';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface NavItemProps {
  item: NavItemConfig;
}

/**
 * Sidebar nav link. Renders icon + label on wide viewports; icon-only with a
 * tooltip below the `lg` breakpoint. Active state is determined by matching
 * the current pathname as a prefix (so `/transacciones/123` still highlights
 * the Transacciones item).
 */
export function NavItem({ item }: NavItemProps) {
  const pathname = usePathname();
  const t = useTranslations();
  const Icon = item.icon;
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const label = t(item.labelKey);

  const linkClasses = cn(
    'group relative flex items-center gap-3 rounded-ifa-button px-3 py-2 text-sm font-medium transition-colors',
    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
    isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/85',
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={item.href} className={linkClasses} aria-current={isActive ? 'page' : undefined}>
          {isActive ? (
            <span
              className="bg-ifa-teal-500 absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 rounded-r"
              aria-hidden
            />
          ) : null}
          <Icon className="size-5 shrink-0" aria-hidden="true" />
          <span className="hidden truncate lg:inline">{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="lg:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
