import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { loadFinancialOverviewData } from '@/components/demo/load-overview-data';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';

function fmtQ(amount: number): string {
  return `Q ${amount.toLocaleString('es-GT', { maximumFractionDigits: 2 })}`;
}

export default async function ReportesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');

  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const data = await loadFinancialOverviewData(profile.id);
  const totalCategorySpend = data.categories.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-ifa-gray-700 text-sm">
          Flujo mensual, categorías y comercios — últimos 3 meses
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Resumen mensual</CardTitle>
            <CardDescription>Ingresos, gastos y flujo neto por mes</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ifa-gray-700 border-b border-gray-200 text-left text-xs uppercase tracking-wide">
                  <th className="py-2">Mes</th>
                  <th className="py-2 text-right">Ingresos</th>
                  <th className="py-2 text-right">Gastos</th>
                  <th className="py-2 text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {data.monthly.map((m) => (
                  <tr key={m.label} className="border-b border-gray-100">
                    <td className="text-ifa-navy-900 py-2 font-medium">{m.label}</td>
                    <td className="py-2 text-right tabular-nums text-ifa-teal-600">
                      {fmtQ(m.income)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-red-600">{fmtQ(m.expense)}</td>
                    <td
                      className={`py-2 text-right font-semibold tabular-nums ${m.net >= 0 ? 'text-ifa-teal-600' : 'text-red-600'}`}
                    >
                      {fmtQ(m.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top categorías</CardTitle>
            <CardDescription>Donde más gastaste</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ifa-gray-700 border-b border-gray-200 text-left text-xs uppercase tracking-wide">
                  <th className="py-2">Categoría</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => {
                  const pct = totalCategorySpend > 0 ? (c.amount / totalCategorySpend) * 100 : 0;
                  return (
                    <tr key={c.category} className="border-b border-gray-100">
                      <td className="text-ifa-navy-900 py-2 font-medium">{c.category}</td>
                      <td className="py-2 text-right tabular-nums">{fmtQ(c.amount)}</td>
                      <td className="text-ifa-gray-700 py-2 text-right tabular-nums">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top comercios</CardTitle>
          <CardDescription>Donde más visitas — útil para optimizar gastos recurrentes</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-ifa-gray-700 border-b border-gray-200 text-left text-xs uppercase tracking-wide">
                <th className="py-2">Comercio</th>
                <th className="py-2 text-right">Visitas</th>
                <th className="py-2 text-right">Total gastado</th>
                <th className="py-2 text-right">Promedio</th>
              </tr>
            </thead>
            <tbody>
              {data.merchants.map((m) => (
                <tr key={m.name} className="border-b border-gray-100">
                  <td className="text-ifa-navy-900 py-2 font-medium">{m.name}</td>
                  <td className="text-ifa-gray-700 py-2 text-right tabular-nums">{m.count}</td>
                  <td className="py-2 text-right tabular-nums">{fmtQ(m.amount)}</td>
                  <td className="text-ifa-gray-700 py-2 text-right tabular-nums">
                    {fmtQ(m.amount / m.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
