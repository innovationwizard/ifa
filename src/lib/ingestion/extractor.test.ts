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
 * Mock BOTH extractors. The orchestrator under test is a 30-line
 * pure chain; we drive each step's return value per-test and pin
 * the chain behavior (skip AI / escalate to AI / merge traces /
 * propagate failed).
 */
vi.mock('./heuristic-detect', () => ({
  heuristicDetect: vi.fn(),
}));
vi.mock('./ai-detect', () => ({
  aiDetect: vi.fn(),
}));

import { heuristicDetect } from './heuristic-detect';
import { aiDetect } from './ai-detect';
import {
  HEURISTIC_CONFIDENCE_THRESHOLD,
  extractFromCsv,
  type ExtractFromCsvInput,
} from './extractor';
import type { ExtractorResult } from './types';

type HeuristicMock = Mock<(input: ExtractFromCsvInput) => ExtractorResult>;
type AiMock = Mock<(input: ExtractFromCsvInput) => Promise<ExtractorResult>>;
const heuristicMock = heuristicDetect as unknown as HeuristicMock;
const aiMock = aiDetect as unknown as AiMock;

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
