import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, uniqueEmail } from '../helpers.js';

/**
 * Client-IP resolution behind one trusted proxy (docs/SECURITY_CHECKLIST.md, section E). Better Auth
 * would trust X-Forwarded-For as sent; the API resolves the IP itself from TRUST_PROXY.
 * Separate file: the app's config is read once per test file.
 */
const signIn = (http: ReturnType<typeof request>, xff?: string) => {
  const req = http
    .post('/v1/auth/sign-in/email')
    .send({ email: uniqueEmail('rl'), password: 'not-the-password-123' });
  return xff ? req.set('X-Forwarded-For', xff) : req;
};

describe('Security: trusted proxy hops (e2e)', () => {
  describe('TRUST_PROXY=1 (one load balancer)', () => {
    let app: INestApplication<App>;
    beforeAll(async () => {
      app = await createTestApp({
        RATE_LIMIT_ENABLED: 'true',
        TRUST_PROXY: '1',
      });
    });
    afterAll(async () => {
      await app.close();
    });

    it('uses the address the trusted hop appended, not one the client prepended', async () => {
      const http = request(app.getHttpServer());
      // The client controls everything left of the last entry; only the last one (added by the
      // trusted proxy) counts. Spoofed prefixes don't create new identities.
      for (let i = 0; i < 5; i++) {
        await signIn(http, `10.9.9.${i}, 192.0.2.10`).expect(401);
      }
      await signIn(http, '10.9.9.99, 192.0.2.10').expect(429);
      // A genuinely different client (different last hop) has its own budget.
      await signIn(http, '192.0.2.11').expect(401);
    });
  });
});
