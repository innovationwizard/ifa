import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { MODEL_HAIKU, callClaudeWithRetry } from '@/lib/ai/claude';
import { projectCsvSample } from './projection';
import type {
  CanonicalField,
  ColumnConfidence,
  ColumnMapping,
  ExtractorResult,
  ExtractorStepTrace,
} from './types';

/**
 * AI-assisted column / row detector.
 *
 * Two modes — chosen by the caller, never auto-detected here:
 *
 *   - **CSV mode** (`aiDetect`, Phase L1.3): the heuristic detector
 *     (L1.2) escalates here when confidence is below threshold. We
 *     send Claude Haiku the headers + first 10 sample rows and ask
 *     for a `{ header → canonical-field }` mapping. The caller
 *     projects its own sample through the mapping (we DO NOT trust
 *     any sample shape the AI might invent — guarantee §2 below).
 *
 *   - **Prose mode** (`aiDetectProse`, Phase L2.3): the PDF
 *     extractor (L2.2 → L2.4) feeds us per-page text from a bank-
 *     statement PDF. There are no headers in this format, so the
 *     AI returns extracted row data DIRECTLY (date / description /
 *     amount / debit / credit / merchantNit per row). Per-page text
 *     is bounded to avoid runaway token cost; sample row count is
 *     capped so the wizard's preview stays scrollable.
 *
 * Locked guarantees (load-bearing — apply to BOTH modes unless
 * noted; don't silently weaken):
 *
 *   1. Defensive failure. ANY failure (Claude error, non-JSON text,
 *      schema mismatch) returns a `failed` `ExtractorResult` with
 *      `overallConfidence = 0`. We NEVER throw — the orchestrator's
 *      contract is that ai-detect always returns a result, and the
 *      wizard can decide what to do with low confidence.
 *
 *   2. **CSV mode only.** Sample projection is canonical: we re-
 *      project the FULL input `sampleRows` through `projectCsvSample`
 *      using the AI's mapping. The AI's job is narrow ("identify
 *      columns"), not "invent data". In prose mode the AI IS the
 *      sample source — guarantee §2 does not apply there because
 *      there is no header-mapping projection to anchor against.
 *
 *   3. **CSV mode only.** The mapping is filtered to known headers
 *      before use. Hallucinated headers are dropped. Prose mode
 *      has no equivalent (no headers).
 *
 *   4. Cost telemetry comes from `callClaudeWithRetry` (B2 wrapper)
 *      which logs a structured `claude.usage` line; we additionally
 *      surface the same fields in the trace's `ai` block so per-
 *      import token spend is greppable from a single record.
 *
 *   5. Prompt caching. EACH mode has its own system prompt wrapped
 *      in `cache_control: ephemeral`. The cache keys are separate
 *      because the prompts differ; a user who uploads a CSV then
 *      a PDF in the same 5-min window pays cache-read pricing on
 *      the SECOND call within each mode, not across modes.
 */

const CANONICAL_FIELDS = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'merchantNit',
  'ignore',
] as const satisfies readonly CanonicalField[];

/**
 * Tú-register Spanish system prompt for CSV mode. Locked content: a
 * change to the field list, response format, or rules invalidates
 * the prompt cache key so KEEP THE STRING STABLE. Edit only when
 * the underlying semantics actually change.
 */
const SYSTEM_PROMPT_CSV = `Eres un asistente que identifica las columnas de un archivo CSV de un banco guatemalteco.

Te paso los encabezados y las primeras 10 filas. Tu tarea: mapear cada encabezado a uno de estos campos canónicos:

- date — fecha de la transacción
- description — descripción, concepto, detalle o referencia
- amount — monto único de la transacción (puede ser positivo o negativo)
- debit — débito, retiro, cargo, egreso o salida (cuando hay columnas separadas)
- credit — crédito, depósito, abono, ingreso o entrada (cuando hay columnas separadas)
- merchantNit — NIT, RFC o identificación tributaria del comercio
- ignore — cualquier otra columna (saldo, número de comprobante, sucursal, canal, tipo, etc.)

Reglas:
- Para que un CSV sea válido necesitamos al menos date, description y (amount O (debit y/o credit)).
- amount y (debit/credit) son mutuamente excluyentes: o hay UNA columna de monto, o hay columnas separadas para débito y crédito. Nunca ambos.
- Si tienes duda razonable, prefiere 'ignore' a una asignación incorrecta — bajar confianza es mejor que enviar al usuario datos mal mapeados.
- En 'notes' explica brevemente EN ESPAÑOL por qué un campo tiene baja confianza. Solo incluye notas para campos con confianza < 0.7.

Responde SOLO con JSON válido, sin texto antes ni después, en este formato exacto:

{
  "mapping": { "<encabezado exacto>": "<campo canónico>", ... },
  "confidence": { "date": 0.95, "description": 0.9, ... },
  "overallConfidence": 0.88,
  "notes": [{ "field": "date", "reason": "..." }]
}

Notas:
- 'mapping' debe tener una entrada por cada encabezado que te di, sin agregar ni omitir.
- 'confidence' tiene los campos canónicos como llaves (no los encabezados). Solo incluye los campos que sí mapeaste a algo distinto de 'ignore'.
- 'overallConfidence' es tu confianza global en que el mapeo permitirá una importación exitosa.
- 'notes' es opcional. Omítelo si todos los campos tienen alta confianza.`;

/**
 * Shared sub-schemas — both CSV and prose modes return the same
 * per-canonical-field confidence map + optional notes shape.
 * Extracted as constants so the cache key stays stable when both
 * modes need a tweak in the same release.
 */
const PerFieldConfidenceSchema = z
  .object({
    date: z.number().min(0).max(1).optional(),
    description: z.number().min(0).max(1).optional(),
    amount: z.number().min(0).max(1).optional(),
    debit: z.number().min(0).max(1).optional(),
    credit: z.number().min(0).max(1).optional(),
    merchantNit: z.number().min(0).max(1).optional(),
  })
  .strict();

const NotesSchema = z
  .array(
    z.object({
      field: z.string(),
      reason: z.string(),
    }),
  )
  .optional();

const AiCsvResponseSchema = z.object({
  mapping: z.record(z.string(), z.enum(CANONICAL_FIELDS)),
  confidence: PerFieldConfidenceSchema,
  overallConfidence: z.number().min(0).max(1),
  notes: NotesSchema,
});

/**
 * Tú-register Spanish system prompt for PROSE mode (PDF text input).
 * Same locked-string discipline as the CSV prompt: any change
 * invalidates the prose-mode prompt-cache key.
 */
const SYSTEM_PROMPT_PROSE = `Eres un asistente que extrae las transacciones de un estado de cuenta bancario guatemalteco entregado como texto libre (extraído de un PDF).

Te paso el texto de varias páginas del estado. Tu tarea: identificar cada movimiento (transacción) y devolverlo como una fila estructurada con estos campos:

- date — fecha del movimiento (string, formato natural del documento; por ejemplo "2026-05-21" o "21/05/2026")
- description — descripción, concepto, detalle o referencia (string)
- amount — monto único cuando el estado tiene UNA sola columna de monto (string con el signo si aparece negativo)
- debit — débito / retiro / cargo / egreso cuando el estado tiene columnas separadas
- credit — crédito / depósito / abono / ingreso cuando el estado tiene columnas separadas
- merchantNit — NIT del comercio, cuando esté disponible

Reglas (importantes):
- amount Y (debit/credit) son MUTUAMENTE EXCLUYENTES. Una fila usa amount, O bien debit/credit, nunca ambos.
- date y description son obligatorios para que una fila sea válida.
- Si un campo no está disponible en una fila, déjalo como null (NO inventes valores).
- IGNORA: encabezados de página, pies de página, saldos iniciales/finales, totales, números de cuenta, datos del titular, leyendas legales, números de comprobante sueltos. Solo extrae transacciones.
- Si tienes duda razonable sobre si una línea es una transacción o no, déjala fuera. Es mejor un muestreo limpio que filas ruidosas.
- En 'notes' explica brevemente EN ESPAÑOL cualquier ambigüedad importante (campo con baja confianza, layout difícil, etc.). Solo para campos con confianza < 0.7.
- 'confidence' es por CAMPO CANÓNICO (no por fila): qué tan confiable es cada CAMPO en promedio across las filas.

Responde SOLO con JSON válido, sin texto antes ni después, en este formato exacto:

{
  "rows": [
    { "date": "...", "description": "...", "amount": "...", "debit": null, "credit": null, "merchantNit": null },
    ...
  ],
  "confidence": { "date": 0.95, "description": 0.9, ... },
  "overallConfidence": 0.88,
  "notes": [{ "field": "date", "reason": "..." }]
}

Notas:
- 'rows' es un MUESTREO de hasta 30 filas. Prefiere las primeras transacciones del documento en su orden original.
- 'confidence' solo incluye campos que efectivamente extrajiste (no incluyas campos que nunca aparecieron).
- 'overallConfidence' es tu confianza global en que las filas son fielmente extraídas del documento.
- 'notes' es opcional. Omítelo si todo tiene alta confianza.`;

const AiProseResponseSchema = z.object({
  rows: z.array(
    z.object({
      date: z.string().nullable(),
      description: z.string().nullable(),
      amount: z.string().nullable(),
      debit: z.string().nullable(),
      credit: z.string().nullable(),
      merchantNit: z.string().nullable(),
    }),
  ),
  confidence: PerFieldConfidenceSchema,
  overallConfidence: z.number().min(0).max(1),
  notes: NotesSchema,
});

export interface AiDetectInput {
  headers: string[];
  sampleRows: Record<string, string>[];
}

/**
 * Number of sample rows actually sent to Claude. Bounded so the
 * token spend per import stays predictable regardless of the
 * uploaded file's row count. Ten rows is enough for the model to
 * see real value shapes; more is diminishing returns.
 */
const SAMPLE_ROWS_FOR_AI = 10;

/** Hard cap on response tokens. The schema above fits well under this. */
const MAX_RESPONSE_TOKENS = 800;

export async function aiDetect(input: AiDetectInput): Promise<ExtractorResult> {
  const start = Date.now();

  const userMessage = JSON.stringify({
    headers: input.headers,
    sampleRows: input.sampleRows.slice(0, SAMPLE_ROWS_FOR_AI),
  });

  let response: Anthropic.Message;
  try {
    response = await callClaudeWithRetry({
      model: MODEL_HAIKU,
      max_tokens: MAX_RESPONSE_TOKENS,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT_CSV,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });
  } catch (err) {
    console.warn('[ai-detect:csv] Claude call failed after retries', err);
    return failedResult(start, undefined);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (textBlock?.type !== 'text') {
    console.warn('[ai-detect:csv] no text block in Claude response');
    return failedResult(start, response);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    console.warn('[ai-detect:csv] Claude returned non-JSON text');
    return failedResult(start, response);
  }

  const validated = AiCsvResponseSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn('[ai-detect:csv] schema validation failed', validated.error.issues);
    return failedResult(start, response);
  }

  /*
   * Defense-in-depth: filter the AI's mapping to ONLY headers we
   * actually sent. A hallucinated header — one we never gave Claude —
   * is dropped. This is the "trust the input shape over the model"
   * guarantee from the file-level docblock §3.
   */
  const mapping = filterMappingToKnownHeaders(validated.data.mapping, input.headers);
  const confidence = buildConfidence(validated.data.confidence, validated.data.notes);
  // Re-project the FULL input sample through the AI's mapping — never
  // trust whatever sample shape the AI might invent (guarantee §2).
  const sample = projectCsvSample(input.sampleRows, mapping);

  const trace: ExtractorStepTrace = {
    step: 'ai',
    durationMs: Date.now() - start,
    outcome: 'matched',
    ai: extractAiUsage(response),
  };

  return {
    sample,
    mapping,
    confidence,
    overallConfidence: validated.data.overallConfidence,
    source: 'ai',
    trace: { steps: [trace] },
  };
}

// -----------------------------------------------------------------------------
// Prose mode (Phase L2.3) — PDF text → structured rows directly.
// -----------------------------------------------------------------------------

export interface AiDetectProseInput {
  /** Per-page text from pdf-extract (L2.2). Empty entries skipped. */
  pages: string[];
}

/**
 * Hard caps on what we send to Claude in prose mode, to keep per-
 * import token spend predictable regardless of the uploaded PDF's
 * size. Each constant is pinned by L2.3-companion tests (TBD in
 * L2.8 alongside the pdf-extract tests).
 *
 * At MAX_PAGES_FOR_AI=20 × MAX_CHARS_PER_PAGE=4000 = 80,000 chars
 * input upper bound, plus the system prompt — well within Haiku's
 * 200k context window, and bounded at roughly ~$0.02 per import at
 * Haiku's input pricing (uncached) / cheaper with cache hits.
 *
 * Edge case: PDFs longer than MAX_PAGES_FOR_AI lose late-page
 * transactions from the sample. Documented limitation; revisit
 * when we see real-world overflow.
 */
const MAX_PAGES_FOR_AI = 20;
const MAX_CHARS_PER_PAGE = 4000;
const MAX_RESPONSE_TOKENS_PROSE = 4000;
const MAX_ROWS_FROM_AI = 30;

export async function aiDetectProse(input: AiDetectProseInput): Promise<ExtractorResult> {
  const start = Date.now();

  /*
   * Truncate per-page text, drop empty pages, cap page count. The
   * AI prompt explicitly asks for first-N rows — order matters,
   * so we feed pages in document order without reshuffling.
   */
  const trimmedPages = input.pages
    .slice(0, MAX_PAGES_FOR_AI)
    .map((p) => p.trim().slice(0, MAX_CHARS_PER_PAGE))
    .filter((p) => p.length > 0);

  if (trimmedPages.length === 0) {
    /*
     * Zero usable text — probably an image-only / scanned PDF. The
     * L2.6 route layer also catches this (`pages.every(p => p.trim()
     * === '')`); the duplicate-guard here is intentional so this
     * function never wastes a Claude call on guaranteed-empty input.
     */
    return failedResult(start, undefined);
  }

  const userMessage = JSON.stringify({ pages: trimmedPages });

  let response: Anthropic.Message;
  try {
    response = await callClaudeWithRetry({
      model: MODEL_HAIKU,
      max_tokens: MAX_RESPONSE_TOKENS_PROSE,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT_PROSE,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    console.warn('[ai-detect:prose] Claude call failed after retries', err);
    return failedResult(start, undefined);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (textBlock?.type !== 'text') {
    console.warn('[ai-detect:prose] no text block in Claude response');
    return failedResult(start, response);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    console.warn('[ai-detect:prose] Claude returned non-JSON text');
    return failedResult(start, response);
  }

  const validated = AiProseResponseSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn('[ai-detect:prose] schema validation failed', validated.error.issues);
    return failedResult(start, response);
  }

  /*
   * Cap rows to MAX_ROWS_FROM_AI regardless of what the AI returned.
   * The prompt asks for ≤30 but defense-in-depth: a verbose model
   * doesn't get to blow up the wizard's preview table.
   */
  const sample = validated.data.rows.slice(0, MAX_ROWS_FROM_AI);
  const confidence = buildConfidence(validated.data.confidence, validated.data.notes);

  const trace: ExtractorStepTrace = {
    step: 'ai',
    durationMs: Date.now() - start,
    outcome: 'matched',
    ai: extractAiUsage(response),
  };

  return {
    sample,
    // No mapping / detectedBank in prose mode — these are CSV-only
    // fields, intentionally left absent so the wizard can branch on
    // `mapping === undefined` (per L1.1 types docblock).
    confidence,
    overallConfidence: validated.data.overallConfidence,
    source: 'ai',
    trace: { steps: [trace] },
  };
}

// -----------------------------------------------------------------------------
// Shared internals.
// -----------------------------------------------------------------------------

function failedResult(start: number, response: Anthropic.Message | undefined): ExtractorResult {
  const trace: ExtractorStepTrace = {
    step: 'ai',
    durationMs: Date.now() - start,
    outcome: 'failed',
    ...(response ? { ai: extractAiUsage(response) } : {}),
  };
  return {
    sample: [],
    confidence: {},
    overallConfidence: 0,
    source: 'ai',
    trace: { steps: [trace] },
  };
}

function extractAiUsage(response: Anthropic.Message): NonNullable<ExtractorStepTrace['ai']> {
  const cacheRead = response.usage.cache_read_input_tokens;
  const cacheWrite = response.usage.cache_creation_input_tokens;
  return {
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    ...(cacheRead != null ? { cacheReadTokens: cacheRead } : {}),
    ...(cacheWrite != null ? { cacheWriteTokens: cacheWrite } : {}),
  };
}

function filterMappingToKnownHeaders(
  mapping: Record<string, CanonicalField>,
  headers: string[],
): ColumnMapping {
  const known = new Set(headers);
  const result: ColumnMapping = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (known.has(header)) result[header] = field;
  }
  return result;
}

type AiConfidenceBlock = z.infer<typeof PerFieldConfidenceSchema>;
type AiNotesBlock = z.infer<typeof NotesSchema>;

function buildConfidence(
  confidence: AiConfidenceBlock,
  notes: AiNotesBlock,
): Partial<Record<CanonicalField, ColumnConfidence>> {
  const reasonMap = new Map<string, string>();
  if (notes) {
    for (const note of notes) reasonMap.set(note.field, note.reason);
  }
  const result: Partial<Record<CanonicalField, ColumnConfidence>> = {};
  for (const [field, score] of Object.entries(confidence)) {
    if (typeof score !== 'number') continue;
    const reason = reasonMap.get(field);
    result[field as CanonicalField] = reason ? { score, reason } : { score };
  }
  return result;
}
