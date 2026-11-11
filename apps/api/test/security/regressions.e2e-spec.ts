import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
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
 * Regression tests for the findings of docs/SECURITY_PENETRATION_TEST_REPORT.md (F-01, F-02,
 * F-04, F-05, P-08). Each reproduces the original attack against the real app and database
 * and fails if it succeeds again. F-03 is in regression-signup-enumeration.e2e-spec.ts.
 */
const ORIGIN = 'https://app.example.test';
const cookieOf = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');

function nested(levels: number): string {
  let body = '{"a":1}';
  for (let i = 0; i < levels; i++) body = `{"a":${body}}`;
  return body;
}

describe('Security regressions (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({ CORS_ORIGINS: ORIGIN });
    http = request(app.getHttpServer());
    prisma = await getPrisma(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('F-01: TOTP codes cannot be replayed', () => {
    async function enrol(user: { authorization: string }) {
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
      return secret;
    }
    async function challenge(email: string) {
      const res = await http
        .post('/v1/auth/sign-in/email')
        .set('Origin', ORIGIN)
        .send({ email, password: PASSWORD })
        .expect(200);
      expect(res.body.twoFactorRedirect).toBe(true);
      return cookieOf(res);
    }
    const verify = (cookie: string, code: string) =>
      http
        .post('/v1/auth/two-factor/verify-totp')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ code });

    it('refuses the same code in a second sign-in, with the same answer as a wrong code', async () => {
      const user = await signUp(app);
      const secret = await enrol(user);
      // The enrolment code was just used: a new code is needed to sign in.
      const code = totp(secret, Date.now() + 30_000);
      await verify(await challenge(user.email), code).expect(200);
      const replay = await verify(await challenge(user.email), code);
      const wrong = await verify(await challenge(user.email), '000000');
      expect(replay.status).toBe(401);
      expect(replay.body).toEqual(wrong.body);
    });

    it('lets exactly one of several concurrent requests with the same code through', async () => {
      const user = await signUp(app);
      const secret = await enrol(user);
      const code = totp(secret, Date.now() + 30_000);
      const cookies = await Promise.all(
        [1, 2, 3, 4, 5].map(() => challenge(user.email)),
      );
      const results = await Promise.all(cookies.map((c) => verify(c, code)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(results.filter((r) => r.status === 401)).toHaveLength(4);
    });

    it('protects administrator accounts the same way', async () => {
      const admin = await staffUser(app, prisma, 'administrator', false);
      const secret = await enrol(admin);
      const code = totp(secret, Date.now() + 30_000);
      await verify(await challenge(admin.email), code).expect(200);
      await verify(await challenge(admin.email), code).expect(401);
    });

    it('a wrong code does not block the right one, and a code from the next step works once', async () => {
      const user = await signUp(app);
      const secret = await enrol(user);
      const pending = await challenge(user.email);
      await verify(pending, '123456').expect(401);
      await verify(pending, totp(secret, Date.now() + 30_000)).expect(200);
      // Within the ±1-step window, a different (next) code is still accepted once.
      const next = totp(secret, Date.now() - 30_000);
      const res = await verify(await challenge(user.email), next);
      // The previous-step code was never used, so it is accepted (window), then refused.
      expect(res.status).toBe(200);
      await verify(await challenge(user.email), next).expect(401);
    });
  });

  describe('F-02: deeply nested JSON is refused, never a 500', () => {
    it('refuses 5,000 levels on public and authenticated routes, and stays healthy', async () => {
      const user = await signUp(app);
      const body = nested(5000);
      const results: string[] = [];
      for (const [path, auth] of [
        ['/v1/anonymous-sessions', undefined],
        ['/v1/symptom-checks', undefined],
        ['/v1/shopping-list', user],
        ['/v1/me/consents', user],
        ['/v1/auth/sign-in/email', undefined],
      ] as const) {
        const req = http
          .post(path)
          .set('Content-Type', 'application/json')
          .set('Origin', ORIGIN);
        const res = await (auth ? req.set(auth) : req).send(body);
        results.push(`${path} ${res.status}`);
        expect(res.status, path).toBeGreaterThanOrEqual(400);
        expect(res.status, path).toBeLessThan(500);
      }
      const nest = await http
        .post('/v1/shopping-list')
        .set(user)
        .set('Content-Type', 'application/json')
        .send(body);
      expect(nest.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(JSON.stringify(nest.body)).toContain('nested too deeply');
      await http.get('/v1/health/live').expect(200);
    });

    it('still accepts ordinary bodies', async () => {
      const user = await signUp(app);
      await http
        .post('/v1/shopping-list')
        .set(user)
        .send({ name: 'Oats' })
        .expect(201);
    });
  });

  describe('F-04: breached passwords of 8 characters and up are refused', () => {
    it('refuses Pass@123 at sign-up and on password change; accepts a fresh 8-character password', async () => {
      const res = await http
        .post('/v1/auth/sign-up/email')
        .send({ email: uniqueEmail(), password: 'Pass@123', name: 'X' })
        .expect(400);
      expect(res.body.code).toBe('PASSWORD_COMPROMISED');
      const user = await signUp(app);
      const change = await http
        .post('/v1/auth/change-password')
        .set(user)
        .send({ currentPassword: PASSWORD, newPassword: 'password1' })
        .expect(400);
      expect(change.body.code).toBe('PASSWORD_COMPROMISED');
      await http
        .post('/v1/auth/sign-up/email')
        .send({ email: uniqueEmail(), password: 'unusua-9', name: 'Y' })
        .expect(200);
      await http
        .post('/v1/auth/sign-up/email')
        .send({ email: uniqueEmail(), password: 'short-p', name: 'Z' })
        .expect(400);
    });
  });

  describe('F-05: refused origins get no CORS headers at all', () => {
    it('sends neither Allow-Origin nor Allow-Credentials to a refused preflight; the allowed origin gets both', async () => {
      const preflight = (origin: string) =>
        http
          .options('/v1/me/profile')
          .set('Origin', origin)
          .set('Access-Control-Request-Method', 'PUT')
          .set('Access-Control-Request-Headers', 'content-type');
      const evil = await preflight('https://evil.example');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
      expect(evil.headers['access-control-allow-credentials']).toBeUndefined();
      const good = await preflight(ORIGIN);
      expect(good.headers['access-control-allow-origin']).toBe(ORIGIN);
      expect(good.headers['access-control-allow-credentials']).toBe('true');
      expect(String(good.headers['access-control-expose-headers'])).toContain(
        'set-auth-token',
      );
    });
  });

  describe('P-08: cross-origin isolation on API responses', () => {
    it.each(['/v1/health/live', '/v1/auth/error'])(
      '%s sends Cross-Origin-Embedder-Policy',
      async (path) => {
        const res = await http.get(path);
        expect(res.headers['cross-origin-embedder-policy']).toBe(
          'require-corp',
        );
      },
    );
  });
});
