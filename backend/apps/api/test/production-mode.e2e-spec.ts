import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  createTestApp,
  getPrisma,
  PASSWORD,
  productionEnv,
  uniqueEmail,
} from './helpers.js';

describe('Production mode (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Production refuses unsafe settings at boot (see config/env.ts), so use real-looking ones.
    // A configuration production accepts (see config/env.ts and helpers.productionEnv). Email is
    // Resend in name only: the test helper swaps in the in-memory sender.
    app = await createTestApp(productionEnv());
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['/docs', '/docs/openapi.json', '/docs-yaml'])(
    'does not expose %s',
    async (path) => {
      await request(app.getHttpServer()).get(path).expect(404);
    },
  );

  it.each([
    '/v1/auth/request-password-reset',
    '/v1/auth/reset-password',
    '/v1/auth/send-verification-email',
  ])('serves %s (production requires an email provider)', async (path) => {
    const res = await request(app.getHttpServer())
      .post(path)
      .set('Origin', 'https://app.example.test')
      .send({});
    expect(res.status).not.toBe(404);
  });

  it('sends HSTS and the strict API CSP in production', async () => {
    const res = await request(app.getHttpServer()).get('/v1/health/live');
    expect(res.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
  });

  it('does not serve the Better Auth schema endpoint', async () => {
    await request(app.getHttpServer())
      .get('/v1/auth/open-api/generate-schema')
      .expect(404);
  });

  it('still serves health probes', async () => {
    await request(app.getHttpServer()).get('/v1/health/live').expect(200);
  });

  it('issues session cookies with the Secure and HttpOnly attributes', async () => {
    const http = request(app.getHttpServer());
    const email = uniqueEmail();
    // Production requires email verification (F-03): sign-up starts no session.
    const up = await http
      .post('/v1/auth/sign-up/email')
      .set('Origin', 'https://app.example.test')
      .send({ email, password: PASSWORD, name: 'Prod Check' })
      .expect(200);
    expect(up.body.token).toBeNull();
    const prisma = await getPrisma(app);
    await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });
    const res = await http
      .post('/v1/auth/sign-in/email')
      .set('Origin', 'https://app.example.test')
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const session = cookies.find((c) => c.includes('session_token='));
    expect(session).toBeDefined();
    expect(session).toMatch(/;\s*Secure/i);
    expect(session).toMatch(/;\s*HttpOnly/i);
    // Better Auth prefixes secure cookies with __Secure-.
    expect(session).toMatch(/^__Secure-/);
  });
});
