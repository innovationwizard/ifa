import { redirect } from 'next/navigation';
import { Lightbulb, TrendingDown, TrendingUp, Target, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FinancialOverview } from '@/components/demo/financial-overview';
import { loadFinancialOverviewData } from '@/components/demo/load-overview-data';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';

function fmtQ(amount: number): string {
  return `Q ${amount.toLocaleString('es-GT', { maximumFractionDigits: 0 })}`;
}

export default async function InteligenciaPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const data = await loadFinancialOverviewData(profile.id);

  const insights: { icon: React.ReactNode; title: string; body: string; tone: string }[] = [];

  if (data.savingsRate >= 10) {
    insights.push({
      icon: <TrendingUp className="text-ifa-teal-600 size-5" aria-hidden />,
      title: 'Estás ahorrando bien',
      body: `Tu tasa de ahorro de los últimos 3 meses es ${data.savingsRate.toFixed(1)}%. Sigue así — la meta saludable es 20%.`,
      tone: 'border-l-4 border-ifa-teal-500',
    });
  } else if (data.savingsRate >= 0) {
    insights.push({
      icon: <AlertTriangle className="size-5 text-yellow-600" aria-hidden />,
      title: 'Tu ahorro es muy bajo',
      body: `Solo estás ahorrando ${data.savingsRate.toFixed(1)}% de tus ingresos. Una emergencia podría desbalancearte. Apunta a ahorrar al menos 10%.`,
      tone: 'border-l-4 border-yellow-500',
    });
  } else {
    insights.push({
      icon: <TrendingDown className="size-5 text-red-600" aria-hidden />,
      title: 'Estás gastando más de lo que ganas',
      body: `Tu flujo neto es negativo (${data.savingsRate.toFixed(1)}%). Identifica una categoría de gasto que puedas reducir este mes.`,
      tone: 'border-l-4 border-red-500',
    });
  }

  const topCategory = data.categories[0];
  if (topCategory) {
    const pct = data.totalExpense > 0 ? (topCategory.amount / data.totalExpense) * 100 : 0;
    insights.push({
      icon: <Target className="text-ifa-navy-900 size-5" aria-hidden />,
      title: `Tu mayor gasto: ${topCategory.category}`,
      body: `Has gastado ${fmtQ(topCategory.amount)} en ${topCategory.category} (${pct.toFixed(0)}% de tus gastos). ¿Hay margen para reducir aquí?`,
      tone: 'border-l-4 border-ifa-navy-700',
    });
  }

  if (data.recurringCount > 0) {
    insights.push({
      icon: <Lightbulb className="size-5 text-amber-500" aria-hidden />,
      title: `${String(data.recurringCount)} comercios recurrentes detectados`,
      body: `Identificamos ${String(data.recurringCount)} lugares donde compras frecuentemente. Suscripciones y pagos fijos son los más fáciles de optimizar.`,
      tone: 'border-l-4 border-amber-400',
    });
  }

  insights.push({
    icon: <TrendingUp className="size-5 text-blue-600" aria-hidden />,
    title: 'Proyección del próximo mes',
    body: `Si mantienes el ritmo actual, gastarás aproximadamente ${fmtQ(data.predictedNextMonthExpense)} el próximo mes.`,
    tone: 'border-l-4 border-blue-500',
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">Inteligencia</h1>
        <p className="text-ifa-gray-700 text-sm">
          Tu salud financiera analizada y observaciones personalizadas
        </p>
      </header>

      <FinancialOverview data={data} show={{ score: true, stats: false, monthly: false, trend: false, categories: false }} />

      <section className="flex flex-col gap-4">
        <h2 className="text-ifa-navy-900 text-lg font-semibold">Observaciones para ti</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {insights.map((insight, i) => (
            <Card key={i} className={`${insight.tone}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {insight.icon}
                  {insight.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{insight.body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
