'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserSideClient } from '@/lib/auth/browser';
import { publicEnv } from '@/lib/env';
import { isSafeNext } from '@/lib/auth/safe-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';

const schema = z.object({
  email: z.email(),
});

type FormValues = z.infer<typeof schema>;

interface MagicLinkFormProps {
  /** Raw `?next=` param; sanitized before forwarding to the callback URL. */
  nextParam: string | null;
}

/** Cooldown floor between requests. Matches Supabase's default rate limit. */
const COOLDOWN_SECONDS_BASE = 60;

/**
 * Magic-link sign-in form.
 *
 * Submits the email to Supabase's `signInWithOtp` which emails the user
 * a one-time URL. Clicking the URL lands on `/auth/callback` which
 * exchanges the embedded code for a session cookie and redirects onward.
 *
 * First-time submissions from a new email address auto-create the user
 * in Supabase Auth (default behavior; we do not pass
 * `shouldCreateUser: false`). So this single form covers both sign-in
 * and sign-up — there is no separate register route.
 *
 * Rate limiting: Supabase enforces 60s between requests server-side.
 * The UI additionally disables the submit button for 60s after a
 * successful send, then applies incremental backoff (60 → 120 → 240s
 * capped at 300s) if the user triggers a send again within the same
 * session. Beyond that Supabase's 429 takes over and the error alert
 * shows "muchos intentos".
 */
export function MagicLinkForm({ nextParam }: MagicLinkFormProps) {
  const t = useTranslations('auth.signIn');
  const tErrors = useTranslations('auth.signIn.errors');
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [consecutiveSends, setConsecutiveSends] = useState(0);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const id = setInterval(() => {
      setCooldownRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [cooldownRemaining]);

  async function onSubmit(values: FormValues): Promise<void> {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const supabase = createSupabaseBrowserSideClient();
      const email = values.email.trim().toLowerCase();
      const callbackUrl = new URL('/auth/callback', publicEnv.siteUrl);
      if (isSafeNext(nextParam)) {
        callbackUrl.searchParams.set('next', nextParam);
      }
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      });
      if (error) {
        if (error.status === 429) {
          setServerError(tErrors('rateLimited'));
        } else {
          setServerError(tErrors('unknown'));
        }
        return;
      }
      const nextConsecutive = consecutiveSends + 1;
      setConsecutiveSends(nextConsecutive);
      // Incremental backoff: 60 → 120 → 240 → 300 (capped).
      const cooldown = Math.min(300, COOLDOWN_SECONDS_BASE * 2 ** Math.max(0, nextConsecutive - 1));
      setCooldownRemaining(cooldown);
      router.push(`/ingresar/revisa-tu-correo?email=${encodeURIComponent(email)}`);
    } catch {
      setServerError(tErrors('unknown'));
    } finally {
      setIsSubmitting(false);
    }
  }

  const disabled = isSubmitting || cooldownRemaining > 0;
  const submitLabel =
    cooldownRemaining > 0
      ? t('cooldown', { seconds: cooldownRemaining })
      : isSubmitting
        ? t('submitting')
        : t('submit');

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit)(e);
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        {serverError ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('emailLabel')}</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={t('emailPlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={disabled} className="w-full">
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
