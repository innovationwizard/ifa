import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadFinancialOverviewData } from '@/components/demo/load-overview-data';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';

function fmtQ(amount: number): string {
  return `Q ${amount.toLocaleString('es-GT', { maximumFractionDigits: 2 })}`;
}

export default async function ContabilidadPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const data = await loadFinancialOverviewData(profile.id);
  const netResult = data.totalIncome - data.totalExpense;
  const monthsCount = data.monthly.length || 1;
  const avgIncome = data.totalIncome / monthsCount;
  const avgExpense = data.totalExpense / monthsCount;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">Contabilidad</h1>
        <p className="text-ifa-gray-700 text-sm">
          Estado de resultados personal — últimos 3 meses
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Estado de resultados</CardTitle>
            <CardDescription>Resumen estilo P&L para uso personal</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-gray-200">
                  <td className="text-ifa-navy-900 py-3 font-semibold uppercase tracking-wide text-xs">
                    Ingresos del periodo
                  </td>
                  <td className="text-ifa-teal-600 py-3 text-right font-bold tabular-nums">
                    {fmtQ(data.totalIncome)}
                  </td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="text-ifa-gray-700 py-2 pl-6">Promedio mensual</td>
                  <td className="text-ifa-gray-700 py-2 text-right tabular-nums">
                    {fmtQ(avgIncome)}
                  </td>
                </tr>

                <tr className="border-b border-gray-200">
                  <td className="text-ifa-navy-900 py-3 font-semibold uppercase tracking-wide text-xs">
                    Gastos del periodo
                  </td>
                  <td className="py-3 text-right font-bold tabular-nums text-red-600">
                    ({fmtQ(data.totalExpense)})
                  </td>
                </tr>
                {data.categories.map((c) => (
                  <tr key={c.category} className="border-b border-gray-100">
                    <td className="text-ifa-gray-700 py-2 pl-6">{c.category}</td>
                    <td className="text-ifa-gray-700 py-2 text-right tabular-nums">
                      ({fmtQ(c.amount)})
                    </td>
                  </tr>
                ))}
                <tr className="border-b border-gray-100">
                  <td className="text-ifa-gray-700 py-2 pl-6">Promedio mensual</td>
                  <td className="text-ifa-gray-700 py-2 text-right tabular-nums">
                    ({fmtQ(avgExpense)})
                  </td>
                </tr>

                <tr className="border-t-2 border-gray-300">
                  <td className="text-ifa-navy-900 py-4 text-base font-bold uppercase tracking-wide">
                    Resultado neto
                  </td>
                  <td
                    className={`py-4 text-right text-lg font-bold tabular-nums ${netResult >= 0 ? 'text-ifa-teal-600' : 'text-red-600'}`}
                  >
                    {fmtQ(netResult)}
                  </td>
                </tr>
                <tr>
                  <td className="text-ifa-gray-700 py-2 italic">Margen de ahorro</td>
                  <td
                    className={`py-2 text-right tabular-nums ${data.savingsRate >= 10 ? 'text-ifa-teal-600' : data.savingsRate >= 0 ? 'text-yellow-600' : 'text-red-600'}`}
                  >
                    {data.savingsRate.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Movimientos registrados</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-ifa-navy-900 text-3xl font-bold tabular-nums">{data.txCount}</p>
              <p className="text-ifa-gray-700 mt-1 text-xs">en los últimos 3 meses</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pagos recurrentes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-ifa-navy-900 text-3xl font-bold tabular-nums">
                {data.recurringCount}
              </p>
              <p className="text-ifa-gray-700 mt-1 text-xs">
                comercios con 3+ visitas en el periodo
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mayor gasto único</CardTitle>
            </CardHeader>
            <CardContent>
              {data.largestExpense ? (
                <>
                  <p className="text-ifa-navy-900 text-2xl font-bold tabular-nums">
                    {fmtQ(data.largestExpense.amount)}
                  </p>
                  <p className="text-ifa-gray-700 mt-1 text-xs">
                    {data.largestExpense.merchantName ?? data.largestExpense.description}
                  </p>
                </>
              ) : (
                <p className="text-ifa-gray-700 text-sm">Sin datos</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
