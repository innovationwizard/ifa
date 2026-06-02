import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle, CheckCircle2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createSupabaseServerSideClient } from '@/lib/auth/server';
import { confirmEmailChange } from '../actions';

/**
 * `/configuracion/confirmar-cambio-correo` — Phase L3.4 step 2.
 *
 * The user lands here after clicking the magic link sent to their
 * CURRENT email by step 1's `requestEmailChange` action. Three
 * gates must all pass before the confirmation button renders (per
 * [ADR-003](../../../../../docs_operations/_DECISIONS.md#adr-003)):
 *
 *   1. User is authenticated (proxy handles anon redirect).
 *   2. `last_sign_in_at` is fresh (within 60s). Proves the magic
 *      link was just clicked; rejects session-theft replays where
 *      the cookie is old but the inbox isn't accessible.
 *   3. `user_metadata.pendingEmailChange` is set + not stale
 *      (within 15 min). Proves step 1 was started by the same
 *      session.
 *
 * Failure modes render a user-facing card with a "request again"
 * link back to `/configuracion`.
 *
 * On success: the `confirmEmailChange` server action fires
 * Supabase's standard email-change flow, which sends a final
 * confirmation link to the NEW email. The page then shows
 * "check your new email" copy.
 */

const FRESH_SIGN_IN_WINDOW_SECONDS = 60;
const PENDING_CHANGE_TTL_SECONDS = 15 * 60;

interface ConfirmReady {
  state: 'ready';
  pendingEmail: string;
}
interface ConfirmBlocked {
  state: 'fresh_sign_in_required' | 'no_pending_change' | 'pending_change_expired';
}
type ConfirmGate = ConfirmReady | ConfirmBlocked;

export default async function ConfirmarCambioCorreoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/ingresar');

  const t = await getTranslations('settings.account.email.confirmPage');

  /*
   * Read the `confirmed=true` query param so we can render the
   * post-confirmation message after the server action redirects
   * back here. The action redirects with ?confirmed=true on
   * success.
   */
  const params = await searchParams;
  if (params.confirmed === 'true') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-start gap-3 space-y-0">
            <Mail className="text-ifa-teal-600 mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">{t('successTitle')}</CardTitle>
              <CardDescription>{t('successBody')}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/configuracion">{t('backToSettings')}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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

  /*
   * Ready: show the confirmation card with the new email + the
   * confirm button. Form-action posts to the server action; on
   * success, the action returns and Next replays this page render
   * — we then look at the metadata (now cleared) and bounce the
   * user to the success state via the redirect below.
   */
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 py-8">
      <Card>
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <CheckCircle2 className="text-ifa-teal-600 mt-0.5 size-5 shrink-0" aria-hidden />
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{t('readyTitle')}</CardTitle>
            <CardDescription>{t('readyBody', { newEmail: gate.pendingEmail })}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              'use server';
              const result = await confirmEmailChange();
              if (result.ok) {
                redirect('/configuracion/confirmar-cambio-correo?confirmed=true');
              }
              redirect('/configuracion/confirmar-cambio-correo');
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
}): ConfirmGate {
  const lastSignInIso = user.last_sign_in_at;
  const lastSignInAge = lastSignInIso
    ? (Date.now() - new Date(lastSignInIso).getTime()) / 1000
    : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(lastSignInAge) || lastSignInAge > FRESH_SIGN_IN_WINDOW_SECONDS) {
    return { state: 'fresh_sign_in_required' };
  }

  const meta = user.user_metadata;
  const pendingEmail = typeof meta.pendingEmailChange === 'string' ? meta.pendingEmailChange : null;
  const pendingAtIso =
    typeof meta.pendingEmailChangeRequestedAt === 'string'
      ? meta.pendingEmailChangeRequestedAt
      : null;
  if (!pendingEmail || !pendingAtIso) {
    return { state: 'no_pending_change' };
  }
  const pendingAge = (Date.now() - new Date(pendingAtIso).getTime()) / 1000;
  if (!Number.isFinite(pendingAge) || pendingAge > PENDING_CHANGE_TTL_SECONDS) {
    return { state: 'pending_change_expired' };
  }

  return { state: 'ready', pendingEmail };
}
