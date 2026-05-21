import { redirect } from 'next/navigation';
import { Award, Flame, Trophy, Target, Zap, ShieldCheck, TrendingUp, Coins } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadFinancialOverviewData } from '@/components/demo/load-overview-data';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';

function fmtQ(amount: number): string {
  return `Q ${amount.toLocaleString('es-GT', { maximumFractionDigits: 0 })}`;
}

export default async function LogrosPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const data = await loadFinancialOverviewData(profile.id);

  /*
   * Demo gamification math — derived from real data:
   *   XP = txCount × 50 + healthScore (so users see XP move with both
   *        engagement and outcomes)
   *   Level = floor(XP / 500) + 1, capped at 20
   *   Streak = number of consecutive months with positive net flow
   */
  const xp = data.txCount * 50 + data.healthScore;
  const level = Math.min(20, Math.floor(xp / 500) + 1);
  const xpInLevel = xp % 500;
  const streak = data.monthly.filter((m) => m.net >= 0).length;

  const badges: { icon: React.ReactNode; name: string; description: string; earned: boolean }[] = [
    {
      icon: <Zap className="size-6 text-amber-500" aria-hidden />,
      name: 'Primera carga',
      description: 'Importaste tu primer estado de cuenta',
      earned: data.txCount > 0,
    },
    {
      icon: <Trophy className="size-6 text-yellow-500" aria-hidden />,
      name: 'Movimientos +30',
      description: 'Has registrado 30 o más movimientos',
      earned: data.txCount >= 30,
    },
    {
      icon: <ShieldCheck className="text-ifa-teal-600 size-6" aria-hidden />,
      name: 'Ahorrador',
      description: 'Tu tasa de ahorro está sobre 10%',
      earned: data.savingsRate >= 10,
    },
    {
      icon: <TrendingUp className="size-6 text-blue-500" aria-hidden />,
      name: 'Excelencia',
      description: 'Tu puntaje IFA está sobre 800',
      earned: data.healthScore >= 800,
    },
    {
      icon: <Flame className="size-6 text-orange-500" aria-hidden />,
      name: 'Racha de 3',
      description: '3 meses seguidos con flujo neto positivo',
      earned: streak >= 3,
    },
    {
      icon: <Coins className="text-ifa-navy-900 size-6" aria-hidden />,
      name: 'Detector',
      description: 'Identificamos 3+ pagos recurrentes en tu cuenta',
      earned: data.recurringCount >= 3,
    },
  ];

  const earnedCount = badges.filter((b) => b.earned).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">Logros</h1>
        <p className="text-ifa-gray-700 text-sm">
          Hábitos financieros saludables — gana XP y desbloquea insignias
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-ifa-navy-900 to-ifa-navy-700 text-white">
          <CardHeader>
            <CardDescription className="text-white/80">Nivel actual</CardDescription>
            <CardTitle className="text-4xl">{level}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-white/80">{xpInLevel} / 500 XP al siguiente nivel</p>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="bg-ifa-teal-500 h-full rounded-full transition-all"
                  style={{ width: `${(xpInLevel / 500) * 100}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>XP total</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <Zap className="text-ifa-gold-500 size-7" aria-hidden />
              {xp.toLocaleString('es-GT')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-ifa-gray-700 text-xs">Acumulada por tu actividad</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Racha activa</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <Flame className="size-7 text-orange-500" aria-hidden />
              {streak} {streak === 1 ? 'mes' : 'meses'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-ifa-gray-700 text-xs">Con flujo neto positivo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Insignias</CardDescription>
            <CardTitle className="flex items-center gap-2 text-3xl">
              <Award className="text-ifa-teal-600 size-7" aria-hidden />
              {earnedCount} / {badges.length}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-ifa-gray-700 text-xs">Desbloqueadas hasta ahora</p>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-ifa-navy-900 text-lg font-semibold">Tus insignias</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((badge) => (
            <Card
              key={badge.name}
              className={badge.earned ? 'border-ifa-teal-500 border-2' : 'opacity-50'}
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-base">
                  {badge.icon}
                  <span>{badge.name}</span>
                  {badge.earned && (
                    <span className="bg-ifa-teal-500 ml-auto rounded-full px-2 py-0.5 text-xs font-medium text-white">
                      Lograda
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{badge.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="text-ifa-navy-900 size-5" aria-hidden />
            Próxima misión
          </CardTitle>
          <CardDescription>
            Alcanza una tasa de ahorro de al menos 15% este mes para ganar 200 XP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-ifa-gray-700 text-sm">
            Tu tasa actual es <strong>{data.savingsRate.toFixed(1)}%</strong>. Reduce gastos en tu
            categoría más alta (
            {data.categories[0]?.category ?? '—'},{' '}
            {fmtQ(data.categories[0]?.amount ?? 0)}) para acercarte.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
