export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Inteligencia Financiera App</h1>
      <p className="text-sm">
        MVP en construcción — Fase 0 (Fundación). Consulta{' '}
        <code className="rounded bg-black/5 px-1 py-0.5 font-mono text-xs">
          docs/_IFA_BUILD_PLAN.md
        </code>{' '}
        para el plan completo.
      </p>
    </main>
  );
}
