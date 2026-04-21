'use client';

import { useTranslations } from 'next-intl';
import { Logo } from '@/components/branding/logo';
import { Separator } from '@/components/ui/separator';
import { NavItem } from './nav-item';
import { PRIMARY_NAV, SECONDARY_NAV } from './nav-config';

/**
 * Fixed left sidebar — navy-800 surface per scaffolding §6.4.
 * On wide viewports (>= lg), shows icon + label; below lg it collapses to
 * icons-only (width 64px) with a tooltip per NavItem.
 */
export function Sidebar() {
  const t = useTranslations();

  return (
    <aside
      aria-label={t('nav.primarySectionLabel')}
      className="bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-30 flex w-16 flex-col border-r border-white/10 lg:w-60"
    >
      <div className="flex h-16 items-center justify-center px-3 lg:justify-start lg:px-5">
        <Logo variant="icon" iconSize={24} className="lg:hidden" />
        <Logo variant="compact" className="hidden text-lg lg:inline-flex" />
      </div>

      <nav
        className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3"
        aria-label={t('nav.primarySectionLabel')}
      >
        <ul className="flex flex-col gap-1">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <NavItem item={item} />
            </li>
          ))}
        </ul>

        <Separator className="my-3 bg-white/10" />

        <ul className="flex flex-col gap-1" aria-label={t('nav.secondarySectionLabel')}>
          {SECONDARY_NAV.map((item) => (
            <li key={item.href}>
              <NavItem item={item} />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
