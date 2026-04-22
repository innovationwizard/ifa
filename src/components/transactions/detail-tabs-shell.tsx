'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface TabDef {
  value: string;
  label: string;
  content: ReactNode;
}

/**
 * Thin client wrapper around shadcn Tabs (S-3.8).
 *
 * Tabs themselves are client-only (Radix state under the hood), but
 * each tab's content is a server-rendered ReactNode passed through as
 * a prop. That lets the page.tsx server component compose Money /
 * formatMoney / getTranslations-bearing JSX directly without sliding
 * everything into `'use client'`.
 */
export function DetailTabsShell({ tabs, defaultValue }: { tabs: TabDef[]; defaultValue: string }) {
  return (
    <Tabs defaultValue={defaultValue} className="w-full">
      <TabsList className="flex flex-wrap">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="pt-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
