import { redirect } from 'next/navigation';
import { EmptyDashboard } from '@/components/dashboard/empty-state';
import { ModulePlaceholder } from '@/components/shell/module-placeholder';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo, transactionRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';

/**
 * Dashboard.
 *
 * Zero-transaction branch renders the empty state (S-2.9), which
 * leads the user to upload their first bank statement per the
 * Phase-A ingestion pipeline (scaffolding §10.4.1).
 *
 * Non-zero branch currently falls through to the module placeholder
 * — the real widgets (Financial Health Score gauge, recent activity,
 * insights feed) land in later stories. Until then, having any
 * transactions simply means "past the onboarding cliff"; the content
 * isn't the point of this story.
 *
 * Note: (app)/layout already looked up user + profile, but passing
 * them through to nested pages would require context plumbing. A
 * re-fetch here is one cheap query; revisit with React cache() when
 * more (app) pages start repeating this pattern.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const transactionCount = await withTenant({ profileId: profile.id, userId: user.id }, () =>
    transactionRepo.count(),
  );

  if (transactionCount === 0) {
    const firstName = profile.displayName.split(/\s+/)[0] ?? profile.displayName;
    return <EmptyDashboard firstName={firstName} />;
  }

  return (
    <ModulePlaceholder titleKey="nav.dashboard" descriptionKey="modulePlaceholders.dashboard" />
  );
}
