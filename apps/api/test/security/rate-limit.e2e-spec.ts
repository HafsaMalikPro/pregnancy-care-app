import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, uniqueEmail } from '../helpers.js';

/**
 * Client-IP resolution for rate limits (docs/SECURITY_CHECKLIST.md, section E). Better Auth
 * would trust X-Forwarded-For as sent; the API resolves the IP itself from TRUST_PROXY.
 */
const signIn = (http: ReturnType<typeof request>, xff?: string) => {
  const req = http
    .post('/v1/auth/sign-in/email')
    .send({ email: uniqueEmail('rl'), password: 'not-the-password-123' });
  return xff ? req.set('X-Forwarded-For', xff) : req;
};

describe('Security: rate limits and client IP (e2e)', () => {
  describe('TRUST_PROXY=false (default)', () => {
    let app: INestApplication<App>;
    beforeAll(async () => {
      app = await createTestApp({
        RATE_LIMIT_ENABLED: 'true',
        TRUST_PROXY: 'false',
      });
    });
    afterAll(async () => {
      await app.close();
    });

    it('a different X-Forwarded-For on every request does not reset the sign-in limit', async () => {
      const http = request(app.getHttpServer());
      // Better Auth allows 5 sign-ins per minute per IP.
      for (let i = 0; i < 5; i++)
        await signIn(http, `203.0.113.${i + 1}`).expect(401);
      await signIn(http, '198.51.100.77').expect(429);
      await signIn(http).expect(429);
    });
  });
});
