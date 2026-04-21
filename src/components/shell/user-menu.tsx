'use client';

import { useTranslations } from 'next-intl';
import { LogOut, Settings as SettingsIcon, User as UserIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

/**
 * User avatar menu — placeholder during Phase 0. Supabase Auth wiring
 * (Phase 2) will populate the user's name, email, avatar, and make the
 * "Cerrar sesión" action functional.
 */
export function UserMenu() {
  const t = useTranslations('shell.topbar');
  const common = useTranslations('common.buttons');
  const placeholders = useTranslations('shell.placeholders');
  const nav = useTranslations('nav');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('userMenuLabel')}
          className="size-9 rounded-full"
        >
          <Avatar className="size-9">
            <AvatarFallback>{placeholders('userInitials')}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t('account')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <UserIcon className="size-4" aria-hidden />
          <span>{t('profile')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <SettingsIcon className="size-4" aria-hidden />
          <span>{nav('settings')}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <LogOut className="size-4" aria-hidden />
          <span>{nav('logout')}</span>
          <span className="text-muted-foreground ml-auto text-xs">
            {common('close').toLowerCase() === 'cerrar'
              ? placeholders('pageComingSoon')
              : placeholders('pageComingSoon')}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
