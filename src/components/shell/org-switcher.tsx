'use client';

import { useTranslations } from 'next-intl';
import { ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Org switcher — visual placeholder during Phase 0. Canal Contable
 * (multi-entity) is deferred per locked H; this trigger renders the
 * active organization and tells the user multi-entity is coming.
 */
export function OrgSwitcher() {
  const t = useTranslations('shell');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-ifa-button h-9 gap-2"
          aria-label={t('topbar.orgSwitcherLabel')}
          disabled
        >
          <span className="text-sm font-medium">{t('placeholders.currentOrg')}</span>
          <ChevronsUpDown className="size-4 opacity-60" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('topbar.orgSwitcherHint')}</TooltipContent>
    </Tooltip>
  );
}
