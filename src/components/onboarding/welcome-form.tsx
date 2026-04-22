'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { completeOnboardingAction } from '@/app/bienvenida/actions';
import { onboardingSchema, type OnboardingInput } from '@/app/bienvenida/schema';

type FormValues = OnboardingInput;

interface WelcomeFormProps {
  /** Pre-filled displayName from the user's Profile. */
  initialDisplayName: string;
}

export function WelcomeForm({ initialDisplayName }: WelcomeFormProps) {
  const t = useTranslations('onboarding.welcome');
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      displayName: initialDisplayName,
      dpiNumber: '',
    },
  });

  function onSubmit(values: FormValues): void {
    setServerError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction({
        displayName: values.displayName,
        dpiNumber: values.dpiNumber,
      });
      if (!result.ok) {
        if (result.error === 'unauthenticated') {
          setServerError(t('errors.unauthenticated'));
        } else if (result.error === 'validation') {
          setServerError(t('errors.validation'));
        } else {
          setServerError(t('errors.server'));
        }
      }
      // On success the server action redirects; startTransition resolves
      // after navigation begins so no client-side redirect is needed.
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
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
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('nameLabel')}</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder={t('namePlaceholder')} {...field} />
              </FormControl>
              <FormDescription>{t('nameHelp')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="dpiNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('dpiLabel')}</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={t('dpiPlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t('dpiHelp')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </Form>
  );
}
