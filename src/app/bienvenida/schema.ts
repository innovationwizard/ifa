import { z } from 'zod';

/**
 * Onboarding schema.
 *
 *   - displayName: required, 2–100 chars after trim.
 *   - dpiNumber: optional, free-form text up to 50 chars. NEVER
 *     validated against any DPI format rule — per
 *     `project_core_thesis.md`, DPI is opt-in metadata that IFA stores
 *     for the user's own reference only.
 *
 * Kept in a separate file so it can be imported by:
 *   - the server action (src/app/bienvenida/actions.ts) which pulls in
 *     Supabase env at module load,
 *   - the client form (src/components/onboarding/welcome-form.tsx) for
 *     inline field-level errors,
 *   - and unit tests, which can't tolerate the env-chain import.
 *
 * We export two shapes:
 *   - `onboardingSchema`        — plain (no transform), for RHF +
 *                                 client validation.
 *   - `normalizeOnboarding(...)`— server-side normalizer that collapses
 *                                 empty/whitespace DPI to null so the
 *                                 DB never stores "".
 */
export const onboardingSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  dpiNumber: z.string().trim().max(50).optional(),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export interface OnboardingNormalized {
  displayName: string;
  dpiNumber: string | null;
}

export function normalizeOnboarding(input: OnboardingInput): OnboardingNormalized {
  const dpi = input.dpiNumber?.trim();
  return {
    displayName: input.displayName,
    dpiNumber: dpi && dpi.length > 0 ? dpi : null,
  };
}
