import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { SecurityEventsService } from '../../src/audit/security-events.service.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import {
  createTestApp,
  getPrisma,
  PASSWORD,
  signUp,
  staffUser,
  uniqueEmail,
} from '../helpers.js';
import { totp } from '../support/totp.js';

/**
 * Security events and request ids (docs/SECURITY_CHECKLIST.md, section H; docs/MONITORING.md).
 * Each event must be written, queryable by action, and free of raw emails and IPs.
 */
const ORIGIN = 'https://app.example.test';

describe('Security: events, request ids and health exposure (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let events: SecurityEventsService;

  beforeAll(async () => {
    app = await createTestApp({ CORS_ORIGINS: ORIGIN });
    http = request(app.getHttpServer());
    prisma = await getPrisma(app);
    const { SecurityEventsService } =
      await import('../../src/audit/security-events.service.js');
    events = app.get(SecurityEventsService);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Events of `action` written for this request id. */
  async function eventsFor(action: string, requestId: string) {
    await events.flush();
    return prisma.auditEvent.findMany({ where: { action, requestId } });
  }

  it('records failed sign-ins and the lock they cause, with pseudonyms only', async () => {
    const user = await signUp(app);
    let last!: request.Response;
    for (let i = 0; i < 5; i++) {
      last = await http
        .post('/v1/auth/sign-in/email')
        .send({ email: user.email, password: `wrong-password-${i}` })
        .expect(401);
    }
    const requestId = last.headers['x-request-id'];
    const [failed] = await eventsFor('security.sign_in_failed', requestId);
    expect(failed.metadata).toMatchObject({
      accountRef: expect.stringMatching(/^acct_[0-9a-f]{32}$/),
      ipRef: expect.stringMatching(/^ip_/),
    });
    const [locked] = await eventsFor('security.sign_in_locked', requestId);
    expect(locked.metadata).toMatchObject({ lockSeconds: 60 });
    for (const e of [failed, locked]) {
      const text = JSON.stringify(e);
      expect(text).not.toContain(user.email);
      expect(text).not.toMatch(/127\.0\.0\.1|::1|wrong-password/);
    }
    // The same account always maps to the same pseudonym (correlation without the email).
    const other = await http
      .post('/v1/auth/sign-in/email')
      .send({ email: uniqueEmail('x'), password: 'nope-nope-nope' });
    const [otherEvent] = await eventsFor(
      'security.sign_in_failed',
      other.headers['x-request-id'],
    );
    expect((otherEvent.metadata as { accountRef: string }).accountRef).not.toBe(
      (failed.metadata as { accountRef: string }).accountRef,
    );
  });

  it('records two-factor failures', async () => {
    const user = await signUp(app);
    const enable = await http
      .post('/v1/auth/two-factor/enable')
      .set(user)
      .send({ password: PASSWORD })
      .expect(200);
    const secret = new URL(enable.body.totpURI).searchParams.get('secret')!;
    await http
      .post('/v1/auth/two-factor/verify-totp')
      .set(user)
      .send({ code: totp(secret) })
      .expect(200);
    const signIn = await http
      .post('/v1/auth/sign-in/email')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const cookie = ([] as string[])
      .concat(signIn.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0])
      .join('; ');
    const wrong = await http
      .post('/v1/auth/two-factor/verify-totp')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ code: '000000' });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    const [event] = await eventsFor(
      'security.two_factor_failed',
      wrong.headers['x-request-id'],
    );
    expect(event.metadata).toMatchObject({ method: 'totp' });
  });

  it('records staff-route denials with the reason', async () => {
    const user = await signUp(app);
    const res = await http.get('/v1/admin/users').set(user).expect(403);
    const [denied] = await eventsFor(
      'security.staff_access_denied',
      res.headers['x-request-id'],
    );
    expect(denied).toMatchObject({
      actorUserId: user.id,
      metadata: { route: 'GET /v1/admin/users', reason: 'role' },
    });

    const noMfa = await staffUser(app, prisma, 'administrator', false);
    const res2 = await http.get('/v1/admin/users').set(noMfa).expect(403);
    const [mfa] = await eventsFor(
      'security.staff_access_denied',
      res2.headers['x-request-id'],
    );
    expect(mfa.metadata).toMatchObject({ reason: 'two_factor_required' });
  });

  it('records refused cross-site requests', async () => {
    const user = await signUp(app);
    const signIn = await http
      .post('/v1/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const cookie = ([] as string[])
      .concat(signIn.headers['set-cookie'] ?? [])
      .map((c) => c.split(';')[0])
      .filter((c) => !c.endsWith('='))
      .join('; ');
    const res = await http
      .post('/v1/me/consents')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
    const [event] = await eventsFor(
      'security.csrf_rejected',
      res.headers['x-request-id'],
    );
    expect(event.metadata).toMatchObject({ route: 'POST /v1/me/consents' });
  });

  it('events are queryable by administrators', async () => {
    const admin = await staffUser(app, prisma, 'administrator');
    const res = await http
      .get('/v1/admin/audit-events')
      .query({ action: 'security.sign_in_failed', limit: 5 })
      .set(admin)
      .expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(
      res.body.items.every(
        (e: { action: string }) => e.action === 'security.sign_in_failed',
      ),
    ).toBe(true);
  });

  it('every response carries a request id, and error bodies repeat it', async () => {
    const ok = await http.get('/v1/health/live').expect(200);
    expect(ok.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const err = await http.get('/v1/me').expect(401);
    expect(err.body.error.requestId).toBe(err.headers['x-request-id']);
    const auth = await http
      .post('/v1/auth/sign-in/email')
      .send({ email: 'bad', password: 'x' });
    expect(auth.headers['x-request-id']).toBeTruthy();
  });

  it('health endpoints reveal status only, never versions or internals', async () => {
    const live = await http.get('/v1/health/live').expect(200);
    expect(live.body).toEqual({ status: 'ok' });
    const ready = await http.get('/v1/health').expect(200);
    expect(ready.body).toEqual({ status: 'ok', database: 'up' });
    for (const res of [live, ready]) {
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers.server).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(
        /version|uptime|node|postgres|memory/i,
      );
    }
  });
});
