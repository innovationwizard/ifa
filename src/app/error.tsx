'use client';

import { ErrorView } from '@/components/feedback/error-view';

/*
 * App-wide error boundary for the public (unauthenticated) surface.
 * Must be a client component per App Router convention.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={error} reset={reset} homeHref="/" />;
}
