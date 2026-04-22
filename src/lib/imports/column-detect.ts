/**
 * CSV column detection for bank-statement imports (S-3.5).
 *
 * Bank-statement CSVs from BAC Credomatic and Banco Industrial (the
 * two most common in Guatemala) have stable column headers we can
 * recognize by signature. For anything else, fall back to per-header
 * keyword heuristics. The output is a mapping from each CSV column
 * name to one of the canonical fields the import pipeline knows how
 * to handle, plus a confidence score the UI can use to decide
 * whether to surface a "confirm the mapping" step.
 *
 * Multi-format readiness (PDF, XLS, OFX, QIF) is the next story per
 * scaffolding §10.4.1 and the Holy Grail memory. CSV-only here is
 * deliberate MVP scope.
 */

export type CanonicalField =
  | 'date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'merchantNit'
  | 'ignore';

export type DetectedBank = 'BAC' | 'BANCO_INDUSTRIAL' | 'GENERIC';

export type ColumnMapping = Record<string, CanonicalField>;

export interface DetectionResult {
  mapping: ColumnMapping;
  detectedBank: DetectedBank;
  /** 0..1 heuristic — 1 when we recognize the bank by signature. */
  confidence: number;
}

const BAC_KEYS = ['fecha', 'concepto', 'debito', 'credito'];
const BANCO_INDUSTRIAL_KEYS = ['fecha', 'descripcion', 'retiro', 'deposito'];

const KEYWORD_PATTERNS: Record<Exclude<CanonicalField, 'ignore'>, RegExp[]> = {
  date: [/^fecha/, /^date$/, /^dia$/, /operacion/],
  description: [/^(concepto|descripci[óo]n|detalle|ref(erencia)?|motivo)/, /^descr/],
  amount: [/^(monto|valor|importe|amount|total)$/],
  debit: [/^(d[ée]bito|debit|retiro|cargo|egreso|salida)/],
  credit: [/^(cr[ée]dito|credit|dep[óo]sito|abono|ingreso|entrada)/],
  merchantNit: [/^(nit|rfc|identificaci[óo]n|tax\s*id)/],
};

const IGNORE_PATTERNS = [
  /^saldo/,
  /^balance/,
  /^tipo/,
  /^canal/,
  /^sucursal/,
  /^comprobante/,
  /^numero/,
  /^referencia/,
];

/**
 * Normalize a header for case/accent-insensitive comparison.
 * "Fecha Operación" → "fecha operacion"
 */
function normalize(s: string): string {
  return s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function signatureMatches(normalizedHeaders: string[], keys: string[]): boolean {
  return keys.every((key) => normalizedHeaders.some((h) => h.includes(key)));
}

function classifyHeader(header: string): CanonicalField {
  const n = normalize(header);
  if (IGNORE_PATTERNS.some((p) => p.test(n))) return 'ignore';
  for (const [field, patterns] of Object.entries(KEYWORD_PATTERNS) as [
    Exclude<CanonicalField, 'ignore'>,
    RegExp[],
  ][]) {
    if (patterns.some((p) => p.test(n))) return field;
  }
  return 'ignore';
}

export function detectColumns(headers: string[]): DetectionResult {
  const normalized = headers.map(normalize);

  /*
   * Bank-signature recognition comes before the generic fallback —
   * when a CSV looks like BAC or Banco Industrial, we can set
   * confidence to 1 without second-guessing individual column
   * interpretations.
   */
  if (signatureMatches(normalized, BAC_KEYS)) {
    return {
      mapping: buildMappingPerHeader(headers),
      detectedBank: 'BAC',
      confidence: 1,
    };
  }
  if (signatureMatches(normalized, BANCO_INDUSTRIAL_KEYS)) {
    return {
      mapping: buildMappingPerHeader(headers),
      detectedBank: 'BANCO_INDUSTRIAL',
      confidence: 1,
    };
  }

  /*
   * Generic fallback — per-header keyword match. Confidence reflects
   * how many headers landed on a non-`ignore` field vs total.
   * Zero non-ignore hits → confidence 0 (caller should ask user to
   * map manually).
   */
  const mapping = buildMappingPerHeader(headers);
  const nonIgnore = Object.values(mapping).filter((f) => f !== 'ignore').length;
  const confidence = headers.length === 0 ? 0 : nonIgnore / headers.length;
  return { mapping, detectedBank: 'GENERIC', confidence };
}

function buildMappingPerHeader(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const h of headers) {
    mapping[h] = classifyHeader(h);
  }
  return mapping;
}

/**
 * Sanity-check that a mapping can produce a valid Transaction:
 * requires at least `date`, `description`, and either `amount` OR a
 * (`debit` and/or `credit`) pair. Returns the missing field names so
 * the UI can show a helpful error.
 */
export function validateMapping(mapping: ColumnMapping): {
  ok: boolean;
  missing: string[];
} {
  const fields = new Set(Object.values(mapping));
  const missing: string[] = [];
  if (!fields.has('date')) missing.push('date');
  if (!fields.has('description')) missing.push('description');
  const hasAmount = fields.has('amount');
  const hasDebitOrCredit = fields.has('debit') || fields.has('credit');
  if (!hasAmount && !hasDebitOrCredit) missing.push('amount');
  return { ok: missing.length === 0, missing };
}
