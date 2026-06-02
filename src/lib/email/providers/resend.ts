import 'server-only';
import { Resend } from 'resend';
import { getEmailEnv } from '@/lib/env';
import {
  EmailSendError,
  formatAddress,
  toAddressArray,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from '../types';

/**
 * Resend provider — Phase L4.
 *
 * Wraps the official `resend` SDK. The HTTP client is cached
 * module-level so warm Vercel functions reuse the connection pool.
 */

let cached: Resend | undefined;

function getResend(): Resend {
  if (cached) return cached;
  const env = getEmailEnv();
  if (!env?.resendApiKey) {
    throw new EmailSendError(
      'RESEND_API_KEY not configured. Set EMAIL_PROVIDER=resend and RESEND_API_KEY in env.',
      { provider: 'resend' },
    );
  }
  cached = new Resend(env.resendApiKey);
  return cached;
}

export const resendProvider: EmailProvider = {
  name: 'resend',
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const client = getResend();
    /*
     * exactOptionalPropertyTypes makes `replyTo: undefined` a type
     * error against the Resend SDK shape — build the payload
     * conditionally so the field is OMITTED when not set.
     */
    const response = await client.emails.send({
      from: formatAddress(message.from),
      to: toAddressArray(message.to).map(formatAddress),
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: formatAddress(message.replyTo) } : {}),
    });
    if (response.error || !response.data) {
      throw new EmailSendError(response.error?.message ?? 'unknown resend error', {
        provider: 'resend',
        cause: response.error,
      });
    }
    return { id: response.data.id, provider: 'resend' };
  },
};
