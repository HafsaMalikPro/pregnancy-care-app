import { randomBytes, scryptSync } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import type { MemoryEmailSender } from '../../src/email/email-sender.js';
import {
  createTestApp,
  getPrisma,
  PASSWORD,
  signUp,
  uniqueEmail,
} from '../helpers.js';

/**
 * Authentication and session controls (docs/SECURITY_CHECKLIST.md, section A). Each test
 * fails if its control is removed.
 */
const ORIGIN = 'https://app.example.test';

const cookieHeader = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .map((c) => c.split(';')[0])
    .filter((c) => !c.endsWith('='))
    .join('; ');

const setCookies = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []);

describe('Security: authentication and sessions (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;
  let mail: MemoryEmailSender;

  beforeAll(async () => {
    app = await createTestApp({
      CORS_ORIGINS: ORIGIN,
      EMAIL_PROVIDER: 'memory',
      APP_URL: 'http://app.test',
    });
    http = request(app.getHttpServer());
    prisma = await getPrisma(app);
    const { EMAIL_SENDER } = await import('../../src/email/email-sender.js');
    mail = app.get(EMAIL_SENDER);
  });

  afterAll(async () => {
    await app.close();
  });

  const signUpWith = (password: string, email = uniqueEmail('pw')) =>
    http
      .post('/v1/auth/sign-up/email')
      .send({ email, password, name: 'Test Person' });

  const signIn = (email: string, password: string) =>
    http
      .post('/v1/auth/sign-in/email')
      .set('Origin', ORIGIN)
      .send({ email, password });

  describe('password policy', () => {
    it('accepts 12 and 128 characters and rejects 11 and 129', async () => {
      await signUpWith('a'.repeat(5) + 'b'.repeat(6)).expect(400); // 11
      await signUpWith('unusual-pass').expect(200); // 12
      await signUpWith('x9'.repeat(64)).expect(200); // 128
      await signUpWith('x9'.repeat(64) + 'z').expect(400); // 129
    });

    it('rejects a breached password on sign-up, change and reset, case-insensitively', async () => {
      const res = await signUpWith('QWERTY123456').expect(400);
      expect(res.body.code).toBe('PASSWORD_COMPROMISED');

      const user = await signUp(app);
      const changed = await http
        .post('/v1/auth/change-password')
        .set(user)
        .send({ currentPassword: PASSWORD, newPassword: 'q1w2e3r4t5y6' })
        .expect(400);
      expect(changed.body.code).toBe('PASSWORD_COMPROMISED');

      await http
        .post('/v1/auth/request-password-reset')
        .send({
          email: user.email,
          redirectTo: 'http://app.test/reset-password',
        })
        .expect(200);
      const token = await resetToken(user.email);
      const reset = await http
        .post('/v1/auth/reset-password')
        .send({ token, newPassword: '1qaz2wsx3edc' })
        .expect(400);
      expect(reset.body.code).toBe('PASSWORD_COMPROMISED');
    });

    it('stores scrypt hashes with the documented OWASP parameters', async () => {
      const user = await signUp(app);
      const account = await prisma.authAccount.findFirstOrThrow({
        where: { userId: user.id, providerId: 'credential' },
      });
      expect(account.password).toMatch(
        /^scrypt\$32768\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{128}$/,
      );
    });

    it('still accepts a legacy Better Auth hash and upgrades it on sign-in', async () => {
      const user = await signUp(app);
      const salt = randomBytes(16).toString('hex');
      const key = scryptSync(PASSWORD.normalize('NFKC'), salt, 64, {
        N: 16384,
        r: 16,
        p: 1,
        maxmem: 128 * 16384 * 16 * 2,
      }).toString('hex');
      await prisma.authAccount.updateMany({
        where: { userId: user.id, providerId: 'credential' },
        data: { password: `${salt}:${key}` },
      });
      await signIn(user.email, PASSWORD).expect(200);
      const account = await prisma.authAccount.findFirstOrThrow({
        where: { userId: user.id, providerId: 'credential' },
      });
      expect(account.password).toMatch(/^scrypt\$32768\$8\$3\$/);
      await signIn(user.email, PASSWORD).expect(200);
    });
  });

  describe('sign-in', () => {
    it('answers a wrong password and an unknown email identically', async () => {
      const user = await signUp(app);
      const wrong = await signIn(user.email, 'not-the-right-password').expect(
        401,
      );
      const unknown = await signIn(
        uniqueEmail('nobody'),
        'not-the-right-password',
      ).expect(401);
      expect(wrong.body).toEqual(unknown.body);
    });

    it('locks an account after 5 failures, even for the right password, and for unknown emails too', async () => {
      const user = await signUp(app);
      for (let i = 0; i < 5; i++)
        await signIn(user.email, `wrong-password-${i}`).expect(401);
      const locked = await signIn(user.email, PASSWORD).expect(429);
      expect(locked.body.code).toBe('SIGN_IN_LOCKED');

      // An address with no account locks the same way, so a lockout reveals nothing.
      const ghost = uniqueEmail('ghost');
      for (let i = 0; i < 5; i++)
        await signIn(ghost, `wrong-password-${i}`).expect(401);
      const ghostLocked = await signIn(ghost, 'whatever-password').expect(429);
      expect(ghostLocked.body).toEqual(locked.body);
    });

    it('a successful sign-in resets the account counter', async () => {
      const user = await signUp(app);
      for (let i = 0; i < 4; i++)
        await signIn(user.email, `wrong-password-${i}`).expect(401);
      await signIn(user.email, PASSWORD).expect(200);
      for (let i = 0; i < 4; i++)
        await signIn(user.email, `wrong-password-${i}`).expect(401);
      await signIn(user.email, PASSWORD).expect(200);
    });

    it('lockout expires: an expired lock no longer blocks', async () => {
      const user = await signUp(app);
      for (let i = 0; i < 5; i++)
        await signIn(user.email, `wrong-password-${i}`).expect(401);
      await signIn(user.email, PASSWORD).expect(429);
      const { accountKey } = await import('../../src/auth/sign-in-throttle.js');
      await prisma.authThrottle.update({
        where: { key: accountKey(user.email) },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      await signIn(user.email, PASSWORD).expect(200);
    });
  });

  describe('sessions', () => {
    it('sets HttpOnly and SameSite=Lax on the session cookie', async () => {
      const user = await signUp(app);
      const res = await signIn(user.email, PASSWORD).expect(200);
      const session = setCookies(res).find((c) => c.includes('session_token='));
      expect(session).toMatch(/HttpOnly/i);
      expect(session).toMatch(/SameSite=Lax/i);
    });

    it('issues a new token on every sign-in', async () => {
      const user = await signUp(app);
      const a = await signIn(user.email, PASSWORD).expect(200);
      const b = await signIn(user.email, PASSWORD).expect(200);
      expect(a.headers['set-auth-token']).toBeTruthy();
      expect(a.headers['set-auth-token']).not.toBe(b.headers['set-auth-token']);
    });

    it('expires after 7 idle days and never more than 30 days after sign-in', async () => {
      const user = await signUp(app);
      const [row] = await prisma.authSession.findMany({
        where: { userId: user.id },
      });
      const idle = row.expiresAt.getTime() - row.createdAt.getTime();
      expect(Math.round(idle / 86_400_000)).toBe(7);

      // The database caps any later extension at created_at + 30 days.
      await prisma.authSession.update({
        where: { id: row.id },
        data: {
          expiresAt: new Date(row.createdAt.getTime() + 90 * 86_400_000),
        },
      });
      const capped = await prisma.authSession.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(capped.expiresAt.getTime() - capped.createdAt.getTime()).toBe(
        30 * 86_400_000,
      );

      // A session signed in 31 days ago is dead even though it was used yesterday.
      await prisma.$executeRaw`
        UPDATE auth_sessions
        SET created_at = now() - interval '31 days', expires_at = now() + interval '6 days'
        WHERE id = ${row.id}::uuid`;
      await http.get('/v1/me').set(user).expect(401);
    });

    it('a password change signs out every other session, even if the client asks not to', async () => {
      const user = await signUp(app);
      const other = await signIn(user.email, PASSWORD).expect(200);
      const otherAuth = {
        authorization: `Bearer ${other.headers['set-auth-token']}`,
      };
      await http.get('/v1/me').set(otherAuth).expect(200);
      await http
        .post('/v1/auth/change-password')
        .set(user)
        .send({
          currentPassword: PASSWORD,
          newPassword: 'a-different-passphrase-2026',
          revokeOtherSessions: false,
        })
        .expect(200);
      await http.get('/v1/me').set(otherAuth).expect(401);
    });

    it('a password change invalidates outstanding reset links', async () => {
      const user = await signUp(app);
      await http
        .post('/v1/auth/request-password-reset')
        .send({
          email: user.email,
          redirectTo: 'http://app.test/reset-password',
        })
        .expect(200);
      const token = await resetToken(user.email);
      const changed = await http
        .post('/v1/auth/change-password')
        .set(user)
        .send({
          currentPassword: PASSWORD,
          newPassword: 'changed-before-reset-2026',
        })
        .expect(200);
      expect(changed.status).toBe(200);
      await http
        .post('/v1/auth/reset-password')
        .send({ token, newPassword: 'attacker-chosen-passphrase' })
        .expect(400);
    });
  });

  describe('CSRF (cookie-authenticated writes)', () => {
    async function cookieSession() {
      const user = await signUp(app);
      const res = await signIn(user.email, PASSWORD).expect(200);
      return cookieHeader(res);
    }
    const consent = {
      purpose: 'health_data_processing',
      granted: true,
      policyVersion: '2026-10-01',
      source: 'test',
    };

    it('refuses a cross-origin POST and one with no Origin or Referer', async () => {
      const cookie = await cookieSession();
      const evil = await http
        .post('/v1/me/consents')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .send(consent)
        .expect(403);
      expect(evil.body.error).toMatchObject({
        code: 'FORBIDDEN',
        message: 'Cross-site request refused.',
      });
      await http
        .post('/v1/me/consents')
        .set('Cookie', cookie)
        .send(consent)
        .expect(403);
      await http
        .post('/v1/me/consents')
        .set('Cookie', cookie)
        .set('Referer', 'https://evil.example/page')
        .send(consent)
        .expect(403);
    });

    it('allows the same request from the website origin (Origin or Referer)', async () => {
      const cookie = await cookieSession();
      await http
        .post('/v1/me/consents')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send(consent)
        .expect(201);
      await http
        .post('/v1/me/consents')
        .set('Cookie', cookie)
        .set('Referer', `${ORIGIN}/settings`)
        .send(consent)
        .expect(201);
      // Reads are unaffected.
      await http.get('/v1/me').set('Cookie', cookie).expect(200);
    });

    it('also guards Better Auth routes that use the cookie', async () => {
      const cookie = await cookieSession();
      await http
        .post('/v1/auth/sign-out')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example')
        .send({})
        .expect(403);
      await http.get('/v1/me').set('Cookie', cookie).expect(200);
    });
  });

  describe('two-factor challenge', () => {
    it('the challenge cookie lasts 5 minutes', async () => {
      const user = await signUp(app);
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorEnabled: true },
      });
      await prisma.twoFactor.create({
        data: {
          userId: user.id,
          secret: 'x',
          backupCodes: 'x',
          verified: true,
        },
      });
      const res = await signIn(user.email, PASSWORD).expect(200);
      expect(res.body.twoFactorRedirect).toBe(true);
      const challenge = setCookies(res).find((c) => c.includes('two_factor='));
      expect(challenge).toMatch(/Max-Age=300\b/);
    });
  });

  describe('undocumented routes', () => {
    it('every Better Auth endpoint not in the OpenAPI document answers 404', async () => {
      const { AUTH } = await import('../../src/auth/auth.provider.js');
      const auth = app.get<{
        api: Record<
          string,
          { path?: string; options?: { method?: string | string[] } }
        >;
      }>(AUTH);
      const { body } = await http.get('/docs/openapi.json').expect(200);
      const documented = new Set(
        Object.entries(body.paths as Record<string, object>).flatMap(
          ([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`),
        ),
      );
      const reachable: string[] = [];
      for (const endpoint of Object.values(auth.api)) {
        if (!endpoint?.path || endpoint.path.startsWith('/:')) continue;
        const methods = ([] as string[]).concat(
          endpoint.options?.method ?? 'GET',
        );
        for (const method of methods.filter((m) => m !== '*')) {
          const route = `/v1/auth${endpoint.path}`;
          if (documented.has(`${method} ${route.replace(/:(\w+)/g, '{$1}')}`))
            continue;
          const res = await (
            http as unknown as Record<string, (p: string) => request.Test>
          )
            [method.toLowerCase()](route.replace(/:\w+/g, 'x'))
            .set('Origin', ORIGIN)
            .send({});
          // 405: the path exists for another method only (e.g. POST get-session).
          if (res.status !== 404 && res.status !== 405) {
            reachable.push(`${method} ${route} → ${res.status}`);
          }
        }
      }
      expect(reachable).toEqual([]);
    });
  });

  /** The reset token from the latest reset email to `to`. */
  async function resetToken(to: string): Promise<string> {
    for (let i = 0; i < 50; i++) {
      const found = mail.sent.find(
        (m) => m.to === to && m.tag === 'password_reset',
      );
      if (found) {
        mail.sent.splice(mail.sent.indexOf(found), 1);
        return decodeURIComponent(/token=([^\s]+)/.exec(found.text)![1]);
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`no reset email to ${to}`);
  }
});
