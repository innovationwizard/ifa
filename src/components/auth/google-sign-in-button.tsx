'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createSupabaseBrowserSideClient } from '@/lib/auth/browser';
import { publicEnv } from '@/lib/env';
import { isSafeNext } from '@/lib/auth/safe-next';
import { Button } from '@/components/ui/button';

interface GoogleSignInButtonProps {
  /** Optional `?next=` destination — forwarded through the callback. */
  nextParam: string | null;
}

/**
 * Google OAuth button.
 *
 * On click, Supabase redirects the browser to Google's consent screen
 * via `signInWithOAuth`. The redirect URL carries `?next=` through the
 * flow so the post-auth landing can return the user to their original
 * destination. Unsafe `next` values are discarded (open-redirect guard).
 *
 * Scopes requested: Google's default minimal set includes `openid email
 * profile` — enough to prefill the user's name and avatar when the
 * Profile row is created on first sign-in (S-2.7). Supabase handles the
 * token exchange; we just trigger the redirect.
 */
export function GoogleSignInButton({ nextParam }: GoogleSignInButtonProps) {
  const t = useTranslations('auth.signIn');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onClick(): Promise<void> {
    setIsSubmitting(true);
    try {
      const supabase = createSupabaseBrowserSideClient();
      const callbackUrl = new URL('/auth/callback', publicEnv.siteUrl);
      if (isSafeNext(nextParam)) {
        callbackUrl.searchParams.set('next', nextParam);
      }
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
          /*
           * Default `email profile openid` scopes. Explicitly listed so
           * a future reviewer can see what we request from Google without
           * reading Supabase's defaults.
           */
          scopes: 'email profile openid',
        },
      });
      // `signInWithOAuth` navigates the browser to Google; the next line
      // only runs if Supabase returned before redirect (which only
      // happens on error). Any error surfaces via the supabase client's
      // state rather than a thrown exception — UI handles via
      // router errors or page reload.
    } catch {
      setIsSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-3"
      disabled={isSubmitting}
      onClick={() => {
        void onClick();
      }}
    >
      <GoogleLogo className="size-5" aria-hidden />
      <span>{t('oauthGoogle')}</span>
    </Button>
  );
}

function GoogleLogo({ className, ...props }: React.SVGAttributes<SVGSVGElement>) {
  /*
   * Inline Google "G" mark. Colors follow Google's published branding
   * guidelines (#4285F4 blue, #EA4335 red, #FBBC05 yellow, #34A853 green).
   * Paths from Google's official brand package; safe to inline under
   * Google's permitted usage for sign-in buttons.
   */
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" {...props}>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
