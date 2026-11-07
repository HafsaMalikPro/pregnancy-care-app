import {
  DisabledEmailSender,
  EmailSendError,
  LogEmailSender,
  MemoryEmailSender,
  ResendEmailSender,
} from './email-sender.js';
import { createEmailSender } from './email.module.js';
import {
  passwordResetEmail,
  reminderEmail,
  verificationEmail,
} from './templates.js';

/**
 * The Resend provider is exercised against a controlled fetch double: automated tests never
 * call the real API or send real email.
 */
const message = {
  ...reminderEmail('a@example.com', 'daily_log', null, 'https://app.test'),
  idempotencyKey: 'reminder-delivery/d1',
};

function resendWith(fetchImpl: (...args: unknown[]) => Promise<Response>) {
  const spy = vi.fn(fetchImpl);
  return {
    spy,
    resend: new ResendEmailSender(
      're_key',
      'Care <c@example.com>',
      spy as unknown as typeof fetch,
    ),
  };
}

const headersOf = (spy: ReturnType<typeof vi.fn>, call = 0) =>
  (spy.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

describe('ResendEmailSender: provider behaviour', () => {
  it('sends an Idempotency-Key so a retried delivery is not sent twice', async () => {
    const { spy, resend } = resendWith(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'm1' }), { status: 200 }),
      ),
    );
    await resend.send(message);
    await resend.send(message);
    expect(headersOf(spy, 0)['Idempotency-Key']).toBe('reminder-delivery/d1');
    expect(headersOf(spy, 1)['Idempotency-Key']).toBe('reminder-delivery/d1');
  });

  it('omits the header for messages without a key', async () => {
    const { spy, resend } = resendWith(() =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );
    await resend.send(
      passwordResetEmail('a@example.com', 'https://app.test/r?token=x'),
    );
    expect(headersOf(spy)).not.toHaveProperty('Idempotency-Key');
  });

  it('sets a request timeout and treats a timeout as retryable', async () => {
    const { spy, resend } = resendWith(() =>
      Promise.reject(
        new DOMException('The operation timed out.', 'TimeoutError'),
      ),
    );
    const err = await resend.send(message).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
    expect((spy.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it('accepts a success response with an invalid or empty body', async () => {
    for (const body of ['not json', '', JSON.stringify({ unexpected: true })]) {
      const { resend } = resendWith(() =>
        Promise.resolve(new Response(body, { status: 200 })),
      );
      await expect(resend.send(message)).resolves.toEqual({ id: null });
    }
  });

  it.each([
    [400, 'REJECTED_400', false],
    [401, 'REJECTED_401', false],
    [403, 'REJECTED_403', false],
    [500, 'PROVIDER_500', true],
    [502, 'PROVIDER_502', true],
  ] as const)(
    'maps HTTP %i to %s (retryable: %s)',
    async (status, code, retryable) => {
      const { resend } = resendWith(() =>
        Promise.resolve(new Response('<html>error</html>', { status })),
      );
      const err = await resend.send(message).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EmailSendError);
      expect(err).toMatchObject({ code, retryable });
      // The error never carries the recipient or the provider's body.
      expect((err as Error).message).not.toMatch(/example\.com|html/);
    },
  );
});

describe('other senders', () => {
  it('disabled sender refuses every send without retrying', async () => {
    const sender = new DisabledEmailSender();
    expect(sender.enabled).toBe(false);
    await expect(sender.send()).rejects.toMatchObject({
      code: 'EMAIL_DISABLED',
      retryable: false,
    });
  });

  it('memory sender records messages and replays queued failures in order', async () => {
    const sender = new MemoryEmailSender();
    sender.failures.push({ code: 'RATE_LIMITED', retryable: true });
    await expect(sender.send(message)).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    await expect(sender.send(message)).resolves.toEqual({ id: 'memory-1' });
    expect(sender.sent).toEqual([message]);
  });

  it('log sender prints the message and returns no id', async () => {
    const sender = new LogEmailSender();
    await expect(sender.send(message)).resolves.toEqual({ id: null });
  });

  it('createEmailSender picks the configured provider', () => {
    expect(createEmailSender({ EMAIL_PROVIDER: 'none' })).toBeInstanceOf(
      DisabledEmailSender,
    );
    expect(createEmailSender({ EMAIL_PROVIDER: 'log' })).toBeInstanceOf(
      LogEmailSender,
    );
    expect(createEmailSender({ EMAIL_PROVIDER: 'memory' })).toBeInstanceOf(
      MemoryEmailSender,
    );
    expect(
      createEmailSender({
        EMAIL_PROVIDER: 'resend',
        EMAIL_FROM: 'a@b.c',
        RESEND_API_KEY: 'k',
      }),
    ).toBeInstanceOf(ResendEmailSender);
  });
});

describe('email templates', () => {
  it('reset and verification emails carry the link and their tag', () => {
    const reset = passwordResetEmail(
      'a@example.com',
      'https://app.test/reset?token=abc',
    );
    expect(reset).toMatchObject({ tag: 'password_reset', to: 'a@example.com' });
    expect(reset.text).toContain('https://app.test/reset?token=abc');
    const verify = verificationEmail(
      'a@example.com',
      'https://app.test/verify?token=abc',
    );
    expect(verify.tag).toBe('email_verification');
    expect(verify.text).toContain('https://app.test/verify?token=abc');
  });

  it('reminders use the label, a per-kind default, or a generic default', () => {
    expect(
      reminderEmail('a@x.test', 'custom', 'Take a walk', 'https://a').subject,
    ).toBe('Take a walk');
    expect(
      reminderEmail('a@x.test', 'readiness_checkin', null, 'https://a').subject,
    ).toBe('Time to look at your checklist.');
    expect(
      reminderEmail('a@x.test', 'unknown_kind', null, 'https://a').subject,
    ).toBe('A reminder you set in Pregnancy Care.');
  });

  it('keeps a long label out of the subject line (lock screens)', () => {
    const label = 'x'.repeat(61);
    const email = reminderEmail('a@x.test', 'custom', label, 'https://a');
    expect(email.subject).toBe('Your Pregnancy Care reminder');
    expect(email.text).toContain(label);
  });
});
