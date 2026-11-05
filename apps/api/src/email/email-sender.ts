import { Logger } from '@nestjs/common';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Short machine-readable kind for logs and provider tags; never personal data. */
  tag: 'password_reset' | 'email_verification' | 'reminder';
}

export interface SentEmail {
  /** Provider message id, when the provider returns one. */
  id: string | null;
}

/** A failed send. `retryable` is true for rate limits, provider outages and network errors. */
export class EmailSendError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(`Email send failed: ${code}`);
  }
}

/** Injection token for the configured sender. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  readonly enabled: boolean;
  send(message: EmailMessage): Promise<SentEmail>;
}

/** EMAIL_PROVIDER=none: features that need email stay switched off. */
export class DisabledEmailSender implements EmailSender {
  readonly enabled = false;
  send(): Promise<SentEmail> {
    return Promise.reject(new EmailSendError('EMAIL_DISABLED', false));
  }
}

/**
 * EMAIL_PROVIDER=log, development only (env validation rejects it in production). Prints the
 * whole message, including reset and verification links, so flows can be tried locally.
 */
export class LogEmailSender implements EmailSender {
  readonly enabled = true;
  private readonly logger = new Logger('Email');
  send(message: EmailMessage): Promise<SentEmail> {
    this.logger.log(
      `[${message.tag}] to ${message.to}: ${message.subject}\n${message.text}`,
    );
    return Promise.resolve({ id: null });
  }
}

/** Keeps messages in memory. Used by tests (EMAIL_PROVIDER=memory, NODE_ENV=test only). */
export class MemoryEmailSender implements EmailSender {
  readonly enabled = true;
  readonly sent: EmailMessage[] = [];
  /** Codes to fail the next sends with, in order, e.g. ['RATE_LIMITED']. */
  readonly failures: { code: string; retryable: boolean }[] = [];
  send(message: EmailMessage): Promise<SentEmail> {
    const failure = this.failures.shift();
    if (failure) {
      return Promise.reject(
        new EmailSendError(failure.code, failure.retryable),
      );
    }
    this.sent.push(message);
    return Promise.resolve({ id: `memory-${this.sent.length}` });
  }
}

/** Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendEmailSender implements EmailSender {
  readonly enabled = true;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<SentEmail> {
    let res: Response;
    try {
      res = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          tags: [{ name: 'kind', value: message.tag }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new EmailSendError('NETWORK_ERROR', true);
    }
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as {
        id?: string;
      } | null;
      return { id: body?.id ?? null };
    }
    if (res.status === 429) throw new EmailSendError('RATE_LIMITED', true);
    if (res.status >= 500)
      throw new EmailSendError(`PROVIDER_${res.status}`, true);
    throw new EmailSendError(`REJECTED_${res.status}`, false);
  }
}
