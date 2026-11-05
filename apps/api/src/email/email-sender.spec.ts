import { EmailSendError, ResendEmailSender } from './email-sender.js';
import { reminderEmail } from './templates.js';

const message = reminderEmail(
  'a@example.com',
  'daily_log',
  null,
  'https://app.test',
);

function sender(status: number | 'throw', body: unknown = {}) {
  const fetchImpl = vi.fn(() =>
    status === 'throw'
      ? Promise.reject(new TypeError('network'))
      : Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
  return {
    fetchImpl,
    resend: new ResendEmailSender(
      're_key',
      'Care <c@example.com>',
      fetchImpl as typeof fetch,
    ),
  };
}

describe('ResendEmailSender', () => {
  it('posts the message and returns the provider id', async () => {
    const { fetchImpl, resend } = sender(200, { id: 'msg_1' });
    await expect(resend.send(message)).resolves.toEqual({ id: 'msg_1' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer re_key',
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: ['a@example.com'],
      tags: [{ name: 'kind', value: 'reminder' }],
    });
  });

  it.each([
    [429, 'RATE_LIMITED', true],
    [503, 'PROVIDER_503', true],
    [422, 'REJECTED_422', false],
    ['throw', 'NETWORK_ERROR', true],
  ] as const)(
    'maps %s to %s (retryable: %s)',
    async (status, code, retryable) => {
      const { resend } = sender(status);
      const err = await resend.send(message).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EmailSendError);
      expect(err).toMatchObject({ code, retryable });
    },
  );
});

describe('reminderEmail', () => {
  it('uses a neutral default with no health details', () => {
    expect(message.subject).toBe('Time for your daily check-in.');
    expect(message.text).toContain('https://app.test/reminders');
  });
});
