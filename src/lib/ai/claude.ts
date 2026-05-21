import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { getServerEnv } from '@/lib/env';

/**
 * Thin Anthropic SDK wrapper (Batch 2 of the Phase 6 + 7 plan).
 *
 * Owns three concerns and nothing else:
 *
 *   1. Singleton client construction — one `Anthropic` instance per
 *      process. The SDK is stateless w.r.t. requests, so reuse is
 *      safe and saves the constructor cost on every call.
 *
 *   2. Retry-with-backoff on 5xx + 429. The SDK has its own retry
 *      mechanism (`maxRetries` default = 2) but we disable it
 *      (`maxRetries: 0`) so we can log every attempt and own the
 *      backoff schedule. Delays before each retry: 200ms, 800ms,
 *      3200ms — total worst-case wall time ≈ 4.2s before giving up.
 *
 *   3. Cost telemetry. Every successful call emits a single
 *      structured `console.log` line with the usage counters +
 *      model + latency. **Never logs prompt or response content.**
 *      When a proper observability pipeline lands, swap the
 *      console.log for the real logger; the call sites don't change.
 *
 * Server-only — `import 'server-only'` at the top makes Next throw
 * at build time if anything in a client component transitively
 * imports us. Categorization (Batch 3) and the score factor library
 * (Batch 9) are the first real consumers; both run server-side.
 *
 * Prompt caching: enforced by callers, not by this wrapper. The
 * wrapper passes the request through verbatim, so callers in
 * Batch 3+ stamp `cache_control: { type: 'ephemeral' }` on the
 * stable prefix blocks they construct.
 */

export const MODEL_OPUS = 'claude-opus-4-7' as const;
export const MODEL_HAIKU = 'claude-haiku-4-5-20251001' as const;

/**
 * Backoff delays in milliseconds before each retry. Length of this
 * array = number of retries (3) → 4 total attempts maximum.
 */
const BACKOFF_MS = [200, 800, 3200] as const satisfies readonly number[];

let cachedClient: Anthropic | undefined;

/**
 * Singleton accessor. Reads `ANTHROPIC_API_KEY` lazily via
 * `getServerEnv()` so the constructor doesn't trip during build
 * (when env vars may be unset) but throws clearly the first time
 * the wrapper is actually invoked.
 */
export function getClaudeClient(): Anthropic {
  if (cachedClient !== undefined) return cachedClient;
  const { anthropicApiKey } = getServerEnv();
  cachedClient = new Anthropic({
    apiKey: anthropicApiKey,
    /*
     * Disable SDK-level retries so our explicit loop owns the
     * backoff schedule and can log each attempt. The SDK default is
     * 2 retries with its own backoff — we want determinism.
     */
    maxRetries: 0,
  });
  return cachedClient;
}

/**
 * Test-only seam. Clears the cached singleton so unit tests can
 * verify fresh-construction behavior. Not part of the public API.
 */
export function _resetClaudeClientForTesting(): void {
  cachedClient = undefined;
}

/**
 * Retryable iff:
 *   - Anthropic `RateLimitError` (HTTP 429)
 *   - Any `APIError` with a 5xx status
 *
 * Everything else (4xx other than 429, network errors that don't
 * surface as `APIError`, our own programming errors) is rethrown
 * immediately — retrying a 400 won't unbreak a malformed prompt.
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Anthropic.RateLimitError) return true;
  if (error instanceof Anthropic.APIError && typeof error.status === 'number') {
    return error.status >= 500 && error.status < 600;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Cost-telemetry emitter. Single JSON-stringified line per
 * successful call. Field shape is locked in for grep + future
 * structured-log ingestion:
 *
 *   { event, model, inputTokens, outputTokens,
 *     cacheReadTokens, cacheWriteTokens, latencyMs }
 *
 * Cache counters default to 0 when the SDK omits them (older
 * server response shapes). The `model` field comes from the
 * response itself, not the request, because the API may return a
 * date-suffixed variant.
 */
function logUsage(response: Anthropic.Message, latencyMs: number): void {
  /*
   * Deliberate structured-log emission for cost telemetry. The
   * repo-wide `no-console` rule allows only `warn`/`error`; this is
   * an informational stream that lets us grep cost data until a
   * proper observability sink replaces it.
   */
  // eslint-disable-next-line no-console -- intentional cost-telemetry sink; see logUsage docblock
  console.log(
    JSON.stringify({
      event: 'claude.usage',
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      latencyMs,
    }),
  );
}

/**
 * Main entrypoint. Calls `client.messages.create(request)` with
 * up to 3 retries on retryable errors. Logs cost telemetry on
 * success. Re-throws the last error (preserving the SDK's typed
 * exception class) when all attempts are exhausted.
 *
 * The `client` parameter exists so tests can inject a mock without
 * touching the singleton; production callers omit it.
 */
export async function callClaudeWithRetry(
  request: Anthropic.MessageCreateParamsNonStreaming,
  client: Anthropic = getClaudeClient(),
): Promise<Anthropic.Message> {
  const maxRetries = BACKOFF_MS.length;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startedAt = Date.now();
    try {
      const response = await client.messages.create(request);
      logUsage(response, Date.now() - startedAt);
      return response;
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === maxRetries) {
        throw error;
      }
      const delay = BACKOFF_MS[attempt];
      /*
       * `delay` is always defined here — `attempt < maxRetries` and
       * `maxRetries === BACKOFF_MS.length` — but
       * `noUncheckedIndexedAccess` narrows tuple access to
       * `T | undefined`. Re-throw is a defensive no-op the type
       * system requires.
       */
      if (delay === undefined) throw error;
      await sleep(delay);
    }
  }

  // Unreachable: the loop above always returns or throws.
  throw lastError;
}
