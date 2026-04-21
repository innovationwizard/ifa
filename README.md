# Inteligencia Financiera App (IFA)

> La solución integral de automatización contable para las MIPYME guatemaltecas: integra datos FEL y transacciones bancarias para conciliación automática, contabilidad en tiempo real e inteligencia financiera.

**Abbreviation:** IFA
**Market:** Guatemala (beachhead) → Central America → Latin America
**Language:** Spanish (`es-GT`)
**Owner:** Artificial Intelligence Developments

---

## Current status

- **Phase:** 0 — Foundation
- **Story in progress:** S-0.1 (Initialize repository)
- **Version:** pre-alpha (no deployable build yet)

See the full MVP build plan in [`docs/_IFA_BUILD_PLAN.md`](docs/_IFA_BUILD_PLAN.md).

---

## Genesis documents

The canonical sources of truth for this project are in [`docs_genesis/`](docs_genesis/):

| Document                                                                                                  | Purpose                                                        |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [`_THE_RULES.MD`](docs_genesis/_THE_RULES.MD)                                                             | Non-negotiable operating constitution                          |
| [`_IFA_SCAFFOLDING.md`](docs_genesis/_IFA_SCAFFOLDING.md)                                                 | Production architecture, modules, data model                   |
| [`_IFA_DEFINITIONS_AND_REASONING.md`](docs_genesis/_IFA_DEFINITIONS_AND_REASONING.md)                     | Domain glossary, design rationale, why every decision was made |
| [`0_Inteligencia-Financiera-App-Guatemala.pdf`](docs_genesis/0_Inteligencia-Financiera-App-Guatemala.pdf) | Business case and market thesis                                |
| [`1_benchmark_intuit.md`](docs_genesis/1_benchmark_intuit.md)                                             | Credit Karma (Intuit) user-experience reference                |
| [`2_benchmark_duolingo.md`](docs_genesis/2_benchmark_duolingo.md)                                         | Duolingo gamification reference                                |

The MVP plan derived from these sources lives at [`docs/_IFA_BUILD_PLAN.md`](docs/_IFA_BUILD_PLAN.md).

---

## Tech stack (MVP)

- **Framework:** Next.js 16 (App Router, Server Components)
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Database / Auth / Storage:** Supabase (single `ifa` project, `main` = production)
- **ORM:** Prisma 6
- **AI:** Anthropic Claude API (TypeScript SDK)
- **Hosting:** Vercel
- **i18n:** next-intl (`es-GT` only for MVP)
- **State:** Zustand + TanStack Query
- **Charts:** Recharts
- **Testing:** Vitest (unit), Playwright (E2E)

Full architectural context (including deltas from the scaffolding) is in [`docs/_IFA_BUILD_PLAN.md`](docs/_IFA_BUILD_PLAN.md) §2.

---

## Development

_Setup instructions will be added as Phase 0 stories land. Until then, this repository contains documentation only._

---

## License

Proprietary — © Artificial Intelligence Developments. All rights reserved.
