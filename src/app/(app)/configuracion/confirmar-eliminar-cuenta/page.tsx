import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteConfirmForm } from '@/components/settings/delete-confirm-form';
import { createSupabaseServerSideClient } from '@/lib/auth/server';

/**
 * `/configuracion/confirmar-eliminar-cuenta` — Phase L3.7 step 2.
 *
 * Mirrors the other L3 confirm pages. Three gates run here (auth +
 * freshness + pending metadata); the fourth gate — type-to-confirm
 * "ELIMINAR MI CUENTA" — runs on the form submission via the
 * `confirmAccountDeletion` server action.
 *
 * The form is a small client component (`<DeleteConfirmForm>`) so the
 * submit button can enable/disable as the user types. Server-side
 * phrase validation in the action is the actual security boundary;
 * client-side disabling is purely UX.
 */

const FRESH_SIGN_IN_WINDOW_SECONDS = 60;
const PENDING_CHANGE_TTL_SECONDS = 15 * 60;

interface ConfirmReady {
  state: 'ready';
}
interface ConfirmBlocked {
  state: 'fresh_sign_in_required' | 'no_pending_change' | 'pending_change_expired';
}
type ConfirmGate = ConfirmReady | ConfirmBlocked;

export default async function ConfirmarEliminarCuentaPage() {
  const supabase = await createSupabaseServerSideClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect('/ingresar');

  const t = await getTranslations('settings.sections.delete.confirmPage');

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
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden />
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{t('readyTitle')}</CardTitle>
            <CardDescription>{t('readyBody')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DeleteConfirmForm />
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
  const pendingAtIso =
    typeof meta.pendingAccountDeletionRequestedAt === 'string'
      ? meta.pendingAccountDeletionRequestedAt
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
