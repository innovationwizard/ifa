/**
 * @vitest-environment node
 */
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

/*
 * Shim @/lib/env so the Claude wrapper's module-level env validation
 * (which loads when ai-detect transitively imports the wrapper)
 * doesn't trip during tests.
 */
vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    supabaseServiceRoleKey: 'unused-in-this-suite',
    databaseUrl: 'unused-in-this-suite',
    directUrl: 'unused-in-this-suite',
    anthropicApiKey: 'sk-ant-test-fake-key',
  }),
}));

/*
 * Stub the Claude wrapper. Each test sets the resolved/rejected
 * value via `callClaudeMock` so the AI-detect logic is exercised
 * in isolation from the real Anthropic SDK.
 */
vi.mock('@/lib/ai/claude', () => ({
  MODEL_HAIKU: 'claude-haiku-4-5-20251001',
  MODEL_OPUS: 'claude-opus-4-7',
  callClaudeWithRetry: vi.fn(),
}));

import { callClaudeWithRetry } from '@/lib/ai/claude';
import { aiDetect } from './ai-detect';

type CallClaudeMock = Mock<(req: unknown) => Promise<Anthropic.Message>>;
const callClaudeMock = callClaudeWithRetry as unknown as CallClaudeMock;

function fakeClaudeResponse(text: string): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-4-5-20251001',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 200,
      output_tokens: 80,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

const HEADERS_SAMPLE = ['Fecha Op', 'Concepto', 'Movimiento', 'Saldo'];
const ROWS_SAMPLE: Record<string, string>[] = [
  {
    'Fecha Op': '2026-05-01',
    Concepto: 'PAGO SUPERMERCADO',
    Movimiento: '-150.00',
    Saldo: '1850.00',
  },
  {
    'Fecha Op': '2026-05-02',
    Concepto: 'DEPOSITO',
    Movimiento: '+500.00',
    Saldo: '2350.00',
  },
];

beforeEach(() => {
  callClaudeMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {
    /* silence defensive logging during tests */
  });
});

describe('aiDetect — happy path', () => {
  it('returns ExtractorResult with mapping + per-field confidence + projected sample', async () => {
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse(
        JSON.stringify({
          mapping: {
            'Fecha Op': 'date',
            Concepto: 'description',
            Movimiento: 'amount',
            Saldo: 'ignore',
          },
          confidence: {
            date: 0.95,
            description: 0.92,
            amount: 0.9,
          },
          overallConfidence: 0.92,
        }),
      ),
    );

    const result = await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: ROWS_SAMPLE });

    expect(result.source).toBe('ai');
    expect(result.overallConfidence).toBe(0.92);
    expect(result.mapping).toEqual({
      'Fecha Op': 'date',
      Concepto: 'description',
      Movimiento: 'amount',
      Saldo: 'ignore',
    });
    expect(result.confidence.date?.score).toBe(0.95);
    expect(result.confidence.description?.score).toBe(0.92);
    expect(result.confidence.amount?.score).toBe(0.9);
    // Projected sample uses canonical-field keys.
    expect(result.sample).toHaveLength(2);
    expect(result.sample[0]?.date).toBe('2026-05-01');
    expect(result.sample[0]?.description).toBe('PAGO SUPERMERCADO');
    expect(result.sample[0]?.amount).toBe('-150.00');
    expect(result.trace.steps[0]?.outcome).toBe('matched');
    expect(result.trace.steps[0]?.ai?.model).toBe('claude-haiku-4-5-20251001');
  });

  it('attaches per-field reason from notes when present', async () => {
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse(
        JSON.stringify({
          mapping: {
            'Fecha Op': 'date',
            Concepto: 'description',
            Movimiento: 'amount',
            Saldo: 'ignore',
          },
          confidence: { date: 0.95, description: 0.6, amount: 0.9 },
          overallConfidence: 0.78,
          notes: [
            {
              field: 'description',
              reason: 'El encabezado "Concepto" es ambiguo; podría ser referencia.',
            },
          ],
        }),
      ),
    );

    const result = await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: ROWS_SAMPLE });
    expect(result.confidence.description?.reason).toContain('ambiguo');
  });
});

describe('aiDetect — request shape', () => {
  it('sends MODEL_HAIKU + cache_control: ephemeral on the system prompt', async () => {
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse(
        JSON.stringify({
          mapping: {
            'Fecha Op': 'date',
            Concepto: 'description',
            Movimiento: 'amount',
            Saldo: 'ignore',
          },
          confidence: { date: 0.95, description: 0.9, amount: 0.9 },
          overallConfidence: 0.92,
        }),
      ),
    );

    await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: ROWS_SAMPLE });

    expect(callClaudeMock).toHaveBeenCalledTimes(1);
    const req = callClaudeMock.mock.calls[0]?.[0] as {
      model: string;
      system: { type: string; text: string; cache_control?: { type: string } }[];
    };
    expect(req.model).toBe('claude-haiku-4-5-20251001');
    expect(req.system[0]?.cache_control?.type).toBe('ephemeral');
  });

  it('caps the sample sent to Claude at 10 rows regardless of input size', async () => {
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse(
        JSON.stringify({
          mapping: {
            'Fecha Op': 'date',
            Concepto: 'description',
            Movimiento: 'amount',
            Saldo: 'ignore',
          },
          confidence: { date: 0.95, description: 0.9, amount: 0.9 },
          overallConfidence: 0.92,
        }),
      ),
    );

    /*
     * Feed 50 rows; verify the AI saw only 10. Pins
     * `SAMPLE_ROWS_FOR_AI` so per-import token spend stays
     * predictable regardless of uploaded file size.
     */
    const manyRows = Array.from({ length: 50 }, (_, i) => ({
      'Fecha Op': `2026-05-${(i + 1).toString().padStart(2, '0')}`,
      Concepto: `TX ${i.toString()}`,
      Movimiento: '0',
      Saldo: '0',
    }));

    await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: manyRows });

    const req = callClaudeMock.mock.calls[0]?.[0] as {
      messages: { role: string; content: string }[];
    };
    const userMessage = JSON.parse(req.messages[0]?.content ?? '{}') as {
      sampleRows: unknown[];
    };
    expect(userMessage.sampleRows).toHaveLength(10);
  });
});

describe('aiDetect — defensive failure (locked guarantee §1: never throws)', () => {
  it('returns failed result when Claude call rejects', async () => {
    callClaudeMock.mockRejectedValue(new Error('claude unavailable'));

    const result = await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: ROWS_SAMPLE });

    expect(result.source).toBe('ai');
    expect(result.overallConfidence).toBe(0);
    expect(result.sample).toEqual([]);
    expect(result.trace.steps[0]?.outcome).toBe('failed');
    expect(result.trace.steps[0]?.ai).toBeUndefined();
  });

  it('returns failed result when response has no text block', async () => {
    callClaudeMock.mockResolvedValue({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-4-5-20251001',
      content: [{ type: 'tool_use', id: 't', name: 'noop', input: {} }],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    } as unknown as Anthropic.Message);

    const result = await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: ROWS_SAMPLE });

    expect(result.overallConfidence).toBe(0);
    expect(result.trace.steps[0]?.outcome).toBe('failed');
    // Trace still carries usage telemetry from the (failed) response.
    expect(result.trace.steps[0]?.ai?.inputTokens).toBe(10);
  });

  it('returns failed result when response text is not valid JSON', async () => {
    callClaudeMock.mockResolvedValue(fakeClaudeResponse('not json at all'));

    const result = await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: ROWS_SAMPLE });

    expect(result.overallConfidence).toBe(0);
    expect(result.trace.steps[0]?.outcome).toBe('failed');
  });

  it('returns failed result when response violates the Zod schema (e.g., invalid canonical field)', async () => {
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse(
        JSON.stringify({
          mapping: { 'Fecha Op': 'this_is_not_a_canonical_field' },
          confidence: {},
          overallConfidence: 0.5,
        }),
      ),
    );

    const result = await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: ROWS_SAMPLE });

    expect(result.overallConfidence).toBe(0);
    expect(result.trace.steps[0]?.outcome).toBe('failed');
  });
});

describe('aiDetect — locked guarantee §3: hallucinated headers are dropped', () => {
  it('filters mapping entries that reference headers we never sent', async () => {
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse(
        JSON.stringify({
          mapping: {
            'Fecha Op': 'date',
            Concepto: 'description',
            Movimiento: 'amount',
            Saldo: 'ignore',
            /*
             * `Hallucinated Column` was never in our input. The AI
             * imagined it; the filter MUST drop it before the wizard
             * sees it.
             */
            'Hallucinated Column': 'merchantNit',
          },
          confidence: { date: 0.95, description: 0.9, amount: 0.9 },
          overallConfidence: 0.92,
        }),
      ),
    );

    const result = await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: ROWS_SAMPLE });

    expect(result.mapping).toBeDefined();
    expect(result.mapping).not.toHaveProperty('Hallucinated Column');
    // Real headers survive intact.
    expect(result.mapping?.['Fecha Op']).toBe('date');
  });
});

describe('aiDetect — locked guarantee §2: sample projection uses caller data', () => {
  it('projects the FULL caller-provided sample (not whatever the AI returned)', async () => {
    /*
     * The AI returns a mapping but no sample. The result's `sample`
     * MUST come from the caller's `sampleRows`, projected through
     * the mapping — never invented by the AI.
     */
    callClaudeMock.mockResolvedValue(
      fakeClaudeResponse(
        JSON.stringify({
          mapping: {
            'Fecha Op': 'date',
            Concepto: 'description',
            Movimiento: 'amount',
            Saldo: 'ignore',
          },
          confidence: { date: 0.95, description: 0.9, amount: 0.9 },
          overallConfidence: 0.92,
        }),
      ),
    );

    const result = await aiDetect({ headers: HEADERS_SAMPLE, sampleRows: ROWS_SAMPLE });

    expect(result.sample).toHaveLength(2);
    expect(result.sample[0]?.date).toBe(ROWS_SAMPLE[0]?.['Fecha Op']);
    expect(result.sample[0]?.description).toBe(ROWS_SAMPLE[0]?.Concepto);
    expect(result.sample[1]?.description).toBe(ROWS_SAMPLE[1]?.Concepto);
  });
});
