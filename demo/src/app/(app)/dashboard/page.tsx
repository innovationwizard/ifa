import { redirect } from 'next/navigation';
import { EmptyDashboard } from '@/components/dashboard/empty-state';
import { FinancialOverview } from '@/components/demo/financial-overview';
import { loadFinancialOverviewData } from '@/components/demo/load-overview-data';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { prismaUnscoped } from '@/lib/db/prisma';

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const transactionCount = await prismaUnscoped.transaction.count({
    where: { profileId: profile.id },
  });

  if (transactionCount === 0) {
    const firstName = profile.displayName.split(/\s+/)[0] ?? profile.displayName;
    return <EmptyDashboard firstName={firstName} />;
  }

  const data = await loadFinancialOverviewData(profile.id);
  const firstName = profile.displayName.split(/\s+/)[0] ?? profile.displayName;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">
          Hola, {firstName}
        </h1>
        <p className="text-ifa-gray-700 text-sm">
          Tu resumen financiero de los últimos 3 meses
        </p>
      </header>
      <FinancialOverview data={data} />
    </div>
  );
}
