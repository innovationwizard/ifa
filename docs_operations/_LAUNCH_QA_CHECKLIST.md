# IFA — Launch QA checklist (Phase L6)

Manual walkthrough to run against the production deploy before opening signups to friends-and-family beta users. Every flow has a [ ] checkbox; tick as you verify. Anything that breaks gets logged at the bottom under "Blockers found" with the fix tracked in a follow-up commit.

This doc is derived from a code-level audit of every page + flow as of L6 commit. It does NOT replace clicking through the live app — it lists the _specific_ things to verify so you don't have to remember what was supposed to work.

---

## Pre-flight (do once before starting)

- [ ] Production deploy is on the latest `main` (verify the L6 commit sha in Vercel).
- [ ] `pnpm db:push` was run against prod Supabase after the L5 commit (`stripe_event_logs` table exists). Verify with: `SELECT 1 FROM stripe_event_logs LIMIT 1;` in Supabase SQL editor.
- [ ] Stripe live keys are configured in Vercel env (`STRIPE_SECRET_KEY=sk_live_*`, `STRIPE_WEBHOOK_SECRET=whsec_*`, both price ids).
- [ ] Stripe live webhook endpoint is configured + subscribed to the 6 events in [vercel-setup.md §2.6.C](./vercel-setup.md#26c-configure-the-webhook-endpoint).
- [ ] Stripe **Settings → Invoices → Email finalized invoices to customers** is toggled ON.
- [ ] Supabase **Authentication → Emails → SMTP Settings** uses your chosen provider (Resend or SES) per [vercel-setup.md §2.5.E](./vercel-setup.md#25e-wire-supabase-auth-to-use-the-same-provider-custom-smtp).
- [ ] Supabase email templates (Magic Link, Change Email Address, etc.) are customized to tú-register Spanish.
- [ ] You have access to: a real card you're willing to charge $1 to, two test email addresses, and a fresh Google account you don't already use for IFA.

---

## Flow 1 — Anonymous landing → sign in

Pages: `/` (landing stub), `/ingresar`, `/ingresar/revisa-tu-correo`, `/auth/callback`.

- [ ] Visit `/` while signed out — no crash; renders the placeholder title.
- [ ] Visit `/ingresar` — both buttons render (Google + magic link), terms/privacy links go to `/terminos` and `/privacidad`, support link goes to `/contacto`.
- [ ] Click **Continúa con Google** → Google consent screen → returns signed in. Lands on `/bienvenida` (first-time) or `/dashboard` (returning).
- [ ] Sign out (TODO: where is sign-out triggered today? check sidebar / topbar). Visit `/ingresar`, request a magic link with a fresh email. `/ingresar/revisa-tu-correo` renders. Email arrives within 1 min — from the IFA-branded sender, NOT `noreply@supabase.com`. Click link → lands on `/bienvenida`.
- [ ] Test the **deleted** flow: sign in, delete account (Flow 7), come back to `/ingresar?deleted=1` — the goodbye banner renders.

**Known gotchas:**

- The `/auth/callback` route runs `ensureUserAndProfile` which can fail silently if the DB is unreachable. If a sign-in seems to succeed at Supabase but lands on `/ingresar?error=bootstrap_failed`, check the Vercel function logs for the `[auth/callback]` line.
- First sign-in vs returning sign-in: routes by `isFirstSignIn` — true sends to `/bienvenida`, false sends to `/dashboard`. A user who completed onboarding once but had their Profile row soft-deleted is in a weird state — `findManyForUser` excludes deletedAt so they'd land on `/bienvenida`. That's intended.

---

## Flow 2 — Onboarding (first-time user)

Pages: `/bienvenida`.

- [ ] After first sign-in, lands on `/bienvenida`. The displayName prefilled is from Google's profile (full name) or email prefix (magic-link path).
- [ ] Save profile. Land on `/dashboard`. Profile is created in DB with `subscriptionStatus=TRIAL`, `trialEndsAt` 30 days out, `onboardingCompleted=true`.

**Known gotchas:**

- The default Profile type is `INDIVIDUAL`. To test BUSINESS onboarding, walk through `/cambiar-a-empresa` after.

---

## Flow 3 — Dashboard (empty + populated states)

Pages: `/dashboard`, `/dashboard/salud`.

- [ ] Fresh account → dashboard shows the empty-state copy ("aún no tienes movimientos") + import CTA.
- [ ] Import a CSV (Flow 4) → return to dashboard → metrics + recent transactions render. Health Score appears within ~5 seconds (auto-recompute on stale per [ADR-002](./_DECISIONS.md#adr-002--no-vercel-cron-at-all-health-score-auto-recomputes-on-dashboard-visit-when-stale)).
- [ ] Click the Health Score number → lands on `/dashboard/salud` with factor breakdown.

**Known gotchas:**

- Health Score recompute fires `on dashboard visit when stale`. If the score never updates, check the `[health-score recompute]` console log in Vercel for the reason. Common cause: missing categorization on imported transactions.
- The dashboard reads from the tenant-scoped repos; if `withTenant` isn't applied somewhere, the page can throw `TenantContextMissingError`. Look for that in the function logs.

---

## Flow 4 — CSV / PDF import (the heaviest flow)

Pages: `/transacciones/importar`, `<CsvImportWizard>` component.

- [ ] Upload a BAC Credomatic CSV (signature-detected → confidence 1.0). Heuristic catches all columns; AI fallback NOT triggered. Rows preview correctly. Confirm → rows land in DB → wizard shows success summary.
- [ ] Upload a Banco Industrial CSV (signature-detected too).
- [ ] Upload a "weird" CSV from another bank (heuristic confidence < 0.9 → AI fallback fires). Verify the wizard shows the AI banner + per-column reasons.
- [ ] Upload a PDF bank statement. unpdf extracts text; AI extractor identifies rows. Preview is currently empty for PDFs (known limitation deferred post-L2); manually verify that the rows landed by checking `/transacciones`.
- [ ] Upload a non-CSV/PDF file (e.g. `.txt`) — wizard rejects at the file picker.
- [ ] Upload a malformed CSV (e.g. only a header, no rows) — wizard surfaces a clear error.
- [ ] Force a failure (try uploading an empty file or one with no recognizable columns) → the failure alert renders + the new "¿Sospechas que es un problema con tu banco? Escríbenos." link works (goes to `/contacto`).

**Known gotchas:**

- AI fallback uses Claude Haiku via the Anthropic API; if the key is missing or invalid, the wizard surfaces a generic error. Check Vercel function logs for `[ai-detect]` lines.
- The originals are persisted to Supabase storage at `imports/<profileId>/<uuid>.csv`. Confirm uploads are landing by checking the bucket. PDFs from the new ingestion flow are NOT persisted (in-memory only).
- Per the existing L2 carry-over (L2.8.5/L2.9/L2.10), sample collection for harder PDFs is blocked; if a real friends-and-family user's bank isn't supported, that becomes a real backlog item.

---

## Flow 5 — Transactions list, detail, reconciliation

Pages: `/transacciones`, `/transacciones/[id]`, `/transacciones/conciliacion`.

- [ ] After importing, `/transacciones` shows the cursor-paginated feed.
- [ ] Filter by source / date range / merchant — results update.
- [ ] Click a row → `/transacciones/[id]` detail page → all fields render, audit trail renders if there's history.
- [ ] If you have a BUSINESS profile with FEL + TPV data: `/transacciones/conciliacion` shows reconciliable pairs (for INDIVIDUAL this page is mostly empty — expected).
- [ ] The **"Procesar ahora"** button (job-queue drain, [ADR-001](./_DECISIONS.md#adr-001--no-cron-for-job-queue-draining-user-triggered-procesar-ahora-button-instead)) shows up when there are pending categorization jobs; clicking it runs them inline and shows results.

**Known gotchas:**

- The feed uses TanStack Virtual which doesn't memoize cleanly (pre-existing lint warning). Behavior is correct; the warning is fine.

---

## Flow 6 — Reports

Pages: `/reportes`, `/reportes/gastos`, `/reportes/comercios`, `/reportes/flujo`.

- [ ] Hub renders 3 cards linking to the reports.
- [ ] Gastos report (Recharts donut + table). Verify the Spanish percentage formatting.
- [ ] Comercios report (top merchants by spend).
- [ ] Flujo report (in/out per period).

**Known gotchas:**

- Recharts ResponsiveContainer returns width 0 in jsdom (test-only quirk, not user-facing).

---

## Flow 7 — Settings (the L3 surface — every sub-flow)

Pages: `/configuracion`, plus 4 confirm sub-pages and `/configuracion/facturacion`.

### 7.1 Profile (L3.3)

- [ ] Edit displayName / DPI / dateOfBirth. Save → "Guardado" toast → values persist on reload.
- [ ] Try saving with empty displayName → validation error.
- [ ] Try non-digit DPI → validation error.

### 7.2 Account — email change (L3.4 — bank-grade)

- [ ] Submit a new email. Link arrives at the CURRENT email (within ~1 min).
- [ ] Click the link → lands on `/configuracion/confirmar-cambio-correo` → "ready" state with confirm button.
- [ ] Click confirm → Supabase sends confirmation to the NEW email → click that link → email changes.
- [ ] Wait > 60 seconds AFTER clicking the magic link before hitting confirm → blocked state "fresh sign-in required".
- [ ] Wait > 15 minutes after starting → blocked state "pending change expired".

### 7.3 Sign-in methods (L3.5)

- [ ] Magic-link row shows "Activo" with the user's current email interpolated.
- [ ] Google row shows "Conectado" or "No conectado" correctly based on `user.identities`.

### 7.4 Connect Google (L3.5.5)

- [ ] When Google not linked: click **Conectar Google** → magic link arrives → click → confirm page → click "Conectar con Google" → Google consent → returns to `/configuracion?linked=google` with success banner; Google row now "Conectado".
- [ ] Already-linked edge case: click Conectar after linking — should refuse with `already_linked` (verify in the UI).

### 7.5 Disconnect Google (L3.5.6)

- [ ] When Google linked AND user has another identity: click **Desconectar Google** → magic link → confirm page → "Desconectar Google" → returns to `/configuracion?unlinked=google` with banner; Google row now "No conectado".
- [ ] **Last-identity guard:** if Google is the user's only identity, disconnect is NOT offered (no button); the "lastIdentityHint" copy appears instead. To test: create a Google-only account, never use magic-link OTP, try to disconnect Google. The confirm page should also refuse if reached directly (gate state `last_identity`).

### 7.6 Billing (L5)

- [ ] BillingCard on `/configuracion` shows current state ("Te quedan N días de prueba", "Plan activo", etc.).
- [ ] Click "Ver detalles de facturación" → `/configuracion/facturacion`.
- [ ] TRIAL state shows "Suscribirme" → click → Stripe Checkout opens → pay $1 with real card → returns to `/dashboard?checkout=success` → BillingCard now reads "Plan activo".
- [ ] After subscribing: facturacion page shows "Gestionar pago" → click → Stripe portal opens → can update card, cancel.
- [ ] Cancel in the portal → return to app → BillingCard shows "Cancelaste tu suscripción. Sigues con acceso por N días."
- [ ] Receipt email arrives from Stripe (NOT from us — L4 doesn't fire a callsite yet).
- [ ] Verify webhook delivered in Stripe dashboard → Developers → Events. Look for `checkout.session.completed` with a 200 response from our endpoint.
- [ ] Verify the `stripe_event_logs` table has the event id: `SELECT * FROM stripe_event_logs ORDER BY processed_at DESC LIMIT 5;`

### 7.7 Data export (L3.6)

- [ ] Click **Descargar mis datos (ZIP)** → fetch spinner → browser downloads `ifa-export-YYYY-MM-DD.zip`.
- [ ] Open the ZIP. Verify these files exist: `user.json`, `profile.json`, `profile-members.json`, `transactions.json`, `transactions.csv`, `health-scores.json`, `README.txt`, and `originals/*.csv` for every file uploaded via the legacy import flow.
- [ ] Open `transactions.csv` in Excel — Spanish accents render correctly (BOM is working).

### 7.8 Account deletion (L3.7)

- [ ] **WARNING**: this destroys data. Use a throwaway account.
- [ ] Click **Empezar** in the Eliminar section → magic link → confirm page.
- [ ] Try submitting with a wrong phrase (lowercase, partial, typo) → button disabled OR server returns `phrase_mismatch`.
- [ ] Type "ELIMINAR MI CUENTA" exactly → button enables → click → redirected to `/ingresar?deleted=1` with goodbye banner.
- [ ] Try signing in again with the same email → Supabase refuses (banned for ~100 years).
- [ ] Check DB: `Profile.deletedAt` is set; `ProfileMember.deletedAt` is set.

---

## Flow 8 — Legal + support (L6)

- [ ] `/privacidad` renders the full USTED-register privacy notice. Last-updated date is current. All processor sections (Supabase, Vercel, Stripe, Resend/SES, Anthropic, Google) are present.
- [ ] `/terminos` renders the full USTED-register terms. Pricing section reads $1 / $20 USD. Cancellation/refund sections are present.
- [ ] `/contacto` renders the founder email + response-time copy. Email link `mailto:` works.
- [ ] Cross-links between the three pages all work (each footer-ish line at the bottom of each page links to the other two).
- [ ] The import-wizard failure alert's "¿Sospechas que es un problema con tu banco? Escríbenos." link goes to `/contacto`.
- [ ] `/ingresar` footer copy now includes the support link.

---

## Flow 9 — Hard-gate behavior (paywall — synthetic test)

This one requires fast-forwarding a profile's `trialEndsAt` to test. Easiest way: in Supabase SQL editor, run:

```sql
UPDATE profiles
SET trial_ends_at = NOW() - INTERVAL '40 days'
WHERE id = '<your-profile-id>';
```

- [ ] Refresh app → soft-gate banner renders at the top of `(app)` pages with N days remaining.
- [ ] Fast-forward further (`'70 days'`) → on next page load you should be redirected to `/precios?gate=hard`.
- [ ] Subscribe via `/precios` → returns to app → access restored.
- [ ] **Restore** the profile to TRIAL state after testing: `UPDATE profiles SET trial_ends_at = NOW() + INTERVAL '30 days', subscription_status = 'TRIAL' WHERE id = '<id>';`

---

## Blockers found

Add a line per blocker discovered. Format:

```
- [ ] **Flow N.x** — short description — link to the issue or follow-up commit.
```

(Empty until the founder walks through.)

---

## Post-walkthrough cleanup

- [ ] Remove any test accounts created during the walkthrough (use the deletion flow + verify Stripe also has the customer canceled).
- [ ] Refund the $1 test charge if you used a real card (Stripe dashboard → Customers → click your customer → refund the most recent invoice).
- [ ] Confirm `stripe_event_logs` has no orphaned event ids from test deliveries (purely cosmetic; the table is harmless to leave growing).
