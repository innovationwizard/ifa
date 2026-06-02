import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountCard } from '@/components/settings/account-card';
import { BillingCard } from '@/components/settings/billing-card';
import { DataCard } from '@/components/settings/data-card';
import { DeleteCard } from '@/components/settings/delete-card';
import { ProfileCard } from '@/components/settings/profile-card';
import { getCurrentUser } from '@/lib/auth/server';
import { profileRepo } from '@/lib/db/repositories';
import { computeGateState } from '@/lib/billing/gate';

/**
 * `/configuracion` — settings page shell (Phase L3.2).
 *
 * Four sections, each currently a placeholder card. L3.3–L3.7 will
 * replace each placeholder with its real component:
 *
 *   - Perfil       → L3.3 profile-card (displayName, dpiNumber, dob)
 *   - Cuenta       → L3.4 (email change) + L3.5 (password reset)
 *   - Tus datos    → L3.6 data-card (ZIP export)
 *   - Eliminar     → L3.7 delete-card (soft-delete, type-to-confirm)
 *
 * Auth: gated by `PROTECTED_PREFIXES` in proxy + a server-side
 * redirect here mirroring B11/B13's pattern. Anonymous → /ingresar
 * (proxy handles it); authed-but-no-profile → /bienvenida.
 *
 * No data fetches yet — placeholders only. The first real fetch
 * lands in L3.3's profile-card.
 */

export async function generateMetadata() {
  const t = await getTranslations('settings');
  return { title: t('title') };
}

export default async function ConfiguracionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/ingresar');
  const profiles = await profileRepo.findManyForUser(user.id);
  const profile = profiles[0];
  if (!profile) redirect('/bienvenida');

  const t = await getTranslations('settings');

  /*
   * L3.5.5 deep-link params: `?linked=google` after a successful
   * connect-Google round trip; `?linkError=<key>` when the
   * confirmGoogleLink action bounced back from the confirmation page.
   * Both are passed to AccountCard for inline feedback near the
   * Google row. Single-string narrowing — arrays come back as
   * undefined to keep the AccountCard prop shape simple.
   */
  const params = await searchParams;
  const linkErrorParam = typeof params.linkError === 'string' ? params.linkError : null;
  const linkedJustNow = params.linked === 'google';
  /*
   * L3.5.6 deep-link params: `?unlinked=google` after a successful
   * disconnect; `?unlinkError=<key>` when confirmGoogleUnlink bounced.
   */
  const unlinkErrorParam = typeof params.unlinkError === 'string' ? params.unlinkError : null;
  const unlinkedJustNow = params.unlinked === 'google';

  const identities = user.identities ?? [];
  const googleLinked = identities.some((i) => i.provider === 'google');
  const identityCount = identities.length;

  /*
   * L5 billing summary: compute the gate state once and pass it down
   * to the BillingCard. The same state drives the (app) layout's
   * paywall banner, but we recompute here so each card is independent.
   */
  const gateState = computeGateState(profile);

  /*
   * Format the Profile.dateOfBirth (DateTime? @db.Date) as the
   * YYYY-MM-DD string the <input type="date"> expects. UTC slice
   * is safe because the column has no time component.
   */
  const dateOfBirthIso = profile.dateOfBirth
    ? profile.dateOfBirth.toISOString().slice(0, 10)
    : null;

  /*
   * Section list in render order. The order matches the user's
   * mental model: identity (Perfil) → access (Cuenta) → billing
   * (Facturación) → ownership (Tus datos) → exit (Eliminar).
   * Delete is last so the user scrolls past their other options first.
   */
  const sections = [
    {
      key: 'profile',
      title: t('sections.profile.title'),
      description: t('sections.profile.description'),
    },
    {
      key: 'account',
      title: t('sections.account.title'),
      description: t('sections.account.description'),
    },
    {
      key: 'billing',
      title: t('sections.billing.title'),
      description: t('sections.billing.description'),
    },
    {
      key: 'data',
      title: t('sections.data.title'),
      description: t('sections.data.description'),
    },
    {
      key: 'delete',
      title: t('sections.delete.title'),
      description: t('sections.delete.description'),
    },
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-ifa-navy-900 text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-ifa-gray-700 text-sm">{t('subtitle')}</p>
      </header>

      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <Card key={section.key} id={section.key}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {section.key === 'profile' ? (
                <ProfileCard
                  initial={{
                    displayName: profile.displayName,
                    dpiNumber: profile.dpiNumber,
                    dateOfBirth: dateOfBirthIso,
                  }}
                />
              ) : section.key === 'account' ? (
                /*
                 * L3.4 wires email change here. user.email is
                 * always present for a signed-in Supabase user;
                 * fall back to empty string for defensive type
                 * narrowing only (will surface as an obviously-
                 * wrong UI rather than a crash if it ever does).
                 *
                 * L3.5 adds `googleLinked` — derived from
                 * `user.identities` (Supabase populates this on
                 * every getUser() call). Connect/disconnect
                 * mutations land in L3.5.5/L3.5.6.
                 */
                <AccountCard
                  currentEmail={user.email ?? ''}
                  googleLinked={googleLinked}
                  linkError={linkErrorParam}
                  linkedJustNow={linkedJustNow}
                  identityCount={identityCount}
                  unlinkError={unlinkErrorParam}
                  unlinkedJustNow={unlinkedJustNow}
                />
              ) : section.key === 'billing' ? (
                <BillingCard gateState={gateState} />
              ) : section.key === 'data' ? (
                <DataCard />
              ) : (
                <DeleteCard />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
