import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import {
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  signUp,
  staffUser,
} from '../helpers.js';

/**
 * Input validation and output safety (docs/SECURITY_CHECKLIST.md, section C).
 */
const ID = '00000000-0000-7000-8000-000000000000';

/** Field names that must never appear in an API response (except Better Auth's own session token). */
const FORBIDDEN_FIELDS = [
  'password',
  'passwordHash',
  'hash',
  'tokenHash',
  'credentialHash',
  'secret',
  'secretHash',
  'twoFactorSecret',
  'backupCodes',
  'totpSecret',
];

function forbiddenKeys(value: unknown, path = ''): string[] {
  if (Array.isArray(value))
    return value.flatMap((v, i) => forbiddenKeys(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(FORBIDDEN_FIELDS.includes(k) ? [`${path}.${k}`] : []),
    ...forbiddenKeys(v, `${path}.${k}`),
  ]);
}

describe('Security: input validation and output safety (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    prisma = await getPrisma(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('request bodies', () => {
    it('refuses non-JSON bodies with 415', async () => {
      const user = await signUp(app);
      for (const type of [
        'text/plain',
        'application/x-www-form-urlencoded',
        'multipart/form-data; boundary=x',
        'application/xml',
      ]) {
        const res = await http
          .post('/v1/me/consents')
          .set(user)
          .set('Content-Type', type)
          .send('purpose=health_data_processing&granted=true')
          .expect(415);
        expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
      }
      // JSON with a charset is fine; so are bodiless writes.
      await http
        .post('/v1/me/consents')
        .set(user)
        .set('Content-Type', 'application/json; charset=utf-8')
        .send(
          JSON.stringify({
            purpose: 'health_data_processing',
            granted: true,
            policyVersion: '2026-10-01',
            source: 'test',
          }),
        )
        .expect(201);
      await http.post('/v1/anonymous-sessions').expect(400);
    });

    it('answers malformed JSON with a generic 400 that does not echo the body', async () => {
      const user = await signUp(app);
      const res = await http
        .post('/v1/me/consents')
        .set(user)
        .set('Content-Type', 'application/json')
        .send('{"purpose": "health_data_processing", lmp=2026-01-01')
        .expect(400);
      expect(res.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        message: 'The request is invalid.',
      });
      expect(JSON.stringify(res.body)).not.toContain('lmp=2026');
    });

    it('refuses bodies over 100 kB with 413', async () => {
      const user = await signUp(app);
      const res = await http
        .put(`/v1/daily-logs/${daysAgo(1)}`)
        .set(user)
        .send({ symptoms: [], note: 'x'.repeat(110_000) })
        .expect(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('refuses unknown fields, so owner ids and roles cannot be mass-assigned', async () => {
      const user = await signUp(app);
      const other = await signUp(app);
      for (const extra of [
        { userId: other.id },
        { staffRole: 'administrator' },
        { id: ID },
        { anonymousSessionId: ID },
      ]) {
        await http
          .put('/v1/me/profile')
          .set(user)
          .send({ timeZone: 'UTC', locale: 'en', ...extra })
          .expect(400);
      }
      await http
        .patch(`/v1/admin/users/${user.id}/staff-role`)
        .set(user)
        .send({ staffRole: 'administrator' })
        .expect(403);
    });

    it('stores SQL-looking text literally and leaves the database intact', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      const attack = `'); DROP TABLE daily_logs; -- " OR 1=1; SELECT pg_sleep(5);`;
      const date = daysAgo(2);
      await http
        .put(`/v1/daily-logs/${date}`)
        .set(user)
        .send({ symptoms: [], note: attack, questions: attack })
        .expect(200);
      const back = await http
        .get(`/v1/daily-logs/${date}`)
        .set(user)
        .expect(200);
      expect(back.body).toMatchObject({ note: attack, questions: attack });
      const created = await http
        .post('/v1/appointments')
        .set(user)
        .send({
          kind: 'antenatal',
          title: attack,
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          location: attack,
          notes: attack,
        })
        .expect(201);
      expect(created.body).toMatchObject({
        title: attack,
        location: attack,
        notes: attack,
      });
      await http
        .get(`/v1/articles?category=${encodeURIComponent("x' OR '1'='1")}`)
        .expect(400);
      const [{ exists }] = await prisma.$queryRaw<
        { exists: boolean }[]
      >`SELECT to_regclass('public.daily_logs') IS NOT NULL AS exists`;
      expect(exists).toBe(true);
    });
  });

  describe('path parameters', () => {
    it('400s malformed ids and dates, 404s malformed slugs, before any lookup', async () => {
      const user = await signUp(app);
      for (const bad of ['not-a-uuid', "1' OR '1'='1", '0'.repeat(200)]) {
        await http
          .get(`/v1/appointments/${encodeURIComponent(bad)}`)
          .set(user)
          .expect(400);
        await http
          .delete(`/v1/reminders/${encodeURIComponent(bad)}`)
          .set(user)
          .expect(400);
      }
      for (const bad of [
        '2026-02-30',
        '2026-13-01',
        '20260101',
        "2026-01-01' --",
      ]) {
        await http
          .get(`/v1/daily-logs/${encodeURIComponent(bad)}`)
          .set(user)
          .expect(400);
      }
      for (const bad of [
        'UPPER-case',
        'has_underscore',
        'trailing-',
        'a'.repeat(121),
        '..%2f..%2fetc',
      ]) {
        await http.get(`/v1/articles/${bad}`).expect(404);
        await http.get(`/v1/recipes/${bad}`).expect(404);
      }
      await http.get('/v1/week-guides/abc').expect(400);
    });
  });

  describe('authored content', () => {
    it('refuses raw HTML and unsafe links in articles and structured content', async () => {
      const editor = await staffUser(app, prisma, 'content_editor');
      const draft = (slug: string, body: string) => ({
        slug,
        locale: 'en',
        title: 'Safe title',
        summary: 'Safe summary',
        body,
        references: [{ title: 'NICE', url: 'https://www.nice.org.uk/' }],
        premium: false,
      });
      let n = 0;
      for (const body of [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<iframe src="https://evil.test"></iframe>',
        '[click](javascript:alert(1))',
        '[click](JaVaScRiPt:alert(1))',
        '![x](data:image/png;base64,AAAA)',
        '[ref]: javascript:alert(1)',
        '&#106;avascript:alert(1)',
      ]) {
        const res = await http
          .post('/v1/admin/articles')
          .set(editor)
          .send(draft(`unsafe-${Date.now()}-${n++}`, body))
          .expect(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
      await http
        .post('/v1/admin/articles')
        .set(editor)
        .send(
          draft(
            `safe-${Date.now()}`,
            'See [NICE](https://www.nice.org.uk/) and [week 12](/weeks/12). Weeks < twelve.',
          ),
        )
        .expect(201);
      const title = await http
        .post('/v1/admin/articles')
        .set(editor)
        .send({
          ...draft(`unsafe-title-${Date.now()}`, 'fine'),
          title: 'Hello <b>there</b>',
        })
        .expect(400);
      expect(
        title.body.error.details?.[0]?.message ?? title.body.error.message,
      ).toMatch(/title/);

      const created = await http
        .post('/v1/admin/articles')
        .set(editor)
        .send(draft(`edit-${Date.now()}`, 'fine body'))
        .expect(201);
      await http
        .patch(`/v1/admin/articles/${created.body.id}`)
        .set(editor)
        .send({ body: '<style>*{display:none}</style>' })
        .expect(400);
    });
  });

  describe('responses', () => {
    it('never return credential material or hashes', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      const responses = await Promise.all([
        http.get('/v1/me').set(user),
        http.get('/v1/me/profile').set(user),
        http.get('/v1/me/consents').set(user),
        http.post('/v1/me/export').set(user),
      ]);
      for (const res of responses) {
        expect(res.status).toBeLessThan(300);
        expect(forbiddenKeys(res.body)).toEqual([]);
      }
      const guest = await http
        .post('/v1/anonymous-sessions')
        .send({ platform: 'web' })
        .expect(201);
      // The guest secret is returned once, by design; its hash never is.
      expect(Object.keys(guest.body).sort()).toEqual([
        'expiresAt',
        'id',
        'secret',
      ]);
    });

    it('no documented (non-auth) response schema has a credential field', async () => {
      const { body } = await http.get('/docs/openapi.json').expect(200);
      const schemas = body.components.schemas as Record<
        string,
        { properties?: Record<string, unknown> }
      >;
      const authSchemas = new Set([
        'User',
        'Session',
        'Account',
        'Verification',
        'TwoFactor',
      ]);
      const found = Object.entries(schemas)
        .filter(([name]) => !authSchemas.has(name))
        .flatMap(([name, s]) =>
          Object.keys(s.properties ?? {})
            .filter(
              (p) =>
                FORBIDDEN_FIELDS.includes(p) &&
                // The guest secret: returned once on creation, sent once to link (a request body).
                !(
                  [
                    'AnonymousSessionCreatedDto',
                    'LinkAnonymousSessionDto',
                  ].includes(name) && p === 'secret'
                ),
            )
            .map((p) => `${name}.${p}`),
        );
      expect(found).toEqual([]);
    });
  });
});
