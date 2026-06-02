import 'server-only';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
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
 * AWS SES provider — Phase L4.
 *
 * Uses the modular `@aws-sdk/client-sesv2` SDK so the dependency
 * footprint stays small (SESv2 is the modern endpoint; v1 is being
 * deprecated). The client is cached module-level for connection
 * reuse on warm Vercel functions.
 *
 * Credentials come from EMAIL_PROVIDER-namespaced env vars
 * (AWS_SES_*), NOT the default AWS_* vars — see `getEmailEnv()`
 * docstring for the rationale.
 */

let cached: SESv2Client | undefined;

function getSes(): SESv2Client {
  if (cached) return cached;
  const env = getEmailEnv();
  if (env?.provider !== 'ses') {
    throw new EmailSendError('SES provider requested but EMAIL_PROVIDER is not "ses"', {
      provider: 'ses',
    });
  }
  if (!env.awsSesRegion || !env.awsSesAccessKeyId || !env.awsSesSecretAccessKey) {
    throw new EmailSendError(
      'SES credentials incomplete. Set AWS_SES_REGION, AWS_SES_ACCESS_KEY_ID, and ' +
        'AWS_SES_SECRET_ACCESS_KEY when EMAIL_PROVIDER=ses.',
      { provider: 'ses' },
    );
  }
  cached = new SESv2Client({
    region: env.awsSesRegion,
    credentials: {
      accessKeyId: env.awsSesAccessKeyId,
      secretAccessKey: env.awsSesSecretAccessKey,
    },
  });
  return cached;
}

export const sesProvider: EmailProvider = {
  name: 'ses',
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const client = getSes();
    const command = new SendEmailCommand({
      FromEmailAddress: formatAddress(message.from),
      Destination: {
        ToAddresses: toAddressArray(message.to).map(formatAddress),
      },
      ReplyToAddresses: message.replyTo ? [formatAddress(message.replyTo)] : undefined,
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: message.html, Charset: 'UTF-8' },
            Text: { Data: message.text, Charset: 'UTF-8' },
          },
        },
      },
    });
    try {
      const response = await client.send(command);
      if (!response.MessageId) {
        throw new EmailSendError('SES returned no MessageId', { provider: 'ses' });
      }
      return { id: response.MessageId, provider: 'ses' };
    } catch (err) {
      if (err instanceof EmailSendError) throw err;
      throw new EmailSendError(err instanceof Error ? err.message : 'unknown SES error', {
        provider: 'ses',
        cause: err,
      });
    }
  },
};
