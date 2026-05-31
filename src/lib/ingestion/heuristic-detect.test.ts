/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  GENERIC_PER_COLUMN_CONFIDENCE,
  SIGNATURE_PER_COLUMN_CONFIDENCE,
  heuristicDetect,
} from './heuristic-detect';

/*
 * Pins the constants + signature-match logic + sample projection that
 * heuristic-detect.ts owns. L1.6 mocks the heuristic entirely and
 * therefore cannot pin these — this file is the honest test.
 *
 * No real bank samples needed: the legacy column-detect.ts already
 * recognizes BAC / Banco Industrial layouts from public-knowledge
 * header lists, so synthetic-header fixtures here are sufficient.
 */

const BAC_HEADERS = ['Fecha', 'Concepto', 'Debito', 'Credito', 'Saldo'];
const BANCO_INDUSTRIAL_HEADERS = ['Fecha', 'Descripcion', 'Retiro', 'Deposito', 'Saldo'];
const GENERIC_HEADERS = ['Movimiento', 'Detalle', 'Monto'];
const ALL_IGNORE_HEADERS = ['Sucursal', 'Tipo', 'Canal'];
const EMPTY_HEADERS: string[] = [];

const SAMPLE_BAC: Record<string, string>[] = [
  { Fecha: '2026-05-01', Concepto: 'COMPRA', Debito: '100.00', Credito: '', Saldo: '900' },
  { Fecha: '2026-05-02', Concepto: 'DEPOSITO', Debito: '', Credito: '200.00', Saldo: '1100' },
];

describe('heuristicDetect — pinned constants', () => {
  /*
   * If these constants change, the orchestrator's AI-escalation
   * rate (and therefore the per-import Anthropic spend) shifts
   * silently. Pin them.
   */
  it('SIGNATURE_PER_COLUMN_CONFIDENCE === 1.0', () => {
    expect(SIGNATURE_PER_COLUMN_CONFIDENCE).toBe(1.0);
  });

  it('GENERIC_PER_COLUMN_CONFIDENCE === 0.7', () => {
    expect(GENERIC_PER_COLUMN_CONFIDENCE).toBe(0.7);
  });
});

describe('heuristicDetect — bank-signature matches', () => {
  it('BAC headers → overallConfidence 1.0, detectedBank BAC, source heuristic', () => {
    const result = heuristicDetect({ headers: BAC_HEADERS, sampleRows: [] });

    expect(result.overallConfidence).toBe(1);
    expect(result.detectedBank).toBe('BAC');
    expect(result.source).toBe('heuristic');
    // Per-canonical-field confidence at signature level (1.0).
    expect(result.confidence.date?.score).toBe(SIGNATURE_PER_COLUMN_CONFIDENCE);
    expect(result.confidence.description?.score).toBe(SIGNATURE_PER_COLUMN_CONFIDENCE);
    expect(result.confidence.debit?.score).toBe(SIGNATURE_PER_COLUMN_CONFIDENCE);
    expect(result.confidence.credit?.score).toBe(SIGNATURE_PER_COLUMN_CONFIDENCE);
  });

  it('Banco Industrial headers → overallConfidence 1.0, detectedBank BANCO_INDUSTRIAL', () => {
    const result = heuristicDetect({ headers: BANCO_INDUSTRIAL_HEADERS, sampleRows: [] });

    expect(result.overallConfidence).toBe(1);
    expect(result.detectedBank).toBe('BANCO_INDUSTRIAL');
    expect(result.source).toBe('heuristic');
  });

  it('signature-match trace outcome is matched (at least one canonical field found)', () => {
    const result = heuristicDetect({ headers: BAC_HEADERS, sampleRows: [] });
    expect(result.trace.steps[0]?.step).toBe('heuristic');
    expect(result.trace.steps[0]?.outcome).toBe('matched');
  });
});

describe('heuristicDetect — generic keyword fallback', () => {
  it('generic-recognized headers → per-column confidence 0.7, detectedBank GENERIC', () => {
    const result = heuristicDetect({ headers: GENERIC_HEADERS, sampleRows: [] });

    expect(result.detectedBank).toBe('GENERIC');
    expect(result.source).toBe('heuristic');
    /*
     * "Movimiento" matches `date` via the operacion-includes regex,
     * "Detalle" → description, "Monto" → amount. Each gets the
     * generic per-column confidence (0.7) since no bank signature
     * matched the layout overall.
     */
    expect(result.confidence.description?.score).toBe(GENERIC_PER_COLUMN_CONFIDENCE);
    expect(result.confidence.amount?.score).toBe(GENERIC_PER_COLUMN_CONFIDENCE);
    // The overall confidence in generic mode is a fraction of non-ignore
    // hits, NOT the per-column constant.
    expect(result.overallConfidence).toBeGreaterThan(0);
    expect(result.overallConfidence).toBeLessThanOrEqual(1);
  });
});

describe('heuristicDetect — defensive paths', () => {
  it('all-ignore headers → outcome fallback (no canonical field identified)', () => {
    const result = heuristicDetect({ headers: ALL_IGNORE_HEADERS, sampleRows: [] });

    expect(result.trace.steps[0]?.outcome).toBe('fallback');
    expect(Object.keys(result.confidence)).toHaveLength(0);
  });

  it('empty headers → overallConfidence 0, outcome fallback', () => {
    const result = heuristicDetect({ headers: EMPTY_HEADERS, sampleRows: [] });

    expect(result.overallConfidence).toBe(0);
    expect(result.trace.steps[0]?.outcome).toBe('fallback');
    expect(result.sample).toEqual([]);
  });
});

describe('heuristicDetect — sample projection', () => {
  it('projects source rows into canonical-field shape via the BAC mapping', () => {
    const result = heuristicDetect({ headers: BAC_HEADERS, sampleRows: SAMPLE_BAC });

    expect(result.sample).toHaveLength(2);
    expect(result.sample[0]?.date).toBe('2026-05-01');
    expect(result.sample[0]?.description).toBe('COMPRA');
    expect(result.sample[0]?.debit).toBe('100.00');
    // "Saldo" is ignored — never appears in canonical-field-keyed output.
    expect(result.sample[0]?.amount).toBeNull();
  });
});
