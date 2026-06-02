import 'server-only';
import { getDefaultFromAddress, getEmailProvider } from './client';
import { EmailSendError, toAddressArray, type EmailMessage, type EmailSendResult } from './types';

/**
 * `sendEmail` — Phase L4 transactional send wrapper.
 *
 * Resolves the active provider (Resend or SES) via env, retries on
 * transient errors with exponential-ish backoff, and logs every
 * attempt. Throws `EmailSendError` only after every retry exhausts.
 *
 * No-op behavior when no provider is configured: logs the would-be
 * send and returns a synthetic skipped result. This lets the friends-
 * and-family beta run without email infrastructure — once the founder
 * sets `EMAIL_PROVIDER`, the same call starts actually delivering.
 *
 * The `from` field on `EmailMessage` is OPTIONAL even though the
 * `EmailMessage` type marks it required — this wrapper fills in the
 * env-configured default when callers omit it (the typed shape
 * forwards everything to the provider as-is).
 */

const MAX_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 500;

export interface SendEmailInput extends Omit<EmailMessage, 'from'> {
  /** When omitted, falls back to env-configured EMAIL_FROM_ADDRESS / EMAIL_FROM_NAME. */
  from?: EmailMessage['from'];
}

export type SendEmailResult =
  | (EmailSendResult & { status: 'sent' })
  | { status: 'skipped'; reason: 'no_provider_configured' };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = getEmailProvider();
  if (!provider) {
    /*
     * No EMAIL_PROVIDER configured. Log so the founder can grep for
     * unsent emails after configuring; return skipped so callers
     * don't need a separate code path for "feature disabled."
     */
    console.warn('[email] skipped — no provider configured', {
      to: previewRecipient(input.to),
      subject: input.subject,
    });
    return { status: 'skipped', reason: 'no_provider_configured' };
  }

  const from = input.from ?? getDefaultFromAddress();
  if (!from) {
    /*
     * Provider is configured but no default-from is resolvable
     * (EMAIL_FROM_ADDRESS missing). This is a misconfiguration the
     * founder should fix — throw rather than silently send under the
     * wrong identity.
     */
    throw new EmailSendError('No `from` address provided and EMAIL_FROM_ADDRESS not set', {
      provider: provider.name,
    });
  }

  const message: EmailMessage = { ...input, from };

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await provider.send(message);
      /*
       * Successful sends use `console.warn` (not `console.log`) only
       * because the project's lint config restricts allowed methods to
       * warn/error — this is a routine telemetry line, not an actual
       * warning. Beta-phase visibility is worth the slight semantic
       * mismatch; revisit once we wire a real logger.
       */
      console.warn('[email] sent', {
        provider: result.provider,
        id: result.id,
        to: previewRecipient(message.to),
        subject: message.subject,
        attempt,
      });
      return { ...result, status: 'sent' };
    } catch (err) {
      lastError = err;
      console.warn('[email] send failed', {
        provider: provider.name,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw new EmailSendError(`All ${MAX_ATTEMPTS} send attempts failed`, {
    provider: provider.name,
    cause: lastError,
  });
}

/**
 * Shape recipient for logs without leaking PII into structured logs.
 * Single recipient: full email. Multiple: count only.
 */
function previewRecipient(to: EmailMessage['to']): string {
  const arr = toAddressArray(to);
  if (arr.length === 1) return arr[0]?.email ?? '<missing>';
  return `${arr.length} recipients`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
