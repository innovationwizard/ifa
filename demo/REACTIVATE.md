# Demo emergency kit

Everything we shipped during the 2026-05-21 panic-mode client demo, frozen so
it can be re-activated quickly when needed.

**This bundle is demo-grade.** Several pieces are tactical hacks — most
notably a dev-only fall-open in the tenancy extension that bypasses
`AsyncLocalStorage` when it's empty. Production behavior is preserved
(the fall-open is gated on `NODE_ENV !== 'production'`), but do not
ship any of this to prod without a real fix for the Turbopack
module-dual-load that necessitated the workaround.

---

## What's inside

```
demo/
├── REACTIVATE.md           ← this file
├── demo.patch              ← unified diff against HEAD for all modified files
├── prisma/
│   └── seed-demo.ts        ← 40 GT-flavored MANUAL transactions, idempotent
└── src/
    ├── app/(app)/
    │   ├── contabilidad/page.tsx     ← P&L estado-de-resultados layout
    │   ├── dashboard/page.tsx        ← full FinancialOverview (uses prismaUnscoped, lint-restricted)
    │   ├── inteligencia/page.tsx     ← gauge + 5 insight cards
    │   ├── layout.tsx                ← dev-only `globalThis.__ifaDemoProfileId` publish
    │   ├── logros/page.tsx           ← gamification (level, XP, streak, badges)
    │   └── reportes/page.tsx         ← 3 tables (monthly, categorías, comercios)
    ├── components/
    │   ├── demo/
    │   │   ├── financial-overview.tsx  ← Recharts client component (gauge + bars + line + categories)
    │   │   └── load-overview-data.ts   ← server-side aggregator via prismaUnscoped
    │   └── shell/
    │       └── module-placeholder.tsx  ← Construction → Sparkles icon swap (teal)
    └── lib/db/
        ├── tenancy.ts          ← dev-only fall-open using `__ifaDemoProfileId`
        └── tenant-context.ts   ← globalThis-cached AsyncLocalStorage + side-effect publish in withTenant
```

`demo.patch` covers every modified file at once; the `demo/<path>` copies
are the final on-disk state and are easier to diff visually.

---

## To re-activate (when you need the demo again)

1. **Make sure your local dev DB has a User + Profile row.** Sign in to
   the app at least once and complete `/bienvenida`. The seed script
   looks up your user by email (`DEMO_USER_EMAIL` constant in
   `seed-demo.ts`).

2. **Install Recharts** — the only runtime dep the demo added:

   ```
   pnpm add recharts
   ```

3. **Drop the demo files back into the tree.** Either:

   a) Copy the snapshot over the source tree:
      ```
      cp -R demo/prisma demo/src ./
      ```

   b) **Or** apply the unified patch (only for the modified files —
      the new files at `demo/prisma/seed-demo.ts` and
      `demo/src/components/demo/*` still need to be copied):
      ```
      git apply demo/demo.patch
      cp demo/prisma/seed-demo.ts prisma/
      cp -R demo/src/components/demo src/components/
      ```

4. **Seed the demo transactions:**

   ```
   pnpm dotenv -e .env.local -- tsx prisma/seed-demo.ts
   ```

   Expected output: `[demo-seed] done. Upserted 40 transactions on profile <uuid>.`
   Idempotent — safe to re-run.

5. **Start dev:** `pnpm dev` → http://localhost:3000.

---

## To de-activate after the demo

Reverse step 3 — restore the affected files from HEAD and remove the new ones:

```
git checkout HEAD -- \
  package.json \
  pnpm-lock.yaml \
  "src/app/(app)/contabilidad/page.tsx" \
  "src/app/(app)/dashboard/page.tsx" \
  "src/app/(app)/inteligencia/page.tsx" \
  "src/app/(app)/layout.tsx" \
  "src/app/(app)/logros/page.tsx" \
  "src/app/(app)/reportes/page.tsx" \
  src/components/shell/module-placeholder.tsx \
  src/lib/db/tenancy.ts \
  src/lib/db/tenant-context.ts

rm -f prisma/seed-demo.ts
rm -rf src/components/demo

pnpm install  # drops recharts from node_modules
```

The seeded transactions remain in the dev DB. To clean them up:

```sql
DELETE FROM transactions
WHERE source = 'MANUAL'
  AND metadata->>'seededBy' = 'demo-seed';
```

---

## Known issues to fix before any of this merges to main

1. **`src/app/(app)/dashboard/page.tsx`** imports
   `@/lib/db/prisma`, which is restricted by ESLint outside
   `src/lib/db/**`. Lint will fail. The proper fix is to use
   `transactionRepo.count()` inside `withTenant` — but that depends on
   the AsyncLocalStorage bug below being fixed.

2. **Tenancy extension fall-open** (`src/lib/db/tenancy.ts`) is
   gated on `NODE_ENV !== 'production'` but it's still a real change
   to a security-critical file. Root-cause and remove before merging.

3. **`withTenant` side-effect** (`src/lib/db/tenant-context.ts`)
   writes to `globalThis.__ifaDemoProfileId` on every call in dev. Also
   gated on NODE_ENV but worth removing once the underlying ALS bug is
   fixed.

4. **Turbopack module-dual-load**: the `withTenant`'s
   `AsyncLocalStorage.run()` lands in a different module instance than
   the tenancy extension's `getStore()`, so the store appears empty
   inside the wrapped callback. Repro: any tenant-scoped page in dev
   would throw `TenantContextMissingError`. We worked around it; the
   underlying cause is unknown.

5. **No tests added.** All five demo pages, the FinancialOverview,
   the data loader, and the seed script have zero coverage.
