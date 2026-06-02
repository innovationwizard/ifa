import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseServerSideClient } from '@/lib/auth/server';
import { confirmGoogleUnlink } from '../actions';

/**
 * `/configuracion/confirmar-desconectar-google` — Phase L3.5.6 step 2.
 *
 * Mirrors `/configuracion/confirmar-conectar-google` (L3.5.5). Five
 * gates must pass before the "Desconectar Google" button renders:
 *
 *   1. Authenticated.
 *   2. `last_sign_in_at` fresh (≤ 60s).
 *   3. `user_metadata.pendingUnlinkGoogleRequestedAt` set + not stale.
 *   4. Google still linked.
 *   5. User has ≥ 2 identities (don't strand them without sign-in).
 *
 * On confirm, `confirmGoogleUnlink` runs the same gate set server-side
 * and calls `supabase.auth.unlinkIdentity(googleIdentity)`. No external
 * OAuth round trip — the unlink is a single Supabase call. The form's
 * server action redirects to `/configuracion?unlinked=google` on
 * success or `/configuracion?unlinkError=<key>` on failure.
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
    | 'not_linked'
    | 'last_identity';
}
type ConfirmGate = ConfirmReady | ConfirmBlocked;

export default async function ConfirmarDesconectarGooglePage() {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/ingresar');

  const t = await getTranslations('settings.account.signInMethods.google.disconnectPage');

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
              const result = await confirmGoogleUnlink();
              if (result.ok) {
                redirect('/configuracion?unlinked=google');
              }
              redirect(`/configuracion?unlinkError=${result.errorKey ?? 'unknown'}`);
            }}
          >
            <Button type="submit" size="sm" variant="destructive">
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
  const lastSignInIso = user.last_sign_in_at;
  const lastSignInAge = lastSignInIso
    ? (Date.now() - new Date(lastSignInIso).getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(lastSignInAge) || lastSignInAge > FRESH_SIGN_IN_WINDOW_SECONDS) {
    return { state: 'fresh_sign_in_required' };
  }

  const meta = user.user_metadata;
  const pendingAtIso =
    typeof meta.pendingUnlinkGoogleRequestedAt === 'string'
      ? meta.pendingUnlinkGoogleRequestedAt
      : null;
  if (!pendingAtIso) {
    return { state: 'no_pending_change' };
  }
  const pendingAge = (Date.now() - new Date(pendingAtIso).getTime()) / 1000;
  if (!Number.isFinite(pendingAge) || pendingAge > PENDING_CHANGE_TTL_SECONDS) {
    return { state: 'pending_change_expired' };
  }

  const identities = user.identities ?? [];
  if (!identities.some((i) => i.provider === 'google')) {
    return { state: 'not_linked' };
  }
  if (identities.length < 2) {
    return { state: 'last_identity' };
  }

  return { state: 'ready' };
}
