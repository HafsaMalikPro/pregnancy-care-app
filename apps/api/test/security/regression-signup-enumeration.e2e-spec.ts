import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { MemoryEmailSender } from '../../src/email/email-sender.js';
import { createTestApp, PASSWORD, uniqueEmail } from '../helpers.js';

/**
 * F-03 regression: sign-up must not reveal whether an email is registered, including through
 * the follow-up sign-in. Runs the configuration production requires (email verification on).
 */
describe('Security regression F-03: no account enumeration through sign-up (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let mail: MemoryEmailSender;

  beforeAll(async () => {
    app = await createTestApp({
      EMAIL_PROVIDER: 'memory',
      APP_URL: 'http://app.test',
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'true',
    });
    http = request(app.getHttpServer());
    const { EMAIL_SENDER } = await import('../../src/email/email-sender.js');
    mail = app.get(EMAIL_SENDER);
  });

  afterAll(async () => {
    await app.close();
  });

  const signUp = (email: string, password = PASSWORD) =>
    http
      .post('/v1/auth/sign-up/email')
      .send({ email, password, name: 'Same Name' });
  /** The response with every value that differs per request removed. */
  const shape = (res: request.Response) => ({
    status: res.status,
    keys: Object.keys(res.body).sort(),
    token: res.body.token,
    userKeys: Object.keys(res.body.user ?? {}).sort(),
    emailVerified: res.body.user?.emailVerified,
    sessionCookie: ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .some((c) => c.includes('session_token=') && !c.includes('Max-Age=0')),
  });
  async function waitFor(to: string, tag: string) {
    for (let i = 0; i < 50; i++) {
      const found = mail.sent.find((m) => m.to === to && m.tag === tag);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    return undefined;
  }

  it('answers a new and an existing email identically (no 422, no session)', async () => {
    const existing = uniqueEmail('exists');
    await signUp(existing).expect(200);
    const again = await signUp(existing, 'a-different-password-77');
    const fresh = await signUp(uniqueEmail('fresh'), 'a-different-password-77');
    expect(again.status).toBe(200);
    expect(shape(again)).toEqual(shape(fresh));
    expect(again.body.token).toBeNull();
    expect(JSON.stringify(again.body)).not.toMatch(/exist|already/i);
    // The real owner is told by email instead.
    expect(await waitFor(existing, 'account_exists')).toBeDefined();
  });

  it('the follow-up sign-in is also indistinguishable: unverified and wrong password give the same 401', async () => {
    const existing = uniqueEmail('exists2');
    await signUp(existing).expect(200);
    // Attacker signs up an existing address and a new one, then tries to sign in to both.
    await signUp(existing, 'attacker-password-77').expect(200);
    const fresh = uniqueEmail('fresh2');
    await signUp(fresh, 'attacker-password-77').expect(200);
    const intoExisting = await http
      .post('/v1/auth/sign-in/email')
      .send({ email: existing, password: 'attacker-password-77' });
    const intoFresh = await http
      .post('/v1/auth/sign-in/email')
      .send({ email: fresh, password: 'attacker-password-77' });
    expect(intoExisting.status).toBe(401);
    expect(intoFresh.status).toBe(401);
    expect(intoFresh.body).toEqual(intoExisting.body);
  });

  it('legitimate registration still works: verify by email link, then sign in', async () => {
    const email = uniqueEmail('legit');
    await signUp(email).expect(200);
    const message = await waitFor(email, 'email_verification');
    expect(message?.text).toContain('http://app.test/verify-email?token=');
    const token = decodeURIComponent(/token=([^\s]+)/.exec(message!.text)![1]);
    await http.get('/v1/auth/verify-email').query({ token }).expect(200);
    const signIn = await http
      .post('/v1/auth/sign-in/email')
      .send({ email, password: PASSWORD })
      .expect(200);
    expect(signIn.headers['set-auth-token']).toBeTruthy();
  });
});
