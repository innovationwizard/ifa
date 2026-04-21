'use client';

import { ErrorView } from '@/components/feedback/error-view';

/*
 * Authenticated-app error boundary. Differs from the root only in that
 * the "go home" action points at /dashboard rather than the landing page.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={error} reset={reset} homeHref="/dashboard" />;
}
