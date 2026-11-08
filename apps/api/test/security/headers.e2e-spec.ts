import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  API_CSP,
  PERMISSIONS_POLICY,
} from '../../src/common/middleware/security-headers.js';
import { createTestApp, signUp } from '../helpers.js';

/**
 * Transport headers and caching (docs/SECURITY_CHECKLIST.md, section D). CORS: cors.e2e-spec.ts.
 * Production-only behaviour (docs off, Secure cookies) is in test/production-mode.e2e-spec.ts.
 */
const ALLOWED = 'https://app.example.test';

const directives = (csp: string) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .sort();

describe('Security: headers and caching (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp({ CORS_ORIGINS: ALLOWED });
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('security headers', () => {
    it.each([
      '/v1/health/live',
      '/v1/week-guides',
      '/v1/does-not-exist',
      '/v1/auth/ok',
    ])('are set on %s', async (path) => {
      const res = await http.get(path);
      expect(res.headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains',
      );
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(res.headers['permissions-policy']).toBe(PERMISSIONS_POLICY);
      expect(directives(res.headers['content-security-policy'])).toEqual(
        directives(API_CSP),
      );
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('the API CSP allows nothing to load and nothing to frame it', () => {
      expect(API_CSP).toContain("default-src 'none'");
      expect(API_CSP).toContain("frame-ancestors 'none'");
      expect(API_CSP).not.toMatch(/unsafe-(inline|eval)/);
    });

    it('only the development Swagger UI gets a looser CSP, still without framing', async () => {
      const res = await http.get('/docs/');
      expect(res.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'",
      );
      expect(res.headers['content-security-policy']).not.toContain(
        'unsafe-eval',
      );
    });
  });

  describe('caching', () => {
    it('owner data, writes and auth responses are no-store, with no ETag', async () => {
      const user = await signUp(app);
      const checks: [string, request.Response][] = [
        ['GET /v1/me', await http.get('/v1/me').set(user)],
        ['GET /v1/me/profile', await http.get('/v1/me/profile').set(user)],
        [
          'GET /v1/week-guides (signed in)',
          await http.get('/v1/week-guides').set(user),
        ],
        [
          'POST /v1/anonymous-sessions',
          await http.post('/v1/anonymous-sessions').send({ platform: 'web' }),
        ],
        [
          'POST /v1/symptom-checks',
          await http.post('/v1/symptom-checks').send({ symptoms: ['fever'] }),
        ],
        [
          'GET /v1/auth/get-session',
          await http.get('/v1/auth/get-session').set(user),
        ],
      ];
      for (const [label, res] of checks) {
        expect(res.headers['cache-control'], label).toContain('no-store');
        expect(res.headers.etag, label).toBeUndefined();
      }
    });

    it('public content without credentials varies on credentials and origin', async () => {
      const res = await http.get('/v1/week-guides').expect(200);
      expect(res.headers.vary).toMatch(/Authorization/);
      expect(res.headers.vary).toMatch(/Cookie/);
      expect(res.headers.etag).toBeUndefined();
    });
  });
});
