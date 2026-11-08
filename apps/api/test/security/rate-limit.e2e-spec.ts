import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, ModulesContainer } from '@nestjs/core';
import {
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  signUp,
  staffUser,
  uniqueEmail,
} from '../helpers.js';

const METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'ALL',
  'OPTIONS',
  'HEAD',
];

/** Writes that intentionally keep only the global limit, with the reason. */
const GLOBAL_LIMIT_ONLY: Record<string, string> = {
  'DELETE /v1/anonymous-sessions/current':
    'ends the caller’s own guest session',
};

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

  describe('resource protection', () => {
    let app: INestApplication<App>;
    beforeAll(async () => {
      app = await createTestApp({ RATE_LIMIT_ENABLED: 'true' });
    });
    afterAll(async () => {
      await app.close();
    });

    it('every write route declares its own rate limit', () => {
      const scanner = new MetadataScanner();
      const missing: string[] = [];
      for (const module of app.get(ModulesContainer).values()) {
        for (const { metatype, instance } of module.controllers.values()) {
          if (!metatype || !instance) continue;
          const base = String(
            Reflect.getMetadata(PATH_METADATA, metatype) ?? '',
          );
          const proto = Object.getPrototypeOf(instance);
          for (const name of scanner.getAllMethodNames(proto)) {
            const handler = proto[name];
            const path = Reflect.getMetadata(PATH_METADATA, handler);
            if (path === undefined) continue;
            const method =
              METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as number];
            if (method === 'GET') continue;
            const route = `${method} /v1/${[base, path]
              .map((p) => String(p).replace(/^\/|\/$/g, ''))
              .filter(Boolean)
              .join('/')}`;
            const limited =
              Reflect.getMetadata('THROTTLER:LIMITdefault', handler) !==
                undefined ||
              Reflect.getMetadata('THROTTLER:LIMITdefault', metatype) !==
                undefined;
            if (!limited && !(route in GLOBAL_LIMIT_ONLY)) missing.push(route);
          }
        }
      }
      expect(missing).toEqual([]);
    });

    it('limits everyday owner writes to 60 a minute per client', async () => {
      const { RATE_LIMITS } = await import('../../src/common/throttle.js');
      expect(RATE_LIMITS.ownerWrite).toEqual({ limit: 60, ttl: 60_000 });
      const http = request(app.getHttpServer());
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      for (let i = 0; i < 60; i++) {
        await http
          .put(`/v1/daily-logs/${daysAgo(1 + (i % 30))}`)
          .set(user)
          .send({ symptoms: [] })
          .expect(200);
      }
      const res = await http
        .put(`/v1/daily-logs/${daysAgo(1)}`)
        .set(user)
        .send({ symptoms: [] })
        .expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      // Reads keep their own budget.
      await http
        .get(`/v1/daily-logs/${daysAgo(1)}`)
        .set(user)
        .expect(200);
    });

    it('caps page size on every list endpoint at 100', async () => {
      const http = request(app.getHttpServer());
      const prisma = await getPrisma(app);
      const admin = await staffUser(app, prisma, 'administrator');
      const { body } = await http.get('/docs/openapi.json').expect(200);
      const lists = Object.entries(
        body.paths as Record<
          string,
          { get?: { parameters?: { name: string; in: string }[] } }
        >,
      )
        .filter(([, ops]) =>
          ops.get?.parameters?.some(
            (p) => p.name === 'limit' && p.in === 'query',
          ),
        )
        .map(([path]) => path);
      expect(lists.length).toBeGreaterThan(5);
      for (const path of lists) {
        await http.get(path).query({ limit: 101 }).set(admin).expect(400);
        await http
          .get(path)
          .query({ limit: 100 })
          .set(admin)
          .expect((r) => {
            if (r.status !== 200 && r.status !== 400)
              throw new Error(`${path} → ${r.status}`);
          });
      }
    });

    it('drops slow clients: request and header timeouts are set', () => {
      const server = app.getHttpServer() as unknown as {
        requestTimeout: number;
        headersTimeout: number;
      };
      expect(server.requestTimeout).toBe(15_000);
      expect(server.headersTimeout).toBe(10_000);
    });
  });
});
