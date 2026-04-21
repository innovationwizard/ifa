'use client';

import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

/**
 * Notifications bell — placeholder during Phase 0. Once the notifications
 * system ships (Phase 9), the trigger will carry an unread badge and the
 * menu will render the latest N items.
 */
export function NotificationsBell() {
  const t = useTranslations('shell.topbar');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('notificationsLabel')}
          className="size-9"
        >
          <Bell className="size-5" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t('notificationsLabel')}</DropdownMenuLabel>
        <DropdownMenuItem disabled>{t('noNotifications')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
