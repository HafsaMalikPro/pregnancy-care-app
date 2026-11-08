import type { INestApplication } from '@nestjs/common';
import { Me } from '@preconception/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  anonymous,
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  PASSWORD,
  signUp,
  uniqueEmail,
} from './helpers.js';

const PUBLIC_ROUTES = new Set([
  'GET /v1/health/live',
  'GET /v1/health',
  'POST /v1/anonymous-sessions',
  'GET /v1/articles',
  'GET /v1/articles/{slug}',
  'GET /v1/week-guides/{week}',
  'GET /v1/week-guides',
  'GET /v1/recipes',
  'GET /v1/recipes/{slug}',
  'GET /v1/activities',
  'GET /v1/activities/{slug}',
  'GET /v1/meal-plans',
  'GET /v1/meal-plans/{slug}',
  'GET /v1/symptom-checks/options',
  // Optional auth: anyone gets the triage result; it is saved only for a consenting owner.
  'POST /v1/symptom-checks',
  'GET /v1/visit-schedules',
  'GET /v1/postpartum-guides/{week}',
]);

describe('Identity and access (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getPrisma(app);
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('default deny', () => {
    it('every non-public route rejects requests without credentials (401)', async () => {
      const { body } = await http.get('/docs/openapi.json');
      const routes = Object.entries(body.paths as Record<string, object>)
        .filter(([path]) => !path.startsWith('/v1/auth/'))
        .flatMap(([path, ops]) => Object.keys(ops).map((m) => ({ m, path })));
      expect(routes.length).toBeGreaterThan(40);
      for (const { m, path } of routes) {
        const key = `${m.toUpperCase()} ${path}`;
        if (PUBLIC_ROUTES.has(key)) continue;
        const url = path
          .replace('{id}', '01a14ddb-0000-7000-8000-000000000000')
          .replace('{taskId}', '01a14ddb-0000-7000-8000-000000000000')
          .replace('{date}', '2026-01-01')
          .replace('{slug}', 'x')
          .replace('{week}', '12')
          .replace('{slot}', 'lunch')
          .replace('{recipeSlug}', 'x')
          .replace('{activitySlug}', 'x')
          .replace('{kind}', 'recipe')
          .replace('{key}', 'guide:w12');
        const res = await http[m as 'get'](url).send({});
        expect({ key, status: res.status }).toEqual({ key, status: 401 });
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
    });

    it.each([
      ['malformed bearer', 'Bearer not-a-real-token'],
      ['unknown anonymous secret', `Anonymous ${'a'.repeat(43)}`],
      ['malformed anonymous secret', 'Anonymous short'],
      ['unknown scheme', 'Basic dXNlcjpwYXNz'],
    ])('rejects %s with 401', async (_label, authorization) => {
      const res = await http.get('/v1/me').set({ authorization });
      expect(res.status).toBe(401);
    });
  });

  describe('registered users (Better Auth)', () => {
    it('signs up, signs in and resolves the session from a bearer token', async () => {
      const email = uniqueEmail('signin');
      await signUp(app, email);
      const signIn = await http
        .post('/v1/auth/sign-in/email')
        .send({ email, password: PASSWORD })
        .expect(200);
      const token = signIn.headers['set-auth-token'];
      const me = await http
        .get('/v1/me')
        .set('authorization', `Bearer ${token}`)
        .expect(200);
      expect(Me.parse(me.body)).toMatchObject({
        kind: 'user',
        email,
        staffRole: null,
      });
    });

    it('resolves the session from the cookie', async () => {
      const email = uniqueEmail('cookie');
      const res = await http
        .post('/v1/auth/sign-up/email')
        .send({ email, password: PASSWORD, name: 'Cookie' })
        .expect(200);
      const cookies = res.headers['set-cookie'] as unknown as string[];
      const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
      const me = await http.get('/v1/me').set('cookie', cookie).expect(200);
      expect(me.body.email).toBe(email);
    });

    it('rejects a wrong password', async () => {
      const user = await signUp(app);
      await http
        .post('/v1/auth/sign-in/email')
        .send({ email: user.email, password: 'wrong-password-999' })
        .expect(401);
    });

    it('rejects a password shorter than 12 characters', async () => {
      await http
        .post('/v1/auth/sign-up/email')
        .send({ email: uniqueEmail(), password: 'short-pw', name: 'x' })
        .expect(400);
    });

    it('rejects a duplicate email', async () => {
      const user = await signUp(app);
      const res = await http
        .post('/v1/auth/sign-up/email')
        .send({ email: user.email, password: PASSWORD, name: 'Dup' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('cannot set its own staff role or status at sign-up', async () => {
      const res = await http.post('/v1/auth/sign-up/email').send({
        email: uniqueEmail(),
        password: PASSWORD,
        name: 'x',
        staffRole: 'administrator',
      });
      if (res.status === 200) {
        const row = await prisma.user.findUniqueOrThrow({
          where: { id: res.body.user.id },
        });
        expect(row.staffRole).toBeNull();
      } else {
        expect(res.status).toBe(400);
      }
    });

    it('stops accepting the token after sign-out', async () => {
      const user = await signUp(app);
      await http.post('/v1/auth/sign-out').set(user).send({}).expect(200);
      await http.get('/v1/me').set(user).expect(401);
    });

    it('rejects a user whose account is not active', async () => {
      const user = await signUp(app);
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'pending_deletion' },
      });
      await http.get('/v1/me').set(user).expect(401);
    });

    it.each([
      ['post', '/v1/auth/delete-user'],
      ['get', '/v1/auth/delete-user/callback?token=x'],
      ['post', '/v1/auth/sign-in/social'],
      ['get', '/v1/auth/callback/google'],
      ['post', '/v1/auth/request-password-reset'],
      ['get', '/v1/auth/reset-password/some-token'],
      ['post', '/v1/auth/change-email'],
      ['post', '/v1/auth/two-factor/send-otp'],
      ['post', '/v1/auth/update-session'],
      ['post', '/v1/auth/revoke-sessions'],
    ] as const)(
      'disables unsupported auth endpoint %s %s (404)',
      async (method, path) => {
        const user = await signUp(app);
        const res = await http[method](path)
          .set(user)
          .send({ provider: 'google', email: 'x@y.test' });
        expect(res.status).toBe(404);
      },
    );

    it('cannot grant itself a staff role through update-user', async () => {
      const user = await signUp(app);
      await http.post('/v1/auth/update-user').set(user).send({
        name: 'Renamed',
        staffRole: 'administrator',
        status: 'active',
        twoFactorEnabled: true,
      });
      const row = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(row.staffRole).toBeNull();
      expect(row.twoFactorEnabled).toBe(false);
    });

    it('never returns password hashes', async () => {
      const email = uniqueEmail();
      const res = await http
        .post('/v1/auth/sign-up/email')
        .send({ email, password: PASSWORD, name: 'x' });
      expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
      expect(JSON.stringify(res.body)).not.toMatch(/scrypt|\$argon|"password"/);
    });
  });

  describe('anonymous sessions', () => {
    it('creates a session, stores only a hash and resolves it', async () => {
      const anon = await anonymous(app);
      expect(anon.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const row = await prisma.anonymousSession.findUniqueOrThrow({
        where: { id: anon.id },
      });
      expect(row.credentialHash).not.toContain(anon.secret);
      expect(row.credentialHash).toMatch(/^[0-9a-f]{64}$/);
      const me = await http.get('/v1/me').set(anon).expect(200);
      expect(me.body).toMatchObject({ kind: 'anonymous', id: anon.id });
    });

    it.each([{}, { platform: 'windows' }, { platform: 'ios', extra: 1 }])(
      'validates the body %j',
      async (body) => {
        await http.post('/v1/anonymous-sessions').send(body).expect(400);
      },
    );

    it('rejects an expired session', async () => {
      const anon = await anonymous(app);
      await prisma.anonymousSession.update({
        where: { id: anon.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http.get('/v1/me').set(anon).expect(401);
    });

    it('extends retention when last seen more than a day ago', async () => {
      const anon = await anonymous(app);
      const old = new Date(Date.now() - 3 * 86_400_000);
      await prisma.anonymousSession.update({
        where: { id: anon.id },
        data: { lastSeenAt: old, expiresAt: new Date(Date.now() + 86_400_000) },
      });
      await http.get('/v1/me').set(anon).expect(200);
      const row = await prisma.anonymousSession.findUniqueOrThrow({
        where: { id: anon.id },
      });
      expect(row.lastSeenAt.getTime()).toBeGreaterThan(old.getTime());
      expect(row.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 100 * 86_400_000,
      );
    });

    it('cannot use user-only routes (403)', async () => {
      const anon = await anonymous(app);
      const res = await http
        .post('/v1/me/deletion')
        .set(anon)
        .send({ confirm: 'DELETE MY ACCOUNT' });
      expect(res.status).toBe(403);
    });

    it('deletes itself and every record it owns', async () => {
      const anon = await anonymous(app);
      await grantHealthConsent(app, anon);
      await http
        .post('/v1/cycles')
        .set(anon)
        .send({ periodStart: daysAgo(10) })
        .expect(201);
      await http.delete('/v1/anonymous-sessions/current').set(anon).expect(204);
      expect(
        await prisma.cycle.count({ where: { anonymousSessionId: anon.id } }),
      ).toBe(0);
      expect(
        await prisma.consentRecord.count({
          where: { anonymousSessionId: anon.id },
        }),
      ).toBe(0);
      await http.get('/v1/me').set(anon).expect(401);
    });

    it('a registered user cannot use the anonymous delete route', async () => {
      const user = await signUp(app);
      await http.delete('/v1/anonymous-sessions/current').set(user).expect(403);
    });
  });

  describe('linking anonymous data to an account', () => {
    it('moves records, keeps them readable, and retires the secret', async () => {
      const anon = await anonymous(app);
      await grantHealthConsent(app, anon);
      await http
        .post('/v1/cycles')
        .set(anon)
        .send({ periodStart: daysAgo(40) })
        .expect(201);
      await http
        .put(`/v1/daily-logs/${daysAgo(3)}`)
        .set(anon)
        .send({ symptoms: ['fatigue'] })
        .expect(200);
      await http
        .put('/v1/me/profile')
        .set(anon)
        .send({ timeZone: 'Europe/Paris', locale: 'en' })
        .expect(200);

      const user = await signUp(app);
      const res = await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: anon.secret })
        .expect(200);
      expect(res.body).toEqual({
        pregnancies: 0,
        cycles: 1,
        dailyLogs: 1,
        taskProgress: 0,
        consentRecords: 1,
        reminders: 0,
        profile: true,
      });

      const cycles = await http.get('/v1/cycles').set(user).expect(200);
      expect(cycles.body.page.total).toBe(1);
      const profile = await http.get('/v1/me/profile').set(user).expect(200);
      expect(profile.body.timeZone).toBe('Europe/Paris');
      await http.get('/v1/me').set(anon).expect(401);

      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'anonymous_session.linked', targetId: anon.id },
      });
      expect(audit?.actorUserId).toBe(user.id);
    });

    it('refuses when the account already has health data (409)', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      await http
        .post('/v1/cycles')
        .set(user)
        .send({ periodStart: daysAgo(5) })
        .expect(201);
      const anon = await anonymous(app);
      await grantHealthConsent(app, anon);
      await http
        .post('/v1/cycles')
        .set(anon)
        .send({ periodStart: daysAgo(3) })
        .expect(201);
      const res = await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: anon.secret });
      expect(res.status).toBe(409);
      // A specific code, so the website can offer "keep guest data" or "export".
      expect(res.body.error.code).toBe('ACCOUNT_HAS_HEALTH_DATA');

      // Nothing moved and the guest secret still works: the claim rolled back.
      await http.get('/v1/me').set(anon).expect(200);
      const guestCycles = await http.get('/v1/cycles').set(anon).expect(200);
      expect(guestCycles.body.page.total).toBe(1);
      const userCycles = await http.get('/v1/cycles').set(user).expect(200);
      expect(userCycles.body.page.total).toBe(1);
      const session = await prisma.anonymousSession.findUnique({
        where: { id: anon.id },
      });
      expect(session?.linkedUserId).toBeNull();
      // The guest can still export before deciding.
      await http.post('/v1/me/export').set(anon).expect(200);

      // And a retry against an empty account succeeds with the same secret.
      const fresh = await signUp(app);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(fresh)
        .send({ secret: anon.secret })
        .expect(200);
      await http.get('/v1/me').set(anon).expect(401);
    });

    it('returns 404 for an unknown secret and 400 for a malformed one', async () => {
      const user = await signUp(app);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: 'b'.repeat(43) })
        .expect(404);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: 'nope' })
        .expect(400);
    });

    it('requires a registered user', async () => {
      const a = await anonymous(app);
      const b = await anonymous(app);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(a)
        .send({ secret: b.secret })
        .expect(403);
    });
  });
});
