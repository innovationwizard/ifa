/**
 * @vitest-environment node
 *
 * Tests for the Phase L4 transactional-email layer.
 *
 * Two surfaces under test:
 *   1. `formatAddress` — RFC 5322 display-name quoting (pure, easy).
 *   2. `sendEmail` — provider selection, skipped-when-no-provider, retry
 *      semantics, misconfigured-from throws. We mock `getEmailEnv` and
 *      the provider modules so the tests never touch the real SDKs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getEmailEnv: vi.fn(),
  resendSend: vi.fn(),
  sesSend: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  getEmailEnv: m.getEmailEnv,
  publicEnv: { siteUrl: 'https://test.ifa.example' },
}));

vi.mock('./providers/resend', () => ({
  resendProvider: { name: 'resend', send: m.resendSend },
}));

vi.mock('./providers/ses', () => ({
  sesProvider: { name: 'ses', send: m.sesSend },
}));

import { sendEmail } from './send';
import { _resetEmailProviderCacheForTests } from './client';
import { EmailSendError, formatAddress } from './types';

beforeEach(() => {
  vi.clearAllMocks();
  _resetEmailProviderCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

/* -------------------------------------------------------------------------- */
/* formatAddress                                                              */
/* -------------------------------------------------------------------------- */

describe('formatAddress', () => {
  it('returns bare email when no name is set', () => {
    expect(formatAddress({ email: 'a@b.c' })).toBe('a@b.c');
  });

  it('wraps simple names without quoting', () => {
    expect(formatAddress({ email: 'a@b.c', name: 'Alice' })).toBe('Alice <a@b.c>');
  });

  it('quotes names containing commas, quotes, or angle brackets', () => {
    expect(formatAddress({ email: 'a@b.c', name: 'Smith, Alice' })).toBe('"Smith, Alice" <a@b.c>');
    expect(formatAddress({ email: 'a@b.c', name: 'Alice "Ace" Smith' })).toBe(
      '"Alice \\"Ace\\" Smith" <a@b.c>',
    );
    expect(formatAddress({ email: 'a@b.c', name: '<Alice>' })).toBe('"<Alice>" <a@b.c>');
  });
});

/* -------------------------------------------------------------------------- */
/* sendEmail — provider selection + skipped state                             */
/* -------------------------------------------------------------------------- */

describe('sendEmail — provider selection', () => {
  const baseMessage = {
    to: { email: 'user@example.com' },
    subject: 'hello',
    html: '<p>hi</p>',
    text: 'hi',
  };

  it('skips with a logged warning when EMAIL_PROVIDER is not configured', async () => {
    m.getEmailEnv.mockReturnValue(null);

    const result = await sendEmail(baseMessage);

    expect(result).toEqual({ status: 'skipped', reason: 'no_provider_configured' });
    expect(m.resendSend).not.toHaveBeenCalled();
    expect(m.sesSend).not.toHaveBeenCalled();
  });

  it('routes to Resend when EMAIL_PROVIDER=resend', async () => {
    m.getEmailEnv.mockReturnValue({
      provider: 'resend',
      fromAddress: 'noreply@ifa.gt',
      fromName: 'IFA',
      resendApiKey: 're_test',
      awsSesRegion: null,
      awsSesAccessKeyId: null,
      awsSesSecretAccessKey: null,
    });
    m.resendSend.mockResolvedValue({ id: 're_msg_1', provider: 'resend' });

    const result = await sendEmail(baseMessage);

    expect(result).toEqual({ status: 'sent', id: 're_msg_1', provider: 'resend' });
    expect(m.resendSend).toHaveBeenCalledTimes(1);
    expect(m.sesSend).not.toHaveBeenCalled();
  });

  it('routes to SES when EMAIL_PROVIDER=ses', async () => {
    m.getEmailEnv.mockReturnValue({
      provider: 'ses',
      fromAddress: 'noreply@ifa.gt',
      fromName: 'IFA',
      resendApiKey: null,
      awsSesRegion: 'us-east-1',
      awsSesAccessKeyId: 'AKIA...',
      awsSesSecretAccessKey: 'secret',
    });
    m.sesSend.mockResolvedValue({ id: 'ses_msg_1', provider: 'ses' });

    const result = await sendEmail(baseMessage);

    expect(result).toEqual({ status: 'sent', id: 'ses_msg_1', provider: 'ses' });
    expect(m.sesSend).toHaveBeenCalledTimes(1);
    expect(m.resendSend).not.toHaveBeenCalled();
  });

  it('fills in default from address from env when caller omits it', async () => {
    m.getEmailEnv.mockReturnValue({
      provider: 'resend',
      fromAddress: 'noreply@ifa.gt',
      fromName: 'IFA',
      resendApiKey: 're_test',
      awsSesRegion: null,
      awsSesAccessKeyId: null,
      awsSesSecretAccessKey: null,
    });
    m.resendSend.mockResolvedValue({ id: 're_msg_1', provider: 'resend' });

    await sendEmail(baseMessage);

    const sentMessage = m.resendSend.mock.calls[0]?.[0] as {
      from: { email: string; name: string };
    };
    expect(sentMessage.from).toEqual({ email: 'noreply@ifa.gt', name: 'IFA' });
  });

  it('throws when provider is configured but from address is missing', async () => {
    /*
     * Edge case: env says provider=resend but EMAIL_FROM_ADDRESS is empty
     * and the caller doesn't pass one. Defense against silent "sent from
     * wrong identity" sends.
     */
    m.getEmailEnv.mockReturnValueOnce({
      provider: 'resend',
      fromAddress: 'noreply@ifa.gt',
      fromName: 'IFA',
      resendApiKey: 're_test',
      awsSesRegion: null,
      awsSesAccessKeyId: null,
      awsSesSecretAccessKey: null,
    });
    // After provider resolution, getEmailEnv is called again to resolve
    // the from address. Return null this second call to simulate missing.
    m.getEmailEnv.mockReturnValueOnce(null);

    await expect(sendEmail(baseMessage)).rejects.toThrow(EmailSendError);
  });
});

/* -------------------------------------------------------------------------- */
/* sendEmail — retry + telemetry                                              */
/* -------------------------------------------------------------------------- */

describe('sendEmail — retry behavior', () => {
  const env = {
    provider: 'resend' as const,
    fromAddress: 'noreply@ifa.gt',
    fromName: 'IFA',
    resendApiKey: 're_test',
    awsSesRegion: null,
    awsSesAccessKeyId: null,
    awsSesSecretAccessKey: null,
  };
  const baseMessage = {
    to: { email: 'user@example.com' },
    subject: 'hello',
    html: '<p>hi</p>',
    text: 'hi',
  };

  beforeEach(() => {
    m.getEmailEnv.mockReturnValue(env);
    /*
     * Fake timers so the inter-attempt sleep doesn't slow tests. Tests
     * advance time manually after each rejected attempt.
     */
    vi.useFakeTimers();
  });

  it('retries on transient errors and resolves on a later attempt', async () => {
    m.resendSend
      .mockRejectedValueOnce(new Error('transient 1'))
      .mockRejectedValueOnce(new Error('transient 2'))
      .mockResolvedValueOnce({ id: 're_msg_1', provider: 'resend' });

    const promise = sendEmail(baseMessage);

    /*
     * Drain the three send attempts. After each rejection the wrapper
     * sleeps base*attempt; advance enough time to clear both gaps
     * (500 ms after attempt 1, 1000 ms after attempt 2).
     */
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ status: 'sent', id: 're_msg_1', provider: 'resend' });
    expect(m.resendSend).toHaveBeenCalledTimes(3);
  });

  it('throws EmailSendError after MAX_ATTEMPTS exhausted', async () => {
    m.resendSend.mockRejectedValue(new Error('permanently broken'));

    const promise = sendEmail(baseMessage);
    /*
     * Attach the rejection-expectation handler BEFORE advancing timers
     * so the promise rejection doesn't leak as an unhandled-rejection
     * warning. Then drain the timer gaps so the loop actually completes.
     */
    const assertion = expect(promise).rejects.toThrow(EmailSendError);
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;

    expect(m.resendSend).toHaveBeenCalledTimes(3);
  });
});
