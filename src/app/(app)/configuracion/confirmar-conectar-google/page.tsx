import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseServerSideClient } from '@/lib/auth/server';
import { confirmGoogleLink } from '../actions';

/**
 * `/configuracion/confirmar-conectar-google` — Phase L3.5.5 step 2.
 *
 * Mirrors `/configuracion/confirmar-cambio-correo` (L3.4). Three gates
 * (ADR-003) must pass before the "Conectar con Google" button renders:
 *
 *   1. Authenticated (proxy handles anon redirect).
 *   2. `last_sign_in_at` fresh (≤ 60s) — proves the magic link was
 *      just clicked.
 *   3. `user_metadata.pendingLinkGoogleRequestedAt` set + not stale
 *      (≤ 15 min) — proves step 1 was started by the same session.
 *
 * On confirm, `confirmGoogleLink` action calls
 * `supabase.auth.linkIdentity({provider: 'google'})` and server-
 * redirects the browser to Google. Google → /auth/callback →
 * /configuracion?linked=google.
 */

const FRESH_SIGN_IN_WINDOW_SECONDS = 60;
const PENDING_CHANGE_TTL_SECONDS = 15 * 60;

interface ConfirmReady {
  state: 'ready';
}
interface ConfirmBlocked {
  state:
    | 'fresh_sign_in_required'
    | 'no_pending_change'
    | 'pending_change_expired'
    | 'already_linked';
}
type ConfirmGate = ConfirmReady | ConfirmBlocked;

export default async function ConfirmarConectarGooglePage() {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/ingresar');

  const t = await getTranslations('settings.account.signInMethods.google.confirmPage');

  const gate = computeGate(user);

  if (gate.state !== 'ready') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">{t(`blocked.${gate.state}.title`)}</CardTitle>
              <CardDescription>{t(`blocked.${gate.state}.body`)}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/configuracion">{t('blocked.retryCta')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-8">
      <Card>
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <CheckCircle2 className="text-ifa-teal-600 mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{t('readyTitle')}</CardTitle>
            <CardDescription>{t('readyBody')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              'use server';
              const result = await confirmGoogleLink();
              /*
               * confirmGoogleLink redirects to Google on success
               * (throws NEXT_REDIRECT). We only reach here on error;
               * bounce back to /configuracion so the user sees the
               * failure mode in the AccountCard rather than a blank
               * confirmation page.
               */
              if (!result.ok) {
                redirect(`/configuracion?linkError=${result.errorKey ?? 'unknown'}`);
              }
            }}
          >
            <Button type="submit" size="sm">
              {t('confirmCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function computeGate(user: {
  last_sign_in_at?: string | null;
  user_metadata: Record<string, unknown>;
  identities?: { provider: string }[] | null;
}): ConfirmGate {
  if ((user.identities ?? []).some((i) => i.provider === 'google')) {
    return { state: 'already_linked' };
  }

  const lastSignInIso = user.last_sign_in_at;
  const lastSignInAge = lastSignInIso
    ? (Date.now() - new Date(lastSignInIso).getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(lastSignInAge) || lastSignInAge > FRESH_SIGN_IN_WINDOW_SECONDS) {
    return { state: 'fresh_sign_in_required' };
  }

  const meta = user.user_metadata;
  const pendingAtIso =
    typeof meta.pendingLinkGoogleRequestedAt === 'string'
      ? meta.pendingLinkGoogleRequestedAt
      : null;
  if (!pendingAtIso) {
    return { state: 'no_pending_change' };
  }
  const pendingAge = (Date.now() - new Date(pendingAtIso).getTime()) / 1000;
  if (!Number.isFinite(pendingAge) || pendingAge > PENDING_CHANGE_TTL_SECONDS) {
    return { state: 'pending_change_expired' };
  }

  return { state: 'ready' };
}
