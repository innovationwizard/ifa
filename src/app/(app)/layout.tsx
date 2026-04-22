import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/top-bar';
import { SkipLink } from '@/components/shell/skip-link';
import { PaywallBanner } from '@/components/billing/paywall-banner';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { computeGateState } from '@/lib/billing/gate';

/**
 * Authenticated-app shell.
 *
 * Three-stage guard on every (app) render:
 *
 *   1. Auth — proxy already redirects anonymous users, but we re-check
 *      here to guard against any race with session refresh.
 *   2. Profile — first-time sign-ins land here before onboarding has
 *      created a Profile row. Those users bounce to `/bienvenida`
 *      (S-2.8). Existing users pass through.
 *   3. Paywall — `computeGateState()` reads the profile's billing
 *      fields. `access` renders normally (banner hidden or showing a
 *      trial countdown near expiry). `soft_gate` renders normally with
 *      a nag banner. `hard_gate` redirects to /precios.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const gateState = computeGateState(profile);
  if (gateState.kind === 'hard_gate') redirect('/precios?gate=hard');

  return (
    <TooltipProvider delayDuration={150}>
      <SkipLink />
      <div className="bg-background text-foreground flex min-h-dvh flex-col">
        <PaywallBanner state={gateState} />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col pl-16 lg:pl-60">
            <TopBar />
            <main id="main" className="flex-1 px-4 py-6 lg:px-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
