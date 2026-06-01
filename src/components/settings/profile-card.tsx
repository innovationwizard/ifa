'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateProfile } from '@/app/(app)/configuracion/actions';

/**
 * `<ProfileCard>` — Phase L3.3.
 *
 * Form-only component for the Perfil section of `/configuracion`.
 * Owns local input state (so the user can type freely without
 * server round-trips) and submits via the `updateProfile` server
 * action.
 *
 * Form fields:
 *   - displayName (required) — the only field IFA actually uses
 *     (greetings, dashboard header, etc.). Tightest validation.
 *   - dpiNumber (optional) — Guatemalan DPI, 13 digits. Schema
 *     says "Stored for reference only; never validated, never
 *     used as a lookup key." We keep validation minimal (digits-
 *     only, up to 13) at the server-action layer.
 *   - dateOfBirth (optional) — ISO date input. Stored as `@db.Date`
 *     (no time component).
 *
 * UI states:
 *   - idle      — initial; submit button enabled
 *   - submitting — spinner; button disabled
 *   - saved     — checkmark + Spanish copy; auto-clears on next edit
 *   - error     — destructive alert; submit re-enabled
 */

export interface ProfileCardProps {
  initial: {
    displayName: string;
    dpiNumber: string | null;
    /** ISO date string (YYYY-MM-DD) or null. Page formats from Profile.dateOfBirth. */
    dateOfBirth: string | null;
  };
}

type FormStatus = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; messageKey: string };

export function ProfileCard({ initial }: ProfileCardProps) {
  const t = useTranslations('settings.profile.form');
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [dpiNumber, setDpiNumber] = useState(initial.dpiNumber ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(initial.dateOfBirth ?? '');
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });
  const [isSubmitting, startSubmitting] = useTransition();

  function handleEdit(setter: (v: string) => void): (v: string) => void {
    return (v) => {
      setter(v);
      if (status.kind !== 'idle') setStatus({ kind: 'idle' });
    };
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startSubmitting(async () => {
      const result = await updateProfile(formData);
      if (result.ok) {
        setStatus({ kind: 'saved' });
      } else {
        setStatus({
          kind: 'error',
          messageKey: result.errorKey === 'validation' ? 'errorValidation' : 'errorUnknown',
        });
      }
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="displayName" className="text-ifa-navy-900 text-sm font-medium">
          {t('displayNameLabel')}
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          value={displayName}
          onChange={(e) => handleEdit(setDisplayName)(e.target.value)}
          className="border-ifa-gray-300 focus:border-ifa-teal-600 focus:ring-ifa-teal-100 rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="dpiNumber" className="text-ifa-navy-900 text-sm font-medium">
          {t('dpiNumberLabel')}
          <span className="text-ifa-gray-500 ml-1 text-xs font-normal">{t('optional')}</span>
        </label>
        <input
          id="dpiNumber"
          name="dpiNumber"
          type="text"
          inputMode="numeric"
          pattern="\d{0,13}"
          maxLength={13}
          value={dpiNumber}
          onChange={(e) => handleEdit(setDpiNumber)(e.target.value)}
          className="border-ifa-gray-300 focus:border-ifa-teal-600 focus:ring-ifa-teal-100 rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
        <p className="text-ifa-gray-500 text-xs">{t('dpiNumberHelp')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="dateOfBirth" className="text-ifa-navy-900 text-sm font-medium">
          {t('dateOfBirthLabel')}
          <span className="text-ifa-gray-500 ml-1 text-xs font-normal">{t('optional')}</span>
        </label>
        <input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          value={dateOfBirth}
          onChange={(e) => handleEdit(setDateOfBirth)(e.target.value)}
          className="border-ifa-gray-300 focus:border-ifa-teal-600 focus:ring-ifa-teal-100 rounded-md border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {status.kind === 'saved' && (
          <span className="text-ifa-teal-700 inline-flex items-center gap-1 text-xs">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {t('saved')}
          </span>
        )}
        {status.kind === 'error' && (
          <span className="inline-flex items-center gap-1 text-xs text-red-700">
            {t(status.messageKey)}
          </span>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              <span>{t('saving')}</span>
            </>
          ) : (
            t('save')
          )}
        </Button>
      </div>
    </form>
  );
}
