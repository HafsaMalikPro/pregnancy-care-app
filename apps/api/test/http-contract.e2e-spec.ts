import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { ApiError, HealthResponse } from '@preconception/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './helpers.js';

const ALLOWED_ORIGIN = 'http://allowed.test';
/** Every Nest route the app registers (from the boot log). Update when adding endpoints. */
const REGISTERED_ROUTES = [
  'GET /v1/health/live',
  'GET /v1/health',
  'POST /v1/anonymous-sessions',
  'DELETE /v1/anonymous-sessions/current',
  'POST /v1/anonymous-sessions/link',
  'GET /v1/me',
  'GET /v1/me/consents',
  'POST /v1/me/consents',
  'GET /v1/me/entitlement',
  'GET /v1/me/profile',
  'PUT /v1/me/profile',
  'POST /v1/pregnancies',
  'GET /v1/pregnancies',
  'GET /v1/pregnancies/current',
  'PATCH /v1/pregnancies/current',
  'PUT /v1/pregnancies/current/dating',
  'GET /v1/pregnancies/current/dating-history',
  'GET /v1/pregnancies/current/timeline',
  'GET /v1/pregnancies/current/week',
  'POST /v1/pregnancies/current/end',
  'GET /v1/week-guides/{week}',
  'POST /v1/admin/week-guides',
  'GET /v1/cycles',
  'GET /v1/cycles/estimate',
  'GET /v1/cycles/{id}',
  'POST /v1/cycles',
  'PATCH /v1/cycles/{id}',
  'DELETE /v1/cycles/{id}',
  'GET /v1/daily-logs',
  'GET /v1/daily-logs/{date}',
  'PUT /v1/daily-logs/{date}',
  'DELETE /v1/daily-logs/{date}',
  'GET /v1/articles',
  'GET /v1/articles/{slug}',
  'GET /v1/readiness/tasks',
  'PUT /v1/readiness/tasks/{taskId}/progress',
  'GET /v1/reminders',
  'GET /v1/reminders/delivery-options',
  'POST /v1/reminders',
  'PATCH /v1/reminders/{id}',
  'DELETE /v1/reminders/{id}',
  'POST /v1/me/export',
  'POST /v1/me/deletion',
  'GET /v1/me/privacy-jobs',
  'GET /v1/admin/articles',
  'GET /v1/admin/articles/{id}',
  'POST /v1/admin/articles',
  'PATCH /v1/admin/articles/{id}',
  'POST /v1/admin/articles/{id}/submit',
  'POST /v1/admin/articles/{id}/reviews',
  'POST /v1/admin/articles/{id}/publish',
  'POST /v1/admin/articles/{id}/archive',
  'GET /v1/admin/readiness-tasks',
  'POST /v1/admin/readiness-tasks',
  'PATCH /v1/admin/readiness-tasks/{id}',
  'POST /v1/admin/readiness-tasks/{id}/publish',
  'POST /v1/admin/readiness-tasks/{id}/archive',
  'GET /v1/admin/users',
  'PATCH /v1/admin/users/{id}/staff-role',
  'GET /v1/admin/audit-events',
  'GET /v1/admin/reminder-deliveries/stats',
  // Pregnancy platform: content catalog, planning, appointments, daily plan
  'DELETE /v1/activity-logs/{date}/{activitySlug}',
  'DELETE /v1/appointments/{id}',
  'DELETE /v1/meal-logs/{date}/{slot}/{recipeSlug}',
  'DELETE /v1/saved/{kind}/{slug}',
  'DELETE /v1/shopping-list',
  'DELETE /v1/shopping-list/{id}',
  'GET /v1/activities',
  'GET /v1/activities/{slug}',
  'GET /v1/activity-logs',
  'GET /v1/admin/content/coverage',
  'GET /v1/appointments',
  'GET /v1/appointments/{id}',
  'GET /v1/daily-plan',
  'GET /v1/me/exercise-plan',
  'GET /v1/me/meal-plan',
  'GET /v1/meal-logs',
  'GET /v1/meal-plans',
  'GET /v1/meal-plans/{slug}',
  'GET /v1/pregnancies/current/birth-preferences',
  'GET /v1/pregnancies/current/weeks/{week}',
  'GET /v1/recipes',
  'GET /v1/recipes/{slug}',
  'GET /v1/saved',
  'GET /v1/shopping-list',
  'GET /v1/week-guides',
  'PATCH /v1/appointments/{id}',
  'PATCH /v1/shopping-list/{id}',
  'POST /v1/admin/activities',
  'POST /v1/admin/meal-plans',
  'POST /v1/admin/recipes',
  'POST /v1/appointments',
  'POST /v1/shopping-list',
  'POST /v1/shopping-list/from-meal-plan',
  'PUT /v1/activity-logs/{date}/{activitySlug}',
  'PUT /v1/daily-plan/{date}/tasks/{key}',
  'PUT /v1/meal-logs/{date}/{slot}/{recipeSlug}',
  'PUT /v1/pregnancies/current/birth-preferences',
  'PUT /v1/saved/{kind}/{slug}',
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Every error response must match the shared contract and its header. */
function expectApiError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(ApiError.safeParse(res.body).success).toBe(true);
  expect(res.body.error.code).toBe(code);
  expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  expect(res.body.error.requestId).not.toBe('unknown');
}

describe('HTTP contract (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp({ CORS_ORIGINS: ALLOWED_ORIGIN });
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/health/live', () => {
    it('returns 200 { status: ok } with a request id', async () => {
      const res = await http.get('/v1/health/live').expect(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['x-request-id']).toMatch(UUID);
    });

    it('supports HEAD with no body', async () => {
      const res = await http.head('/v1/health/live').expect(200);
      expect(res.text).toBeUndefined();
    });

    it('ignores query strings', async () => {
      await http.get("/v1/health/live?x=' OR 1=1--").expect(200);
    });
  });

  describe('GET /v1/health', () => {
    it('returns the HealthResponse contract with database up', async () => {
      const res = await http.get('/v1/health').expect(200);
      expect(HealthResponse.parse(res.body)).toEqual({
        status: 'ok',
        database: 'up',
      });
    });

    it('stays correct under concurrent requests', async () => {
      const results = await Promise.all(
        Array.from({ length: 50 }, () => http.get('/v1/health')),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      const ids = new Set(results.map((r) => r.headers['x-request-id']));
      expect(ids.size).toBe(50);
    });
  });

  describe('unsupported methods and routes', () => {
    it.each(['post', 'put', 'patch', 'delete'] as const)(
      '%s /v1/health returns 404 NOT_FOUND',
      async (method) => {
        const res = await http[method]('/v1/health');
        expectApiError(res, 404, 'NOT_FOUND');
      },
    );

    it.each([
      '/v1/does-not-exist',
      '/v2/health',
      '/v1/health/live/extra',
      '/v1/../../etc/passwd',
      '/v1/%00',
      "/v1/users/1' OR '1'='1",
    ])('GET %s returns a clean 404', async (path) => {
      const res = await http.get(path);
      expectApiError(res, 404, 'NOT_FOUND');
      expect(JSON.stringify(res.body)).not.toMatch(/at .+\.(js|ts):\d+/);
    });
  });

  describe('request ids', () => {
    it('echoes a well-formed upstream id', async () => {
      const res = await http
        .get('/v1/health/live')
        .set('x-request-id', 'upstream-trace-1234')
        .expect(200);
      expect(res.headers['x-request-id']).toBe('upstream-trace-1234');
    });

    it('replaces an unsafe upstream id', async () => {
      const res = await http
        .get('/v1/does-not-exist')
        .set('x-request-id', '<img src=x onerror=alert(1)>');
      expect(res.headers['x-request-id']).toMatch(UUID);
      expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    });
  });

  describe('malformed and oversized bodies', () => {
    it('rejects malformed JSON with 400 and does not echo the body', async () => {
      const res = await http
        .post('/v1/health')
        .set('content-type', 'application/json')
        .send('{"note": "private-text", bad');
      expectApiError(res, 400, 'VALIDATION_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('private-text');
    });

    it('rejects a body over the 100 kB limit with 413', async () => {
      const res = await http
        .post('/v1/health')
        .set('content-type', 'application/json')
        .send(JSON.stringify({ a: 'x'.repeat(200_000) }));
      expectApiError(res, 413, 'PAYLOAD_TOO_LARGE');
    });

    it('rejects an unsupported charset with a 4xx, not a 500', async () => {
      const res = await http
        .post('/v1/health')
        .set('content-type', 'application/json; charset=klingon')
        .send('{}');
      expectApiError(res, 415, 'VALIDATION_ERROR');
    });

    it('rejects an unsupported content encoding with a 4xx', async () => {
      const res = await http
        .post('/v1/health')
        .set('content-type', 'application/json')
        .set('content-encoding', 'compress')
        .send('{}');
      expectApiError(res, 415, 'VALIDATION_ERROR');
    });
  });

  describe('security headers and CORS', () => {
    it('does not advertise the framework', async () => {
      const res = await http.get('/v1/health/live');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('allows a configured origin with credentials', async () => {
      const res = await http
        .options('/v1/health')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'GET')
        .expect(204);
      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('does not grant an unknown origin', async () => {
      const res = await http
        .get('/v1/health/live')
        .set('Origin', 'http://evil.test');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('OpenAPI document', () => {
    it('is served at /docs/openapi.json and /docs-yaml outside production', async () => {
      const json = await http.get('/docs/openapi.json').expect(200);
      expect(json.body.openapi).toMatch(/^3\./);
      const yaml = await http.get('/docs-yaml').expect(200);
      expect(yaml.text).toContain('openapi: 3.');
      await http.get('/docs').expect(200);
    });

    it('documents every registered Nest route', async () => {
      const { body } = await http.get('/docs/openapi.json');
      const documented = Object.entries(body.paths as Record<string, object>)
        .flatMap(([path, ops]) =>
          Object.keys(ops).map((m) => `${m.toUpperCase()} ${path}`),
        )
        .filter((r) => !r.includes('/v1/auth/'))
        .sort();
      expect(documented).toEqual([...REGISTERED_ROUTES].sort());
    });

    it('defines response schemas and the shared error schema', async () => {
      const { body } = await http.get('/docs/openapi.json');
      const schemas = body.components.schemas;
      expect(Object.keys(schemas)).toEqual(
        expect.arrayContaining(['ApiErrorDto', 'LivenessDto', 'ReadinessDto']),
      );
      expect(Object.keys(body.components.securitySchemes).sort()).toEqual([
        'anonymous',
        'session-bearer',
        'session-cookie',
      ]);
      expect(schemas.ApiErrorBodyDto.properties.code.enum).toEqual(
        ApiError.shape.error.shape.code.options,
      );
      const ready = body.paths['/v1/health'].get.responses;
      expect(Object.keys(ready).sort()).toEqual(['200', '503']);
    });

    it('matches the committed docs/api/openapi.json (run `pnpm openapi:export`)', async () => {
      const { body } = await http.get('/docs/openapi.json');
      const committed = JSON.parse(
        readFileSync(
          new URL('../../../docs/api/openapi.json', import.meta.url),
          'utf8',
        ),
      );
      expect(body).toEqual(committed);
    });

    it('contains no secrets or connection strings', async () => {
      const { text } = await http.get('/docs/openapi.json');
      expect(text).not.toMatch(/postgres(ql)?:\/\//);
      expect(text).not.toContain(process.env.BETTER_AUTH_SECRET);
    });
  });
});
