# IFA — Launch checklist (Phase L7)

The operational gate before sending the first beta invite. Tick every item; record the verification outcome inline. Anything that fails goes into "Blockers" at the bottom and the launch waits.

**Companion doc:** [\_LAUNCH_QA_CHECKLIST.md](./_LAUNCH_QA_CHECKLIST.md) is the app-flow walkthrough. Run THAT first to confirm the product works, then come here to confirm the platform around it is ready.

---

## 1. Stripe — LIVE mode end-to-end

- [ ] Live keys in Vercel production env (`STRIPE_SECRET_KEY=sk_live_*`, `STRIPE_WEBHOOK_SECRET=whsec_*`, both price ids).
- [ ] Live webhook endpoint registered and receiving events (Stripe → Developers → Events shows a recent successful `200` from `/api/stripe/webhook`).
- [ ] **Real $1 charge:** founder signs up with a real card, fast-forwards trial in Stripe (Customers → click yourself → Subscriptions → "Update subscription" → set trial-end to today), waits for the auto-renewal, sees the charge land. Outcome: \_\_\_\_
- [ ] Receipt email arrives in inbox (NOT spam). From: matches `EMAIL_FROM_ADDRESS`. Outcome: \_\_\_\_
- [ ] `select count(*) from stripe_event_logs;` returns ≥ 1 row (proves the webhook idempotency layer wrote at least one entry).

---

## 2. Email — production sending domain

- [ ] DNS records (SPF, DKIM, DMARC) for `EMAIL_FROM_ADDRESS`'s domain are verified at the provider (Resend dashboard shows "Verified", or AWS SES verified identities shows the domain with DKIM enabled).
- [ ] Magic-link email arrives in Gmail inbox (NOT spam folder) for a brand-new test address. Outcome: \_\_\_\_
- [ ] "Show original" in Gmail: DMARC = PASS, DKIM = PASS, SPF = PASS. Anything else means a DNS record is wrong.
- [ ] Supabase dashboard → Authentication → Emails → SMTP Settings → "Verified" status (use Supabase's built-in test-send button).

---

## 3. Supabase — backups + RLS

- [ ] **Backups on.** Supabase dashboard → Database → Backups → confirm point-in-time recovery (PITR) is enabled (Pro plan) OR daily backups are running (Free plan — note the limitation in your head).
- [ ] Most recent backup is < 24h old.
- [ ] **RLS verification.** A select on `profiles` from a non-service-role client returns only the rows the caller owns. Test in the Supabase SQL editor under "Run as: authenticated".
- [ ] **`Allow manual linking`** is still ON (Auth → Sign In / Providers, per the L3.5.5 founder action 2026-06-02). If a future Supabase config-restore accidentally flipped it off, L3.5.5/L3.5.6 are broken.

---

## 4. Vercel — production deploy posture

- [ ] Production deploy is on a commit that includes L7 (the latest `main`).
- [ ] `vercel.json` has no `crons` array (per [ADR-002](./_DECISIONS.md#adr-002--no-vercel-cron-at-all-health-score-auto-recomputes-on-dashboard-visit-when-stale)).
- [ ] All required env vars are set in production scope (cross-reference [vercel-setup.md](./vercel-setup.md) — every variable listed there should have a non-empty value).
- [ ] Function logs (Vercel → Functions → Logs) show no recurring errors during a quiet window. A few `[email] skipped — no provider configured` lines are fine if you haven't configured email; everything else should be 200s.

---

## 5. Domain decision

Pick ONE and record it:

- [ ] **Subdomain:** keep `<project>.vercel.app` for the beta. Reason: zero DNS work; we're a closed-invite beta and don't need brand polish yet. Custom domain deferred to post-launch.
- [ ] **Custom domain:** `<domain>` purchased + DNS pointed at Vercel + SSL provisioned + `NEXT_PUBLIC_SITE_URL` updated to match. Verify the domain renders without a cert warning.

Recorded choice: \_\_\_\_

---

## 6. SEO + crawler hygiene

- [ ] `https://<your-domain>/sitemap.xml` returns the 6 public URLs.
- [ ] `https://<your-domain>/robots.txt` returns the Allow + Disallow rules + sitemap line.
- [ ] Inspect the marketing landing in Google's [Rich Results Test](https://search.google.com/test/rich-results) → no critical errors. (Warnings about missing structured data are fine for a stub landing.)
- [ ] Open-graph + twitter:card metadata renders correctly on the landing — paste the URL into Slack/WhatsApp and check the preview card. Acceptable to defer to a follow-up if no preview shows; not a launch blocker for a closed beta.

---

## 7. Beta invite mechanism

The locked decision: **open signup — anyone with the URL can register**. Rationale: the beta audience is small + curated through Jorge's direct outreach; we don't need invite-code infrastructure. The friction of an invite code would outweigh the leak-protection benefit at this scale. Revisit if abuse appears.

- [ ] Confirm signup is enabled in Supabase (Authentication → Sign In / Providers → "Allow new users to sign up" toggle ON — was confirmed during the L3.5.5 setup screenshot).
- [ ] Compose the first invite message. Template:
  > "Hola — IFA está en beta privada para amigos y familia. Si quieres probarlo: <URL>. Es gratis los primeros 30 días, luego $1 USD/mes si decides seguir. Mándame cualquier cosa rara que veas a jorgeluiscontrerasherrera@gmail.com."
- [ ] Pick the first 3-5 recipients. Stagger by ~1 day so you have time to react if the first one finds something.

---

## 8. Observability — what to watch in the first 48 hours

- [ ] Bookmark Vercel → Functions → Logs and check it 2x/day for the first 2 days. Watch for: `handler_failed`, `bootstrap_failed`, recurring 500s.
- [ ] Bookmark Stripe → Developers → Events. Watch for: any event with a non-2xx response from us.
- [ ] Bookmark Supabase → Authentication → Users. Watch for: unexpected sign-up activity (could be the URL leaked to a bot list).
- [ ] (Optional, deferred to post-launch) Sentry / external error tracking — not required for L7 per the PLAN ("`console.error` is honest enough for beta scale"). Decision recorded.

---

## 9. Go / no-go ceremony

After every box above is checked AND every blocker from `_LAUNCH_QA_CHECKLIST.md` is resolved:

- [ ] Founder reads the punch list one more time. No unresolved items. No "I'll fix it after launch" items that aren't intentionally deferred.
- [ ] Founder sends the first invite link.
- [ ] Founder records launch date below.

**First invite sent:** **\_** (date, time, recipient count)

---

## Blockers / deferrals

Log each one as a line:

```
- [ ] **Section N** — short description — link to follow-up commit or post-launch ticket.
```

(Empty until the founder works through the checklist.)

---

## Post-launch — what to track for the first 30 days

NOT a launch blocker; pinned here so it doesn't get lost in the launch-day chaos.

- Activation funnel: signups → onboarding completion → first import → first dashboard visit.
- Per-bank import success rate. Sparse hits on a particular bank → that's the next L2 sample-collection item to chase.
- Stripe trial → paid conversion at day 30. The first cohort hits this in ~30 days from launch.
- Support inbox response time. Stay under 48h or revise the `/contacto` copy.
- Anything in the deferred-debt list ([\_PHASE_L_TRACKER.md §6](./_PHASE_L_TRACKER.md) if a §6 exists; otherwise the open commitments mentioned across closed L batches): re-auth-gate helper extraction, hard-delete cleanup job, app-level email callsites, L2 sample collection.
