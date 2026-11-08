import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from '../helpers.js';

/** CORS (docs/SECURITY_CHECKLIST.md, D3): exact allow-list, credentials, no wildcard. */
const ALLOWED = 'https://app.example.test';

describe('Security: CORS (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp({ CORS_ORIGINS: ALLOWED });
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('CORS', () => {
    const preflight = (origin: string) =>
      http
        .options('/v1/me/profile')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'PUT')
        .set('Access-Control-Request-Headers', 'content-type');

    it('allows the configured origin with credentials', async () => {
      const res = await preflight(ALLOWED);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it.each([
      ['an unknown origin', 'https://evil.example'],
      ['the null origin', 'null'],
      ['an unlisted subdomain', 'https://evil.app.example.test'],
      ['a lookalike suffix', 'https://app.example.test.evil.example'],
      ['the http variant', 'http://app.example.test'],
    ])('refuses %s', async (_, origin) => {
      for (const res of [
        await preflight(origin),
        await http.get('/v1/health/live').set('Origin', origin),
      ]) {
        // The control: no Allow-Origin, so the browser blocks the response. (The cors package
        // still sends Allow-Credentials, which has no effect without a matching origin.)
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      }
    });

    it('never answers with a wildcard', async () => {
      const res = await http.get('/v1/week-guides').set('Origin', ALLOWED);
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });
  });
});
