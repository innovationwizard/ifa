/**
 * Public surface of the transactional-email layer (Phase L4).
 *
 * Callers import from `@/lib/email` and never reach into providers/
 * or client.ts directly. The provider implementations stay private so
 * future migrations (e.g. switch from Resend to SES, or add Postmark)
 * don't ripple through callsites.
 */

export { sendEmail } from './send';
export type { SendEmailInput, SendEmailResult } from './send';
export { EmailSendError } from './types';
export type {
  EmailAddress,
  EmailMessage,
  EmailProvider,
  EmailProviderName,
  EmailSendResult,
} from './types';
