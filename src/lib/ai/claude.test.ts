/**
 * @vitest-environment node
 *
 * The Anthropic SDK guards against being run from a browser-like
 * environment (it would leak the API key in the page). Vitest's
 * repo-wide default is `jsdom`, which the SDK detects. Switching
 * this single suite to `node` lets `new Anthropic({ apiKey })`
 * construct without us flipping `dangerouslyAllowBrowser` in
 * production code.
 */
import {
  type MockInstance,
  type Mock,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

/*
 * `src/lib/env.ts` reads NEXT_PUBLIC_SUPABASE_URL eagerly at module
 * load and throws when it's absent. Vitest does not auto-load the
 * repo's `.env` file, so the module-level throw would crash this
 * suite before any test ran. We replace the env module with a tiny
 * shim that returns a fake Anthropic key — that's the only field
 * the wrapper actually reads.
 *
 * `vi.mock` is hoisted above the imports below by Vitest's
 * transformer, so the mock is in place before `./claude` resolves
 * `@/lib/env`.
 */
vi.mock('@/lib/env', () => ({
  getServerEnv: () => ({
    supabaseServiceRoleKey: 'unused-in-this-suite',
    databaseUrl: 'unused-in-this-suite',
    directUrl: 'unused-in-this-suite',
    anthropicApiKey: 'sk-ant-test-fake-key',
  }),
}));

import Anthropic from '@anthropic-ai/sdk';
import {
  MODEL_HAIKU,
  MODEL_OPUS,
  _resetClaudeClientForTesting,
  callClaudeWithRetry,
  getClaudeClient,
} from './claude';

/*
 * Minimal Anthropic.Message fixture. Only the fields `logUsage` reads
 * (model, usage.*) need to be realistic; the rest is filled with
 * defensible stubs and cast through `unknown` so the SDK type checker
 * is satisfied without us re-stating the whole nested shape.
 */
function fakeMessageResponse(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-4-7',
    content: [{ type: 'text', text: 'ok' }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  } as unknown as Anthropic.Message;
}

type CreateHandler = (
  args: Anthropic.MessageCreateParamsNonStreaming,
) => Anthropic.Message | Promise<Anthropic.Message>;

type CreateMock = Mock<
  (args: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>
>;

interface FakeClientResult {
  client: Anthropic;
  createMock: CreateMock;
}

/*
 * Build a fake Anthropic client. Returns the spy directly so tests can
 * call `expect(createMock).toHaveBeenCalledTimes(...)` without tripping
 * `@typescript-eslint/unbound-method` on `client.messages.create`.
 */
function fakeClient(handler: CreateHandler): FakeClientResult {
  const createMock: CreateMock = vi.fn(async (args: Anthropic.MessageCreateParamsNonStreaming) =>
    handler(args),
  );
  const client = {
    messages: { create: createMock },
  } as unknown as Anthropic;
  return { client, createMock };
}

const NOOP_REQUEST: Anthropic.MessageCreateParamsNonStreaming = {
  model: MODEL_OPUS,
  max_tokens: 16,
  messages: [{ role: 'user', content: 'ping' }],
};

describe('claude wrapper — model constants', () => {
  it('locks in the exact model IDs the rest of the codebase will depend on', () => {
    expect(MODEL_OPUS).toBe('claude-opus-4-7');
    expect(MODEL_HAIKU).toBe('claude-haiku-4-5-20251001');
  });
});

describe('callClaudeWithRetry — happy path', () => {
  let logSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    logSpy = vi
      .spyOn(console, 'log')
      .mockImplementation(((..._args: unknown[]) => undefined) as () => void);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('returns the first successful response without retrying', async () => {
    const { client, createMock } = fakeClient(() => fakeMessageResponse());
    const result = await callClaudeWithRetry(NOOP_REQUEST, client);
    expect(result.model).toBe('claude-opus-4-7');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('logs structured cost telemetry — usage counters only, never prompt/response content', async () => {
    const { client } = fakeClient(() =>
      fakeMessageResponse({
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 25,
          cache_creation_input_tokens: 10,
        } as unknown as Anthropic.Message['usage'],
      }),
    );
    await callClaudeWithRetry(NOOP_REQUEST, client);
    expect(logSpy).toHaveBeenCalledOnce();

    const firstCall = logSpy.mock.calls[0];
    if (!firstCall) throw new Error('expected at least one log call');
    const raw = firstCall[0] as string;
    const logged = JSON.parse(raw) as Record<string, unknown>;

    expect(logged).toMatchObject({
      event: 'claude.usage',
      model: 'claude-opus-4-7',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 25,
      cacheWriteTokens: 10,
    });
    expect(typeof logged.latencyMs).toBe('number');

    /*
     * Privacy invariant: the telemetry line must NEVER contain the
     * literal prompt text or any response content. We assert by
     * searching the raw JSON for both — neither token should appear.
     */
    expect(raw).not.toContain('ping');
    expect(raw).not.toContain('"ok"');
  });

  it('defaults cache counters to 0 when the SDK omits them on older response shapes', async () => {
    const { client } = fakeClient(() =>
      fakeMessageResponse({
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        } as unknown as Anthropic.Message['usage'],
      }),
    );
    await callClaudeWithRetry(NOOP_REQUEST, client);

    const firstCall = logSpy.mock.calls[0];
    if (!firstCall) throw new Error('expected at least one log call');
    const logged = JSON.parse(firstCall[0] as string) as Record<string, unknown>;

    expect(logged.cacheReadTokens).toBe(0);
    expect(logged.cacheWriteTokens).toBe(0);
  });
});

describe('callClaudeWithRetry — retry behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(((..._args: unknown[]) => undefined) as () => void);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries on a 500 then succeeds on the second attempt', async () => {
    let calls = 0;
    const { client, createMock } = fakeClient(() => {
      calls += 1;
      if (calls === 1) {
        throw new Anthropic.APIError(500, undefined, 'boom', undefined);
      }
      return fakeMessageResponse();
    });

    const promise = callClaudeWithRetry(NOOP_REQUEST, client);
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result.id).toBe('msg_test');
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('retries on a 429 rate-limit then succeeds on the second attempt', async () => {
    let calls = 0;
    const { client, createMock } = fakeClient(() => {
      calls += 1;
      if (calls === 1) {
        /*
         * `RateLimitError`'s generic locks `THeaders = Headers`, so an
         * empty `new Headers()` is the minimal allowed shape; the wrapper
         * only inspects `status`/instanceof, so the headers object's
         * contents don't matter.
         */
        throw new Anthropic.RateLimitError(429, undefined, 'slow down', new Headers());
      }
      return fakeMessageResponse();
    });

    const promise = callClaudeWithRetry(NOOP_REQUEST, client);
    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result.id).toBe('msg_test');
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('exhausts 3 retries (4 attempts total) and rethrows the final 5xx', async () => {
    const { client, createMock } = fakeClient(() => {
      throw new Anthropic.APIError(503, undefined, 'still down', undefined);
    });

    const promise = callClaudeWithRetry(NOOP_REQUEST, client);
    /*
     * Attach the rejection expectation before advancing timers so the
     * promise's rejection is observed (otherwise vitest reports it as
     * an unhandled rejection).
     */
    const expectation = expect(promise).rejects.toBeInstanceOf(Anthropic.APIError);
    // Burn through all three backoff windows: 200 + 800 + 3200 ms.
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(800);
    await vi.advanceTimersByTimeAsync(3200);
    await expectation;

    expect(createMock).toHaveBeenCalledTimes(4);
  });

  it('does NOT retry a 4xx (non-429) — rethrows immediately', async () => {
    let calls = 0;
    const { client } = fakeClient(() => {
      calls += 1;
      throw new Anthropic.APIError(400, undefined, 'bad request', undefined);
    });

    await expect(callClaudeWithRetry(NOOP_REQUEST, client)).rejects.toBeInstanceOf(
      Anthropic.APIError,
    );
    expect(calls).toBe(1);
  });

  it('does NOT retry an unrelated runtime error (not an APIError)', async () => {
    let calls = 0;
    const { client } = fakeClient(() => {
      calls += 1;
      throw new Error('totally unrelated bug');
    });

    await expect(callClaudeWithRetry(NOOP_REQUEST, client)).rejects.toThrow(
      'totally unrelated bug',
    );
    expect(calls).toBe(1);
  });
});

describe('getClaudeClient singleton', () => {
  beforeEach(() => {
    _resetClaudeClientForTesting();
  });

  afterEach(() => {
    _resetClaudeClientForTesting();
  });

  it('returns the same instance across calls (no per-call construction cost)', () => {
    /*
     * The `@/lib/env` mock at the top of this file supplies a fake
     * Anthropic key, so `new Anthropic({ apiKey })` constructs cleanly.
     */
    const a = getClaudeClient();
    const b = getClaudeClient();
    expect(a).toBe(b);
  });
});
