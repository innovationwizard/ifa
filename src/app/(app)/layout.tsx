import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { SkipLink } from '@/components/shell/skip-link';

/**
 * Authenticated-app shell. Fixed sidebar on the left, sticky top bar,
 * and a scrolling main content area. Auth guard comes in S-2.2 — this
 * layout is presentational for Phase 0.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={150}>
      <SkipLink />
      <div className="bg-background text-foreground flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col pl-16 lg:pl-60">
          <TopBar />
          <main id="main" className="flex-1 px-4 py-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
