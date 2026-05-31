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
 * AI-assisted CSV column detector (Phase L1.3).
 *
 * The heuristic detector (L1.2) handles the well-known bank layouts.
 * When confidence is low — non-standard headers, an unfamiliar bank,
 * weird casing/Spanish variants — the orchestrator (L1.4) escalates
 * here. We send Claude Haiku the headers + the first 10 sample rows
 * with a tú-register Spanish system prompt and ask for a mapping +
 * per-field confidence + optional notes.
 *
 * Locked guarantees (load-bearing — don't silently weaken):
 *
 *   1. Defensive failure. ANY failure (Claude error, non-JSON text,
 *      schema mismatch) returns a `failed` `ExtractorResult` with
 *      `overallConfidence = 0`. We NEVER throw — the orchestrator's
 *      contract is that ai-detect always returns a result, and the
 *      wizard can decide what to do with low confidence.
 *
 *   2. Sample projection is canonical. Even on success we re-project
 *      the FULL input `sampleRows` through `projectCsvSample` using
 *      the AI's mapping — we do NOT trust whatever sample shape the
 *      AI might return. This pins the wizard's preview to the
 *      caller's actual data and lets the AI's job be narrow:
 *      "identify columns".
 *
 *   3. The mapping is filtered to known headers before use. If the
 *      AI hallucinates a header we didn't send, that entry is
 *      dropped — never written into the returned `ColumnMapping`.
 *
 *   4. Cost telemetry comes from `callClaudeWithRetry` (B2 wrapper)
 *      which logs a structured `claude.usage` line; we additionally
 *      surface the same fields in the trace's `ai` block so per-
 *      import token spend is greppable from a single record.
 *
 *   5. Prompt caching. The system prompt is wrapped in a
 *      `cache_control: ephemeral` block so the prefix tokens get
 *      cached across imports — the second-and-onward import in a
 *      5-min window pays cache-read pricing for the system prompt,
 *      not full input pricing.
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
 * Tú-register Spanish system prompt. Locked content: a change to the
 * field list, response format, or rules invalidates the prompt cache
 * key so KEEP THE STRING STABLE. Edit only when the underlying
 * semantics actually change.
 */
const SYSTEM_PROMPT = `Eres un asistente que identifica las columnas de un archivo CSV de un banco guatemalteco.

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

const AiResponseSchema = z.object({
  mapping: z.record(z.string(), z.enum(CANONICAL_FIELDS)),
  confidence: z
    .object({
      date: z.number().min(0).max(1).optional(),
      description: z.number().min(0).max(1).optional(),
      amount: z.number().min(0).max(1).optional(),
      debit: z.number().min(0).max(1).optional(),
      credit: z.number().min(0).max(1).optional(),
      merchantNit: z.number().min(0).max(1).optional(),
    })
    .strict(),
  overallConfidence: z.number().min(0).max(1),
  notes: z
    .array(
      z.object({
        field: z.string(),
        reason: z.string(),
      }),
    )
    .optional(),
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
          text: SYSTEM_PROMPT,
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
    console.warn('[ai-detect] Claude call failed after retries', err);
    return failedResult(start, undefined);
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (textBlock?.type !== 'text') {
    console.warn('[ai-detect] no text block in Claude response');
    return failedResult(start, response);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    console.warn('[ai-detect] Claude returned non-JSON text');
    return failedResult(start, response);
  }

  const validated = AiResponseSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn('[ai-detect] schema validation failed', validated.error.issues);
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

type AiConfidenceBlock = z.infer<typeof AiResponseSchema>['confidence'];
type AiNotesBlock = z.infer<typeof AiResponseSchema>['notes'];

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
