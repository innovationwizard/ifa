/**
 * @vitest-environment node
 */
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    supabaseServiceRoleKey: 'unused-in-this-suite',
    databaseUrl: 'unused-in-this-suite',
    directUrl: 'unused-in-this-suite',
    anthropicApiKey: 'sk-ant-test-fake-key',
  }),
}));

/*
 * Mock the orchestrator's collaborators. The orchestrator under test
 * is a small pure chain; we drive each step's return value per-test
 * and pin the chain behavior (skip AI / escalate to AI / merge
 * traces / propagate failed; PDF: pdf-extract → AI prose merge).
 */
vi.mock('./heuristic-detect', () => ({
  heuristicDetect: vi.fn(),
}));
vi.mock('./ai-detect', () => ({
  aiDetect: vi.fn(),
  aiDetectProse: vi.fn(),
}));
vi.mock('./pdf-extract', () => ({
  extractPdfText: vi.fn(),
}));

import { heuristicDetect } from './heuristic-detect';
import { aiDetect, aiDetectProse } from './ai-detect';
import { extractPdfText } from './pdf-extract';
import {
  HEURISTIC_CONFIDENCE_THRESHOLD,
  extractFromCsv,
  extractFromPdf,
  type ExtractFromCsvInput,
} from './extractor';
import type { ExtractorResult } from './types';

type HeuristicMock = Mock<(input: ExtractFromCsvInput) => ExtractorResult>;
type AiMock = Mock<(input: ExtractFromCsvInput) => Promise<ExtractorResult>>;
type AiProseMock = Mock<(input: { pages: string[] }) => Promise<ExtractorResult>>;
type PdfExtractMock = Mock<
  (buffer: Uint8Array) => Promise<{ pages: string[]; totalPages: number; durationMs: number }>
>;
const heuristicMock = heuristicDetect as unknown as HeuristicMock;
const aiMock = aiDetect as unknown as AiMock;
const aiProseMock = aiDetectProse as unknown as AiProseMock;
const pdfExtractMock = extractPdfText as unknown as PdfExtractMock;

function fakeHeuristicResult(overrides: Partial<ExtractorResult> = {}): ExtractorResult {
  return {
    sample: [],
    mapping: { Fecha: 'date' },
    detectedBank: 'GENERIC',
    confidence: { date: { score: 0.7 } },
    overallConfidence: 0.7,
    source: 'heuristic',
    trace: {
      steps: [{ step: 'heuristic', durationMs: 1, outcome: 'matched' }],
    },
    ...overrides,
  };
}

function fakeAiResult(overrides: Partial<ExtractorResult> = {}): ExtractorResult {
  return {
    sample: [],
    mapping: { Fecha: 'date', Concepto: 'description', Movimiento: 'amount' },
    confidence: {
      date: { score: 0.95 },
      description: { score: 0.92 },
      amount: { score: 0.9 },
    },
    overallConfidence: 0.92,
    source: 'ai',
    trace: {
      steps: [
        {
          step: 'ai',
          durationMs: 1234,
          outcome: 'matched',
          ai: { model: 'claude-haiku-4-5-20251001', inputTokens: 200, outputTokens: 80 },
        },
      ],
    },
    ...overrides,
  };
}

const INPUT: ExtractFromCsvInput = {
  headers: ['Fecha', 'Concepto', 'Movimiento'],
  sampleRows: [{ Fecha: '2026-05-01', Concepto: 'PAGO', Movimiento: '-100' }],
};

beforeEach(() => {
  heuristicMock.mockReset();
  aiMock.mockReset();
  aiProseMock.mockReset();
  pdfExtractMock.mockReset();
});

describe('extractFromCsv — heuristic-confident path', () => {
  it('returns the heuristic result and does NOT call AI when overallConfidence >= threshold', async () => {
    heuristicMock.mockReturnValue(fakeHeuristicResult({ overallConfidence: 0.95 }));

    const result = await extractFromCsv(INPUT);

    expect(result.source).toBe('heuristic');
    expect(result.overallConfidence).toBe(0.95);
    expect(aiMock).not.toHaveBeenCalled();
    expect(result.trace.steps).toHaveLength(1);
    expect(result.trace.steps[0]?.step).toBe('heuristic');
  });
});

describe('extractFromCsv — AI-fallback path', () => {
  it('calls AI when heuristic overallConfidence is below threshold', async () => {
    heuristicMock.mockReturnValue(fakeHeuristicResult({ overallConfidence: 0.5 }));
    aiMock.mockResolvedValue(fakeAiResult({ overallConfidence: 0.9 }));

    const result = await extractFromCsv(INPUT);

    expect(aiMock).toHaveBeenCalledWith(INPUT);
    expect(result.source).toBe('ai');
    expect(result.overallConfidence).toBe(0.9);
  });

  it('merges traces: heuristic step prepended to AI step', async () => {
    heuristicMock.mockReturnValue(fakeHeuristicResult({ overallConfidence: 0.5 }));
    aiMock.mockResolvedValue(fakeAiResult({ overallConfidence: 0.92 }));

    const result = await extractFromCsv(INPUT);

    expect(result.trace.steps).toHaveLength(2);
    expect(result.trace.steps[0]?.step).toBe('heuristic');
    expect(result.trace.steps[1]?.step).toBe('ai');
  });

  it('propagates the failed AI result without throwing (ai-detect locked guarantee §1)', async () => {
    heuristicMock.mockReturnValue(fakeHeuristicResult({ overallConfidence: 0.4 }));
    aiMock.mockResolvedValue(
      fakeAiResult({
        overallConfidence: 0,
        sample: [],
        confidence: {},
        trace: {
          steps: [{ step: 'ai', durationMs: 50, outcome: 'failed' }],
        },
      }),
    );

    const result = await extractFromCsv(INPUT);

    expect(result.overallConfidence).toBe(0);
    expect(result.source).toBe('ai');
    expect(result.trace.steps.at(-1)?.outcome).toBe('failed');
    // Heuristic step still recorded in the trace for ops visibility.
    expect(result.trace.steps[0]?.step).toBe('heuristic');
  });
});

describe('extractFromCsv — confidence threshold boundary (HEURISTIC_CONFIDENCE_THRESHOLD === 0.9)', () => {
  /*
   * The threshold is `>= 0.9`. Pin the three boundary cases so a
   * future tweak surfaces as a test failure rather than silently
   * shifting AI-escalation rate (and per-import Anthropic spend).
   */
  it('skips AI at exactly threshold (0.9)', async () => {
    heuristicMock.mockReturnValue(fakeHeuristicResult({ overallConfidence: 0.9 }));

    await extractFromCsv(INPUT);

    expect(aiMock).not.toHaveBeenCalled();
  });

  it('calls AI just below threshold (0.89)', async () => {
    heuristicMock.mockReturnValue(fakeHeuristicResult({ overallConfidence: 0.89 }));
    aiMock.mockResolvedValue(fakeAiResult());

    await extractFromCsv(INPUT);

    expect(aiMock).toHaveBeenCalledTimes(1);
  });

  it('pins HEURISTIC_CONFIDENCE_THRESHOLD === 0.9 (exported constant)', () => {
    expect(HEURISTIC_CONFIDENCE_THRESHOLD).toBe(0.9);
  });
});

// ----------------------------------------------------------------------------
// extractFromPdf (Phase L2.4) — pin the pdf-extract → AI-prose chain.
// ----------------------------------------------------------------------------

const PDF_BUFFER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

function fakeAiProseResult(overrides: Partial<ExtractorResult> = {}): ExtractorResult {
  return {
    sample: [
      {
        date: '2026-05-21',
        description: 'PAGO',
        amount: '-100.00',
        debit: null,
        credit: null,
        merchantNit: null,
      },
    ],
    confidence: { date: { score: 0.9 } },
    overallConfidence: 0.85,
    source: 'ai',
    trace: {
      steps: [
        {
          step: 'ai',
          durationMs: 1500,
          outcome: 'matched',
          ai: { model: 'claude-haiku-4-5-20251001', inputTokens: 300, outputTokens: 120 },
        },
      ],
    },
    ...overrides,
  };
}

describe('extractFromPdf — happy path', () => {
  it('chains pdf-extract → ai-prose and merges traces [pdf, ...ai]', async () => {
    pdfExtractMock.mockResolvedValue({
      pages: ['page 1 text', 'page 2 text'],
      totalPages: 2,
      durationMs: 120,
    });
    aiProseMock.mockResolvedValue(fakeAiProseResult());

    const result = await extractFromPdf(PDF_BUFFER);

    expect(pdfExtractMock).toHaveBeenCalledWith(PDF_BUFFER);
    expect(aiProseMock).toHaveBeenCalledWith({ pages: ['page 1 text', 'page 2 text'] });
    expect(result.trace.steps).toHaveLength(2);
    expect(result.trace.steps[0]?.step).toBe('pdf');
    expect(result.trace.steps[0]?.durationMs).toBe(120);
    expect(result.trace.steps[0]?.outcome).toBe('matched');
    expect(result.trace.steps[1]?.step).toBe('ai');
    expect(result.source).toBe('ai');
    expect(result.sample).toHaveLength(1);
  });
});

describe('extractFromPdf — empty-pages signal (image-only / scanned PDF)', () => {
  it("pdf step outcome is 'fallback' when every page is empty after trimming", async () => {
    pdfExtractMock.mockResolvedValue({
      pages: ['', '   ', '\n\n'],
      totalPages: 3,
      durationMs: 50,
    });
    /*
     * aiDetectProse self-short-circuits on all-empty input and
     * returns a failed result without a Claude call — pin that
     * downstream behavior here via the mock.
     */
    aiProseMock.mockResolvedValue(
      fakeAiProseResult({
        sample: [],
        confidence: {},
        overallConfidence: 0,
        trace: { steps: [{ step: 'ai', durationMs: 1, outcome: 'failed' }] },
      }),
    );

    const result = await extractFromPdf(PDF_BUFFER);

    expect(result.trace.steps[0]?.outcome).toBe('fallback');
    expect(result.trace.steps[1]?.outcome).toBe('failed');
    expect(result.overallConfidence).toBe(0);
    expect(result.sample).toEqual([]);
  });

  it("pdf step outcome is 'matched' when AT LEAST ONE page has non-empty text", async () => {
    pdfExtractMock.mockResolvedValue({
      pages: ['', 'real text', ''],
      totalPages: 3,
      durationMs: 50,
    });
    aiProseMock.mockResolvedValue(fakeAiProseResult());

    const result = await extractFromPdf(PDF_BUFFER);

    expect(result.trace.steps[0]?.outcome).toBe('matched');
  });
});

describe('extractFromPdf — locked contract: pdf-extract errors propagate (route catches)', () => {
  /*
   * Mirrors pdf-extract.test.ts's locked-contract suite at the
   * orchestrator level. If a future refactor wraps the
   * pdf-extract call in a try/catch here, this test catches it —
   * the L2.6 route relies on the throw to map to user-facing
   * `pdf_extract_failed` copy.
   */
  it('re-throws when extractPdfText throws (corrupt / encrypted / non-PDF)', async () => {
    pdfExtractMock.mockRejectedValue(new Error('Invalid PDF structure'));

    await expect(extractFromPdf(PDF_BUFFER)).rejects.toThrow('Invalid PDF structure');
    expect(aiProseMock).not.toHaveBeenCalled();
  });

  it('preserves the original Error instance', async () => {
    const original = new TypeError('Password-protected PDF');
    pdfExtractMock.mockRejectedValue(original);

    await expect(extractFromPdf(PDF_BUFFER)).rejects.toBe(original);
  });
});
