import { OrgSwitcher } from './org-switcher';
import { NotificationsBell } from './notifications-bell';
import { UserMenu } from './user-menu';

/**
 * Top bar — fixed-height chrome above the main content area.
 * Houses the org switcher (placeholder while Canal Contable is deferred),
 * notifications bell (placeholder until Phase 9), and user avatar menu
 * (populated once Supabase Auth lands in Phase 2).
 */
export function TopBar() {
  return (
    <header className="bg-background/80 border-border sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur lg:px-6">
      <OrgSwitcher />
      <div className="flex-1" />
      <NotificationsBell />
      <UserMenu />
    </header>
  );
}
