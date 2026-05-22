import 'server-only';
import { z } from 'zod';
import { MODEL_HAIKU, callClaudeWithRetry } from './claude';
import { type Category, isCategory } from './categories';
import { merchantCategoryRepo } from '@/lib/db/repositories';
import { withTenant } from '@/lib/db/tenant-context';

/**
 * AI categorization service (Phase 6/7 Batch 3).
 *
 * `categorizeMerchant(profileId, merchant)` resolves a merchant to a
 * `Category` label using a two-tier strategy:
 *
 *   1. Consult the per-profile `MerchantCategory` cache. A hit
 *      returns immediately with zero Claude calls — this is the
 *      hot path for the second-and-later sighting of any merchant.
 *
 *   2. On cache miss, call Claude Haiku with a Spanish system
 *      prompt + the merchant payload. Parse the response via Zod
 *      against the closed `CATEGORIES` vocabulary. Malformed or
 *      out-of-vocabulary responses log + return `null` (never
 *      poison the cache with garbage).
 *
 *   3. Cache the AI result with `source: 'AI'` and the model's
 *      self-reported `aiConfidence` in [0, 1]. Subsequent calls
 *      for the same merchant on the same profile hit step 1.
 *
 * Errors during the Claude call (network, exhausted retries) are
 * caught and surfaced as a `null` return rather than thrown — the
 * caller (importer / job processor) treats missing category as
 * "leave it null, try again later" rather than failing the
 * containing transaction.
 *
 * Tenant scoping: the function takes `profileId` explicitly so it
 * can be invoked from both request-scoped (already inside
 * `withTenant`) and job-scoped (no surrounding context) call sites.
 * Internally it wraps the cache + insert in its own
 * `withTenant({ profileId, userId: null }, ...)` so the tenancy
 * extension finds a context regardless of caller.
 *
 * Prompt caching: the system prompt is stamped with
 * `cache_control: { type: 'ephemeral' }` so its tokens hit
 * Anthropic's prompt cache. With a 5-minute TTL and the system
 * prompt held constant across calls, the cache-hit rate target is
 * ≥90% during a batch import.
 */

export interface MerchantInput {
  /** Free-form merchant name (description fallback when the bank doesn't
   *  expose a structured merchant field). May be null when the bank
   *  only gave us a NIT or neither. */
  merchantName: string | null;
  /** Guatemalan NIT when present; preferred as the lookup key because
   *  it's more stable than the merchant name across statements. */
  merchantNit?: string | null;
}

/**
 * Build a deterministic, profile-stable lookup key for a merchant.
 *
 * Resolution order:
 *   1. NIT (when present) — `nit:<raw NIT>`. NIT is the most stable
 *      identifier because the bank can spell the merchant name
 *      different ways across statements.
 *   2. Normalized merchant name — `name:<normalized>` where the
 *      normalization is: lower-case, accent-stripped (NFD →
 *      combining-marks removed), whitespace-collapsed, trimmed.
 *   3. Neither usable → empty string. Caller treats empty as
 *      "skip categorization for this row".
 *
 * Pure + deterministic — same input always yields the same key.
 * No DB / API calls.
 */
export function normalizeLookupKey(merchant: MerchantInput): string {
  const nit = merchant.merchantNit?.trim();
  if (nit) return `nit:${nit}`;

  const name = merchant.merchantName?.trim();
  if (!name) return '';

  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    /*
     * Strip combining diacritical marks (U+0300 – U+036F). After NFD
     * decomposes "á" into "a" + U+0301, this regex removes the U+0301
     * so the key matches "ALIMENTACION" and "Alimentación" equally.
     */
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `name:${normalized}`;
}

/*
 * Stable Spanish system prompt. Lists the closed vocabulary, defines
 * the exact output shape, and tells the model to copy categories
 * letter-for-letter (so the Zod check below passes). Held constant
 * across calls — `cache_control: ephemeral` on the system block lets
 * Anthropic serve repeat invocations from prompt cache.
 *
 * If this prompt grows, keep stable content above any per-request
 * placeholders — the cache key is a prefix match.
 */
const SYSTEM_PROMPT = `Eres un clasificador de comercios para una app de finanzas personales en Guatemala. Tu única tarea: asignar UNA categoría de la lista cerrada a cada comercio que el usuario te describa.

Categorías permitidas (debes responder con UNA exactamente, copiada letra por letra):
- Alimentación (supermercados, abarrotes, ventas de frutas y verduras)
- Transporte (gasolineras, rideshare, peajes, lavados, repuestos, transporte público)
- Vivienda (renta, hipoteca, mantenimiento del hogar, ferreterías)
- Salud (farmacias, médicos, hospitales, seguros médicos)
- Servicios (electricidad, agua, internet, telefonía, banca, seguros generales)
- Entretenimiento (cine, streaming, eventos, viajes turísticos)
- Restaurantes (restaurantes, comida rápida, cafeterías, bares)
- Ropa (tiendas de ropa, calzado, accesorios)
- Educación (colegios, universidades, cursos, libros)
- Compras (electrónica, hogar, regalos, otros bienes durables)
- Trabajo (sueldo recibido, pagos a empleados, gastos de oficina)
- Otros (cualquier cosa que no encaja claramente arriba)

Formato de respuesta: ÚNICAMENTE un objeto JSON, sin texto adicional, sin backticks, sin explicación:
{"category":"...","confidence":0.xx}

Reglas duras:
- "category" debe ser exactamente uno de los 12 valores arriba (copia letra por letra, con acentos).
- "confidence" es un número entre 0 y 1 que indica qué tan seguro estás.
- Si dudas entre varias, elige la más probable y baja "confidence".
- Si realmente no sabes, responde {"category":"Otros","confidence":0.3}.`;

const ResponseSchema = z.object({
  category: z.string().refine(isCategory, {
    message: 'category must be one of the 12 allowed values',
  }),
  confidence: z.number().min(0).max(1),
});

interface CategoryResult {
  category: Category;
  confidence: number;
}

async function askClaudeForCategory(merchant: MerchantInput): Promise<CategoryResult | null> {
  let response;
  try {
    response = await callClaudeWithRetry({
      model: MODEL_HAIKU,
      max_tokens: 80,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            merchantName: merchant.merchantName,
            merchantNit: merchant.merchantNit ?? null,
          }),
        },
      ],
    });
  } catch (err) {
    /*
     * `callClaudeWithRetry` exhausted its 3-retry budget. We log
     * and return null so the import / job continues without a
     * category; the next run can retry from cache miss.
     */

    console.warn('[categorization] Claude call failed after retries', err);
    return null;
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (textBlock?.type !== 'text') {
    console.warn('[categorization] no text block in Claude response');
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    console.warn('[categorization] Claude returned non-JSON text:', textBlock.text);
    return null;
  }

  const validated = ResponseSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn(
      '[categorization] Claude response failed schema validation',
      validated.error.issues,
    );
    return null;
  }

  return {
    category: validated.data.category,
    confidence: validated.data.confidence,
  };
}

/**
 * Result of a successful categorization. `confidence` is the AI's
 * self-reported score in [0, 1] for AI-sourced rows, and `null` for
 * USER overrides (USER rows are deterministic; confidence doesn't
 * apply). The caller (e.g. the categorize-transaction job handler in
 * Batch 5) writes both to `Transaction.category` and
 * `Transaction.aiCategoryConfidence`.
 */
export interface CategorizationResult {
  category: Category;
  confidence: number | null;
}

export async function categorizeMerchant(
  profileId: string,
  merchant: MerchantInput,
): Promise<CategorizationResult | null> {
  const lookupKey = normalizeLookupKey(merchant);
  if (!lookupKey) return null;

  return withTenant({ profileId, userId: null }, async () => {
    const cached = await merchantCategoryRepo.findByLookupKey(lookupKey);
    if (cached && isCategory(cached.category)) {
      return { category: cached.category, confidence: cached.aiConfidence };
    }

    const ai = await askClaudeForCategory(merchant);
    if (!ai) return null;

    try {
      await merchantCategoryRepo.create({
        profileId,
        lookupKey,
        category: ai.category,
        source: 'AI',
        aiConfidence: ai.confidence,
      });
    } catch (err) {
      /*
       * Concurrent-write race: another caller upserted the same
       * (profileId, lookupKey) between our findByLookupKey and our
       * create. The unique constraint `uniq_profile_lookup_key`
       * surfaces this as a P2002 unique-violation. We re-fetch and
       * return whatever the winner wrote rather than overwriting
       * a possible USER override.
       */
      const concurrent = await merchantCategoryRepo.findByLookupKey(lookupKey);
      if (concurrent && isCategory(concurrent.category)) {
        return { category: concurrent.category, confidence: concurrent.aiConfidence };
      }
      throw err;
    }

    return { category: ai.category, confidence: ai.confidence };
  });
}
