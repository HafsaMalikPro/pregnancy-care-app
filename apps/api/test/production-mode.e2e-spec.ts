import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './helpers.js';

describe('Production mode (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Production refuses unsafe settings at boot (see config/env.ts), so use real-looking ones.
    app = await createTestApp({
      NODE_ENV: 'production',
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

  it('still serves health probes', async () => {
    await request(app.getHttpServer()).get('/v1/health/live').expect(200);
  });
});
