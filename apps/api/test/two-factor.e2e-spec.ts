import { createHmac } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, PASSWORD, signUp } from './helpers.js';

/** RFC 4648 base32 → bytes (TOTP secrets in otpauth URIs are base32). */
function base32(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of input.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s): what an authenticator app shows. */
function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, '0');
}

/** Browsers send Origin on every cookie-authenticated POST; the CSRF check requires it. */
const ORIGIN = 'https://app.example.test';

const cookieHeader = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .map((c) => c.split(';')[0])
    .join('; ');

describe('Two-factor sign-in, including backup codes (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp({ CORS_ORIGINS: ORIGIN });
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  /** A user with TOTP enabled, plus the backup codes shown once at enrolment. */
  async function enrolled() {
    const user = await signUp(app);
    const enable = await http
      .post('/v1/auth/two-factor/enable')
      .set(user)
      .send({ password: PASSWORD })
      .expect(200);
    const backupCodes: string[] = enable.body.backupCodes;
    expect(backupCodes.length).toBeGreaterThan(0);
    const secret = new URL(enable.body.totpURI).searchParams.get('secret')!;
    // Enrolment is confirmed with a first code from the authenticator app. Better Auth
    // replaces the session at this point, so later calls use the new token.
    const verified = await http
      .post('/v1/auth/two-factor/verify-totp')
      .set(user)
      .send({ code: totp(secret) })
      .expect(200);
    const token = verified.headers['set-auth-token'];
    return {
      ...user,
      authorization: `Bearer ${token}`,
      secret,
      backupCodes,
    };
  }

  /** Password step: returns the pending two-factor cookie, not a session. */
  async function passwordStep(email: string) {
    const res = await http
      .post('/v1/auth/sign-in/email')
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(res.body.twoFactorRedirect).toBe(true);
    expect(res.body.token).toBeUndefined();
    // Better Auth's bearer plugin still echoes a set-auth-token header here, but that session
    // was deleted before the response: it must not authenticate.
    const echoed = res.headers['set-auth-token'];
    if (echoed) {
      await http
        .get('/v1/me')
        .set('authorization', `Bearer ${echoed}`)
        .expect(401);
    }
    return cookieHeader(res);
  }

  it('the password alone does not create a session once 2FA is on', async () => {
    const user = await enrolled();
    const pending = await passwordStep(user.email);
    await http
      .get('/v1/me')
      .set('Origin', ORIGIN)
      .set('Cookie', pending)
      .expect(401);
  });

  it('signs in with a TOTP code after the password step', async () => {
    const user = await enrolled();
    const pending = await passwordStep(user.email);
    const res = await http
      .post('/v1/auth/two-factor/verify-totp')
      .set('Origin', ORIGIN)
      .set('Cookie', pending)
      .send({ code: totp(user.secret) })
      .expect(200);
    await http
      .get('/v1/me')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieHeader(res))
      .expect(200);
  });

  it('signs in with a backup code, which then cannot be reused', async () => {
    const user = await enrolled();
    const [code] = user.backupCodes;

    const pending = await passwordStep(user.email);
    const res = await http
      .post('/v1/auth/two-factor/verify-backup-code')
      .set('Origin', ORIGIN)
      .set('Cookie', pending)
      .send({ code })
      .expect(200);
    const session = cookieHeader(res);
    const me = await http
      .get('/v1/me')
      .set('Origin', ORIGIN)
      .set('Cookie', session)
      .expect(200);
    expect(me.body.id).toBe(user.id);
    expect(me.body.twoFactorEnabled).toBe(true);

    // Single use: the same code fails on the next sign-in.
    const again = await passwordStep(user.email);
    const reuse = await http
      .post('/v1/auth/two-factor/verify-backup-code')
      .set('Origin', ORIGIN)
      .set('Cookie', again)
      .send({ code });
    expect(reuse.status).toBeGreaterThanOrEqual(400);
    expect(reuse.status).toBeLessThan(500);

    // Another unused code still works.
    await http
      .post('/v1/auth/two-factor/verify-backup-code')
      .set('Origin', ORIGIN)
      .set('Cookie', again)
      .send({ code: user.backupCodes[1] })
      .expect(200);
  });

  it('rejects a wrong backup code and a backup code without the password step', async () => {
    const user = await enrolled();
    const pending = await passwordStep(user.email);
    const wrong = await http
      .post('/v1/auth/two-factor/verify-backup-code')
      .set('Origin', ORIGIN)
      .set('Cookie', pending)
      .send({ code: 'not-a-real-code' });
    expect(wrong.status).toBeGreaterThanOrEqual(400);
    expect(wrong.status).toBeLessThan(500);

    const noPending = await http
      .post('/v1/auth/two-factor/verify-backup-code')
      .send({ code: user.backupCodes[0] });
    expect(noPending.status).toBeGreaterThanOrEqual(400);
    expect(noPending.status).toBeLessThan(500);
  });

  it('regenerating backup codes invalidates the old ones', async () => {
    const user = await enrolled();
    const regen = await http
      .post('/v1/auth/two-factor/generate-backup-codes')
      .set(user)
      .send({ password: PASSWORD })
      .expect(200);
    const fresh: string[] = regen.body.backupCodes;
    expect(fresh).not.toContain(user.backupCodes[0]);

    const pending = await passwordStep(user.email);
    const old = await http
      .post('/v1/auth/two-factor/verify-backup-code')
      .set('Origin', ORIGIN)
      .set('Cookie', pending)
      .send({ code: user.backupCodes[0] });
    expect(old.status).toBeGreaterThanOrEqual(400);
    await http
      .post('/v1/auth/two-factor/verify-backup-code')
      .set('Origin', ORIGIN)
      .set('Cookie', pending)
      .send({ code: fresh[0] })
      .expect(200);
  });
});
