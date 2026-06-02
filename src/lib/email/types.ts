/**
 * Provider-agnostic transactional-email layer (Phase L4).
 *
 * One typed message shape feeds two interchangeable provider
 * implementations: Resend or AWS SES. The active provider is chosen
 * by env (`EMAIL_PROVIDER`), so swapping requires only a config
 * change — no callsite edits.
 *
 * Why both: Resend is the simplest serverless-friendly option (HTTP
 * API, no AWS account required). SES is materially cheaper at scale
 * (~$0.10 per 1k emails vs Resend's $20/mo + $0.005/extra). The
 * abstraction defers the choice and avoids vendor lock-in.
 *
 * Email templates are intentionally NOT part of this layer. They
 * arrive when the first concrete callsite (welcome / deletion-receipt /
 * billing) lands. Until then this layer is plumbing only — the
 * `sendEmail` wrapper has no in-app callers.
 */

export interface EmailAddress {
  email: string;
  /** Display name; falls back to bare address when omitted. */
  name?: string;
}

export interface EmailMessage {
  to: EmailAddress | EmailAddress[];
  from: EmailAddress;
  subject: string;
  html: string;
  /**
   * Plain-text fallback. Required (not optional) because every modern
   * email client renders the text part when HTML is blocked, and our
   * deliverability suffers if it's missing.
   */
  text: string;
  replyTo?: EmailAddress;
}

export interface EmailSendResult {
  /** Provider-issued message id (Resend: `re_*`; SES: a UUID). */
  id: string;
  /** Which provider actually sent the message. */
  provider: EmailProviderName;
}

export type EmailProviderName = 'resend' | 'ses';

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Thrown when a provider's send call fails (after retries exhaust).
 * Callers can match on `provider` to log/recover.
 */
export class EmailSendError extends Error {
  readonly provider: EmailProviderName;

  constructor(message: string, options: { provider: EmailProviderName; cause?: unknown }) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'EmailSendError';
    this.provider = options.provider;
  }
}

/* -------------------------------------------------------------------------- */
/* Small shared utilities — used by both provider implementations             */
/* -------------------------------------------------------------------------- */

export function formatAddress(addr: EmailAddress): string {
  /*
   * RFC 5322 display-name encoding. Quote the name when it contains
   * characters that would confuse the address parser (commas, quotes,
   * angle brackets). Resend and SES both accept the quoted form.
   */
  if (!addr.name) return addr.email;
  const needsQuoting = /[,"<>]/.test(addr.name);
  const escaped = needsQuoting ? `"${addr.name.replace(/"/g, '\\"')}"` : addr.name;
  return `${escaped} <${addr.email}>`;
}

export function toAddressArray(v: EmailAddress | EmailAddress[]): EmailAddress[] {
  return Array.isArray(v) ? v : [v];
}
