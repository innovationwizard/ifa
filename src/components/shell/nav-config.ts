import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  BookOpen,
  FileBarChart,
  HelpCircle,
  LayoutDashboard,
  Settings,
  Sparkles,
  Trophy,
} from 'lucide-react';

/**
 * Shell navigation — single source of truth.
 * `labelKey` resolves through next-intl against src/messages/es-GT.json.
 * Adding a new module means adding one entry here + one translation key +
 * one route folder under src/app/(app)/.
 */
export interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  descriptionKey?: string;
}

export const PRIMARY_NAV: NavItem[] = [
  {
    href: '/dashboard',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    descriptionKey: 'modulePlaceholders.dashboard',
  },
  {
    href: '/transacciones',
    labelKey: 'nav.transactions',
    icon: ArrowLeftRight,
    descriptionKey: 'modulePlaceholders.transactions',
  },
  {
    href: '/contabilidad',
    labelKey: 'nav.accounting',
    icon: BookOpen,
    descriptionKey: 'modulePlaceholders.accounting',
  },
  {
    href: '/reportes',
    labelKey: 'nav.reports',
    icon: FileBarChart,
    descriptionKey: 'modulePlaceholders.reports',
  },
  {
    href: '/inteligencia',
    labelKey: 'nav.intelligence',
    icon: Sparkles,
    descriptionKey: 'modulePlaceholders.intelligence',
  },
  {
    href: '/logros',
    labelKey: 'nav.achievements',
    icon: Trophy,
    descriptionKey: 'modulePlaceholders.achievements',
  },
];

export const SECONDARY_NAV: NavItem[] = [
  {
    href: '/configuracion',
    labelKey: 'nav.settings',
    icon: Settings,
    descriptionKey: 'modulePlaceholders.settings',
  },
  {
    href: '/ayuda',
    labelKey: 'nav.help',
    icon: HelpCircle,
  },
];

export const ALL_NAV: readonly NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];
