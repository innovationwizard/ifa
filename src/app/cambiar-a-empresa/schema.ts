import { z } from 'zod';

/**
 * BUSINESS-tier upgrade schema.
 *
 *   - displayName: required, 2–100 chars. Pre-filled with the current
 *     Profile.displayName; user often wants to rewrite this to the
 *     legal / trade name of the business.
 *   - nit: optional, free-form up to 20 chars. Never format-validated
 *     per the "NIT optional, revealed in advanced mode" line in the
 *     scaffolding's third non-negotiable truth and the locked
 *     `project_audience.md` memory. Empty or whitespace-only input
 *     normalizes to null at the server boundary.
 *
 * Industry and fiscal regime are NOT collected here on purpose —
 * locked decision: "Tax / fiscal features: always OPTIONAL even inside
 * BUSINESS. Taxes carry high emotional and friction load; don't block
 * adoption on them." The user fills those later in /configuracion.
 */
export const upgradeSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  nit: z.string().trim().max(20).optional(),
});

export type UpgradeInput = z.infer<typeof upgradeSchema>;

export interface UpgradeNormalized {
  displayName: string;
  nit: string | null;
}

export function normalizeUpgrade(input: UpgradeInput): UpgradeNormalized {
  const nit = input.nit?.trim();
  return {
    displayName: input.displayName,
    nit: nit && nit.length > 0 ? nit : null,
  };
}
