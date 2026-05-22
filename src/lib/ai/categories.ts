/**
 * Closed vocabulary of merchant categories used by the AI
 * categorization service (S-7.2, Phase 6/7 Batch 3) and downstream
 * Health Score factors (Phase 7 Batch 9).
 *
 * Kept deliberately small and stable so:
 *   - the model can choose reliably (12 options, all easily
 *     distinguishable for Guatemalan personal finance)
 *   - the system prompt that lists them stays static, which lets
 *     prompt caching land a high hit rate (target ≥90%)
 *   - downstream UI (category icons, spending-by-category report,
 *     factor weights) can hard-code per-category styling
 *
 * Strings are user-facing Spanish (es-GT, lower-elementary register).
 * Comparison is exact-string against this list; the model is
 * instructed to echo one of these values verbatim.
 *
 * Evolving the vocabulary: adding a new category is non-breaking
 * (existing cached rows stay valid). Removing or renaming a category
 * is a schema-style migration — caches keyed to the old name must be
 * cleared or remapped before the rename ships.
 */
export const CATEGORIES = [
  'Alimentación',
  'Transporte',
  'Vivienda',
  'Salud',
  'Servicios',
  'Entretenimiento',
  'Restaurantes',
  'Ropa',
  'Educación',
  'Compras',
  'Trabajo',
  'Otros',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Narrowing guard used by the categorization service to reject AI
 * responses that don't echo one of the allowed labels exactly. Kept
 * here next to the source of truth so any vocabulary change updates
 * the guard automatically.
 */
export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}
