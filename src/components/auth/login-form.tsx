'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserSideClient } from '@/lib/auth/browser';
import { safeNext } from '@/lib/auth/safe-next';
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
  password: z.string().min(1),
});

type FormValues = z.infer<typeof schema>;

interface LoginFormProps {
  /** Raw `next` query param from the URL; sanitized before any navigation. */
  nextParam: string | null;
}

/**
 * Email+password sign-in form.
 *
 * Uses the browser-side Supabase client so credentials never touch our
 * server. On success the session cookie is set by Supabase in the
 * browser; we call `router.refresh()` before navigating so the next
 * server render sees the new session. `router.push(safeDestination)`
 * then routes the user to either their `?next=` destination (if safe)
 * or `/dashboard`.
 *
 * Error handling is INTENTIONALLY non-enumerating: a wrong-credentials
 * error, a wrong-email error, and an unconfirmed-email error all
 * surface as the same "El correo o la clave no coinciden" message.
 * This matches OWASP guidance to not leak which half of the credential
 * pair failed.
 *
 * Rate-limit errors (Supabase returns HTTP 429) get a separate copy
 * because the user can act on it (wait a minute).
 */
export function LoginForm({ nextParam }: LoginFormProps) {
  const t = useTranslations('auth.login');
  const tErrors = useTranslations('auth.login.errors');
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: FormValues): Promise<void> {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const supabase = createSupabaseBrowserSideClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });
      if (error) {
        /*
         * why: non-enumerating error. Every auth failure produces the
         * same user-facing message, except rate-limit (which is
         * actionable). Specific Supabase error codes checked by
         * `error.status` / `error.code`; the status 429 path is the
         * only one we expose differently.
         */
        if (error.status === 429) {
          setServerError(tErrors('rateLimited'));
        } else if (typeof error.status === 'number' && error.status >= 500) {
          setServerError(tErrors('unknown'));
        } else {
          setServerError(tErrors('invalidCredentials'));
        }
        return;
      }
      const destination = safeNext(nextParam);
      // Refresh so server components see the new session cookie, then navigate.
      router.refresh();
      router.push(destination);
    } catch {
      setServerError(tErrors('unknown'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit)(e);
        }}
        className="flex flex-col gap-5"
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

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('passwordLabel')}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder={t('passwordPlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t('submitting') : t('submit')}
        </Button>

        <div className="text-ifa-gray-700 flex flex-col items-center gap-2 text-sm">
          <Link href="/recuperar" className="text-ifa-teal-600 underline-offset-2 hover:underline">
            {t('forgotPassword')}
          </Link>
          <p>
            {t('noAccountYet')}{' '}
            <Link
              href="/crear-cuenta"
              className="text-ifa-teal-600 underline-offset-2 hover:underline"
            >
              {t('createAccount')}
            </Link>
          </p>
        </div>
      </form>
    </Form>
  );
}
