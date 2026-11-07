import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { MemoryEmailSender } from '../src/email/email-sender.js';
import {
  type Auth,
  PASSWORD,
  anonymous,
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  signUp,
  uniqueEmail,
} from './helpers.js';

/**
 * Password reset, email verification and reminder delivery, with EMAIL_PROVIDER=memory so
 * every message is captured. The scheduler's timer is effectively off (one hour); tests drive
 * ReminderDeliveryService.tick() with explicit times instead.
 */
describe('email and reminder delivery (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let mail: MemoryEmailSender;
  let delivery: { tick(now?: Date): Promise<Record<string, number>> };

  beforeAll(async () => {
    app = await createTestApp({
      EMAIL_PROVIDER: 'memory',
      REMINDER_DELIVERY_ENABLED: 'true',
      REMINDER_POLL_INTERVAL_MS: '3600000',
      APP_URL: 'http://app.test',
    });
    http = request(app.getHttpServer());
    prisma = await getPrisma(app);
    const { EMAIL_SENDER } = await import('../src/email/email-sender.js');
    const { ReminderDeliveryService } =
      await import('../src/reminders/reminder-delivery.service.js');
    mail = app.get(EMAIL_SENDER);
    delivery = app.get(ReminderDeliveryService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Sends happen in the background; wait for the next message to `to`. */
  async function nextEmail(to: string, tag: string) {
    for (let i = 0; i < 50; i++) {
      const found = mail.sent.find((m) => m.to === to && m.tag === tag);
      if (found) {
        mail.sent.splice(mail.sent.indexOf(found), 1);
        return found;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no ${tag} email to ${to}`);
  }

  const tokenFrom = (text: string) =>
    decodeURIComponent(/token=([^\s]+)/.exec(text)![1]);

  describe('email verification', () => {
    it('sends a link on sign-up that marks the address verified', async () => {
      const user = await signUp(app);
      const message = await nextEmail(user.email, 'email_verification');
      expect(message.text).toContain('http://app.test/verify-email?token=');
      await http
        .get('/v1/auth/verify-email')
        .query({ token: tokenFrom(message.text) })
        .expect(200);
      const me = await http.get('/v1/me').set(user).expect(200);
      expect(me.body.emailVerified).toBe(true);
    });

    it('expires verification links after 30 minutes and a replay changes nothing', async () => {
      const user = await signUp(app);
      const token = tokenFrom(
        (await nextEmail(user.email, 'email_verification')).text,
      );
      const claims = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ) as { iat: number; exp: number };
      expect(claims.exp - claims.iat).toBe(30 * 60);

      await http.get('/v1/auth/verify-email').query({ token }).expect(200);
      const replay = await http.get('/v1/auth/verify-email').query({ token });
      // No session is ever issued from a verification link.
      expect(replay.headers['set-cookie'] ?? []).toEqual([]);
      expect(replay.body.user ?? null).toBeNull();
    });

    it('resends verification without revealing whether an address exists', async () => {
      const user = await signUp(app);
      await nextEmail(user.email, 'email_verification');
      const nobody = uniqueEmail('nobody');
      const known = await http
        .post('/v1/auth/send-verification-email')
        .send({ email: user.email })
        .expect(200);
      const unknown = await http
        .post('/v1/auth/send-verification-email')
        .send({ email: nobody })
        .expect(200);
      expect(unknown.body).toEqual(known.body);
      const resent = await nextEmail(user.email, 'email_verification');
      expect(resent.text).toContain('http://app.test/verify-email?token=');
      await new Promise((r) => setTimeout(r, 100));
      expect(mail.sent.some((m) => m.to === nobody)).toBe(false);
    });

    it('rejects a tampered token', async () => {
      await http
        .get('/v1/auth/verify-email')
        .query({ token: 'not-a-real-token' })
        .expect(401);
    });
  });

  describe('password reset', () => {
    it('resets once with a hashed, single-use token and revokes old sessions', async () => {
      const user = await signUp(app);
      await nextEmail(user.email, 'email_verification');

      const res = await http
        .post('/v1/auth/request-password-reset')
        .send({ email: user.email })
        .expect(200);
      const message = await nextEmail(user.email, 'password_reset');
      const token = tokenFrom(message.text);
      expect(message.text).toContain('http://app.test/reset-password?token=');

      // Stored as a digest, never as the raw token.
      const stored = await prisma.authVerification.findMany({
        where: { value: user.id },
      });
      expect(stored.length).toBeGreaterThan(0);
      expect(stored.some((v) => v.identifier.includes(token))).toBe(false);
      // Valid for 30 minutes.
      const ttl = stored[0].expiresAt.getTime() - Date.now();
      expect(ttl).toBeGreaterThan(29 * 60_000);
      expect(ttl).toBeLessThanOrEqual(30 * 60_000);

      // Unknown addresses get the same answer and no email.
      const unknown = await http
        .post('/v1/auth/request-password-reset')
        .send({ email: uniqueEmail('nobody') })
        .expect(200);
      expect(unknown.body).toEqual(res.body);

      const newPassword = 'a brand new passphrase';
      await http
        .post('/v1/auth/reset-password')
        .send({ token, newPassword })
        .expect(200);
      // Single use.
      await http
        .post('/v1/auth/reset-password')
        .send({ token, newPassword: 'another passphrase here' })
        .expect(400);
      // The old session is revoked; old password no longer works; new one does.
      await http.get('/v1/me').set(user).expect(401);
      await http
        .post('/v1/auth/sign-in/email')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);
      await http
        .post('/v1/auth/sign-in/email')
        .send({ email: user.email, password: newPassword })
        .expect(200);
    });

    it('rejects an expired token', async () => {
      const user = await signUp(app);
      await http
        .post('/v1/auth/request-password-reset')
        .send({ email: user.email })
        .expect(200);
      const token = tokenFrom(
        (await nextEmail(user.email, 'password_reset')).text,
      );
      await prisma.authVerification.updateMany({
        where: { value: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http
        .post('/v1/auth/reset-password')
        .send({ token, newPassword: 'a brand new passphrase' })
        .expect(400);
    });

    it('enforces the minimum password length', async () => {
      const user = await signUp(app);
      await http
        .post('/v1/auth/request-password-reset')
        .send({ email: user.email })
        .expect(200);
      const token = tokenFrom(
        (await nextEmail(user.email, 'password_reset')).text,
      );
      await http
        .post('/v1/auth/reset-password')
        .send({ token, newPassword: 'short' })
        .expect(400);
    });
  });

  describe('reminder delivery', () => {
    async function verifiedUser(timeZone = 'Asia/Karachi') {
      const user = await signUp(app);
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone, locale: 'en' })
        .expect(200);
      return user;
    }

    async function emailReminder(
      user: Auth,
      body: Record<string, unknown> = {},
    ) {
      const res = await http
        .post('/v1/reminders')
        .set(user)
        .send({
          kind: 'daily_log',
          localTime: '20:00',
          recurrence: 'FREQ=DAILY',
          label: 'Evening check-in',
          channel: 'email',
          ...body,
        })
        .expect(201);
      return res.body as { id: string; nextRunAt: string; channel: string };
    }

    const deliveriesOf = (reminderId: string) =>
      prisma.reminderDelivery.findMany({
        where: { reminderId },
        orderBy: { scheduledFor: 'asc' },
      });
    const plus = (iso: string, ms: number) =>
      new Date(new Date(iso).getTime() + ms);

    it('reports what delivery the owner can use', async () => {
      const user = await verifiedUser();
      expect(
        (await http.get('/v1/reminders/delivery-options').set(user).expect(200))
          .body,
      ).toEqual({ channels: ['email'], emailVerified: true });
      const guest = await anonymous(app);
      expect(
        (
          await http
            .get('/v1/reminders/delivery-options')
            .set(guest)
            .expect(200)
        ).body,
      ).toEqual({ channels: [], emailVerified: false });
    });

    it('refuses email reminders for guests and unconfirmed addresses', async () => {
      const guest = await anonymous(app);
      await http
        .post('/v1/reminders')
        .set(guest)
        .send({
          kind: 'custom',
          localTime: '08:00',
          recurrence: 'FREQ=DAILY',
          channel: 'email',
        })
        .expect(400);
      const unverified = await signUp(app);
      const res = await http
        .post('/v1/reminders')
        .set(unverified)
        .send({
          kind: 'custom',
          localTime: '08:00',
          recurrence: 'FREQ=DAILY',
          channel: 'email',
        })
        .expect(409);
      expect(res.body.error.message).toMatch(/Confirm your email/);
    });

    it('schedules in the owner time zone and sends each occurrence exactly once', async () => {
      const user = await verifiedUser('Asia/Karachi');
      const reminder = await emailReminder(user);
      // 20:00 in Karachi (UTC+5) is 15:00 UTC.
      expect(reminder.nextRunAt).toMatch(/T15:00:00\.000Z$/);
      const due = plus(reminder.nextRunAt, 30_000);

      // Two schedulers racing (e.g. two API instances) still produce one send.
      await Promise.all([delivery.tick(due), delivery.tick(due)]);
      await delivery.tick(due);
      const rows = await deliveriesOf(reminder.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'sent', attempts: 1 });
      const sent = mail.sent.filter(
        (m) => m.to === user.email && m.tag === 'reminder',
      );
      expect(sent).toHaveLength(1);
      expect(sent[0].subject).toBe('Evening check-in');
      expect(sent[0].text).toContain('http://app.test/reminders');

      // The next occurrence is tomorrow at the same local time.
      const after = await prisma.reminder.findUniqueOrThrow({
        where: { id: reminder.id },
      });
      expect(after.nextRunAt!.getTime()).toBe(
        new Date(reminder.nextRunAt).getTime() + 86_400_000,
      );
    });

    it('retries retryable failures with backoff and gives up on permanent ones', async () => {
      const user = await verifiedUser();
      const reminder = await emailReminder(user);
      const due = plus(reminder.nextRunAt, 1000);

      // Targeted at this user: tick() also dispatches other tests' due deliveries, which
      // used to consume an untargeted failure and made this test flaky.
      mail.failures.push({
        code: 'RATE_LIMITED',
        retryable: true,
        to: user.email,
      });
      expect(await delivery.tick(due)).toMatchObject({ retried: 1 });
      let [row] = await deliveriesOf(reminder.id);
      expect(row).toMatchObject({
        status: 'pending',
        attempts: 1,
        lastErrorCode: 'RATE_LIMITED',
      });
      expect(row.nextAttemptAt.getTime()).toBe(due.getTime() + 60_000);

      // Not before the backoff has passed.
      expect(
        await delivery.tick(plus(due.toISOString(), 30_000)),
      ).toMatchObject({ sent: 0 });
      await delivery.tick(plus(due.toISOString(), 61_000));
      [row] = await deliveriesOf(reminder.id);
      expect(row).toMatchObject({ status: 'sent', attempts: 2 });

      // A permanent rejection fails without retrying.
      const other = await emailReminder(user, { localTime: '21:00' });
      mail.failures.push({
        code: 'REJECTED_422',
        retryable: false,
        to: user.email,
      });
      await delivery.tick(plus(other.nextRunAt, 1000));
      expect((await deliveriesOf(other.id))[0]).toMatchObject({
        status: 'failed',
        lastErrorCode: 'REJECTED_422',
      });
    });

    it('does not send twice when the provider accepted a send whose response was lost', async () => {
      const user = await verifiedUser();
      const reminder = await emailReminder(user);
      const due = plus(reminder.nextRunAt, 1000);
      // The provider accepts the message, then the response times out: the delivery retries.
      mail.failures.push({
        code: 'NETWORK_ERROR',
        retryable: true,
        to: user.email,
        afterAccept: true,
      });
      await delivery.tick(due);
      expect((await deliveriesOf(reminder.id))[0]).toMatchObject({
        status: 'pending',
        lastErrorCode: 'NETWORK_ERROR',
      });
      await delivery.tick(plus(due.toISOString(), 61_000));
      const [row] = await deliveriesOf(reminder.id);
      expect(row).toMatchObject({ status: 'sent', attempts: 2 });
      // The retry carried the same idempotency key, so the provider delivered one email.
      const sent = mail.sent.filter(
        (m) => m.to === user.email && m.tag === 'reminder',
      );
      expect(sent).toHaveLength(1);
      expect(sent[0].idempotencyKey).toBe(`reminder-delivery/${row.id}`);
    });

    it('cancels queued sends when a reminder is paused, and stops scheduling it', async () => {
      const user = await verifiedUser();
      const reminder = await emailReminder(user);
      const due = plus(reminder.nextRunAt, 1000);
      mail.failures.push({
        code: 'PROVIDER_503',
        retryable: true,
        to: user.email,
      });
      await delivery.tick(due);

      const paused = await http
        .patch(`/v1/reminders/${reminder.id}`)
        .set(user)
        .send({ enabled: false })
        .expect(200);
      expect(paused.body.nextRunAt).toBeNull();
      expect((await deliveriesOf(reminder.id))[0]).toMatchObject({
        status: 'cancelled',
        lastErrorCode: 'REMINDER_CHANGED',
      });
      expect(
        await delivery.tick(plus(due.toISOString(), 2 * 86_400_000)),
      ).toMatchObject({
        sent: 0,
        queued: 0,
      });
    });

    it('skips occurrences missed by more than an hour instead of sending them late', async () => {
      const user = await verifiedUser();
      const reminder = await emailReminder(user);
      const late = plus(reminder.nextRunAt, 2 * 3_600_000);
      expect(await delivery.tick(late)).toMatchObject({ skipped: 1, sent: 0 });
      expect((await deliveriesOf(reminder.id))[0]).toMatchObject({
        status: 'skipped',
        lastErrorCode: 'TOO_LATE',
      });
    });

    it('does not send to an address that is no longer verified', async () => {
      const user = await verifiedUser();
      const reminder = await emailReminder(user);
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: false },
      });
      await delivery.tick(plus(reminder.nextRunAt, 1000));
      expect((await deliveriesOf(reminder.id))[0]).toMatchObject({
        status: 'skipped',
        lastErrorCode: 'EMAIL_UNVERIFIED',
      });
    });

    it('moves the next send when the time zone changes', async () => {
      const user = await verifiedUser('Asia/Karachi');
      const reminder = await emailReminder(user);
      expect(reminder.nextRunAt).toMatch(/T15:00:00\.000Z$/);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'Asia/Tokyo', locale: 'en' })
        .expect(200);
      const [row] = (await http.get('/v1/reminders').set(user).expect(200))
        .body;
      // 20:00 in Tokyo (UTC+9) is 11:00 UTC.
      expect(row.nextRunAt).toMatch(/T11:00:00\.000Z$/);
    });

    it('deletes delivery history with the reminder and the account', async () => {
      const user = await verifiedUser();
      const reminder = await emailReminder(user);
      await delivery.tick(plus(reminder.nextRunAt, 1000));
      expect(await deliveriesOf(reminder.id)).toHaveLength(1);
      await http
        .post('/v1/me/deletion')
        .set(user)
        .send({ confirm: 'DELETE MY ACCOUNT' })
        .expect(204);
      expect(await deliveriesOf(reminder.id)).toHaveLength(0);
    });

    it('keeps delivery stats behind staff roles', async () => {
      const user = await verifiedUser();
      await http
        .get('/v1/admin/reminder-deliveries/stats')
        .set(user)
        .expect(403);
    });
  });

  describe('guest linking under concurrency', () => {
    async function guestWithPregnancy() {
      const guest = await anonymous(app);
      await grantHealthConsent(app, guest);
      await http
        .post('/v1/pregnancies')
        .set(guest)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(70) } })
        .expect(201);
      return guest;
    }

    it('links two guest sessions into one account one at a time', async () => {
      const [a, b] = await Promise.all([
        guestWithPregnancy(),
        guestWithPregnancy(),
      ]);
      const user = await signUp(app);
      const results = await Promise.all(
        [a, b].map((g) =>
          http
            .post('/v1/anonymous-sessions/link')
            .set(user)
            .send({ secret: g.secret }),
        ),
      );
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 409,
      ]);
      expect(await prisma.pregnancy.count({ where: { userId: user.id } })).toBe(
        1,
      );
    });

    it('links one guest session into only one of two racing accounts', async () => {
      const guest = await guestWithPregnancy();
      const [u1, u2] = await Promise.all([signUp(app), signUp(app)]);
      const results = await Promise.all(
        [u1, u2].map((u) =>
          http
            .post('/v1/anonymous-sessions/link')
            .set(u)
            .send({ secret: guest.secret }),
        ),
      );
      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        200, 404,
      ]);
      const owners = await prisma.pregnancy.findMany({
        where: { userId: { in: [u1.id, u2.id] } },
      });
      expect(owners).toHaveLength(1);
    });
  });
});
