import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, PASSWORD, uniqueEmail } from './helpers.js';

describe('Production mode (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Production refuses unsafe settings at boot (see config/env.ts), so use real-looking ones.
    app = await createTestApp({
      NODE_ENV: 'production',
      // Production refuses weak or placeholder secrets (CI's shared value is one).
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
      RATE_LIMIT_ENABLED: 'true',
      ADMIN_REQUIRE_MFA: 'true',
      BETTER_AUTH_URL: 'https://api.example.test',
      APP_URL: 'https://app.example.test',
      CORS_ORIGINS: 'https://app.example.test',
      EMAIL_PROVIDER: 'none',
    });
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
  ])(
    'answers 404 for %s without an email provider (documented as conditional)',
    async (path) => {
      await request(app.getHttpServer())
        .post(path)
        .set('Origin', 'https://app.example.test')
        .send({})
        .expect(404);
    },
  );

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
    const res = await request(app.getHttpServer())
      .post('/v1/auth/sign-up/email')
      .set('Origin', 'https://app.example.test')
      .send({ email: uniqueEmail(), password: PASSWORD, name: 'Prod Check' })
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
