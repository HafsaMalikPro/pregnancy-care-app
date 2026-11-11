import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  AUTH_REQUIREMENT,
  type AuthRequirement,
} from '../../src/auth/auth.decorators.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import { pregnantUser } from '../fixtures.js';
import {
  anonymous,
  createTestApp,
  getPrisma,
  grantHealthConsent,
  signUp,
  staffUser,
} from '../helpers.js';

/**
 * Authorization controls (docs/SECURITY_CHECKLIST.md, section B). The role matrix, IDOR and
 * separation-of-duties tests live in test/security.e2e-spec.ts; self role change in
 * test/content-admin.e2e-spec.ts; owner scoping in src/database/owner-scope.spec.ts.
 */

/**
 * Every route reachable without credentials, reviewed. Adding a @Public() or @OptionalAuth()
 * route fails this suite until it is added here (with its review).
 */
const REVIEWED_PUBLIC_ROUTES: Record<string, AuthRequirement['kind']> = {
  'GET /v1/health/live': 'public',
  'GET /v1/health': 'public',
  'POST /v1/anonymous-sessions': 'public',
  'GET /v1/articles': 'optional',
  'GET /v1/articles/:slug': 'optional',
  'GET /v1/recipes': 'public',
  'GET /v1/recipes/:slug': 'public',
  'GET /v1/activities': 'public',
  'GET /v1/activities/:slug': 'public',
  'GET /v1/meal-plans': 'public',
  'GET /v1/meal-plans/:slug': 'public',
  'GET /v1/week-guides': 'public',
  'GET /v1/week-guides/:week': 'public',
  'GET /v1/visit-schedules': 'public',
  'GET /v1/postpartum-guides/:week': 'public',
  'GET /v1/symptom-checks/options': 'public',
  'POST /v1/symptom-checks': 'optional',
};

const HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'ALL',
  'OPTIONS',
  'HEAD',
];

function routeTable(app: INestApplication) {
  const reflector = app.get(Reflector);
  const scanner = new MetadataScanner();
  const routes: { route: string; requirement: AuthRequirement }[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const { metatype, instance } of module.controllers.values()) {
      if (!metatype || !instance) continue;
      const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
      const proto = Object.getPrototypeOf(instance);
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = proto[name];
        const path = Reflect.getMetadata(PATH_METADATA, handler);
        if (path === undefined) continue;
        const method =
          HTTP_METHODS[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        const full = `/v1/${[base, path]
          .map((p) => String(p).replace(/^\/|\/$/g, ''))
          .filter(Boolean)
          .join('/')}`;
        const requirement = reflector.getAllAndOverride<AuthRequirement>(
          AUTH_REQUIREMENT,
          [handler, metatype],
        ) ?? { kind: 'owner' };
        routes.push({ route: `${method} ${full}`, requirement });
      }
    }
  }
  return routes;
}

describe('Security: authorization (e2e)', () => {
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

  describe('default deny', () => {
    it('every route without credentials is reviewed and gives a reason', () => {
      const routes = routeTable(app);
      expect(routes.length).toBeGreaterThan(100);
      const open = routes.filter(
        (r) =>
          r.requirement.kind === 'public' || r.requirement.kind === 'optional',
      );
      for (const r of open) {
        const reason = (r.requirement as { reason?: string }).reason ?? '';
        expect(
          reason.trim().length,
          `${r.route} needs a reason`,
        ).toBeGreaterThan(10);
      }
      expect(
        Object.fromEntries(open.map((r) => [r.route, r.requirement.kind])),
      ).toEqual(REVIEWED_PUBLIC_ROUTES);
    });

    it('every other route answers 401 without credentials', async () => {
      const failures: string[] = [];
      for (const { route, requirement } of routeTable(app)) {
        if (route in REVIEWED_PUBLIC_ROUTES) continue;
        expect(requirement.kind).not.toBe('public');
        const [method, path] = route.split(' ');
        const res = await (
          http as unknown as Record<string, (p: string) => request.Test>
        )
          [method.toLowerCase()](
            path.replace(/:\w+/g, '00000000-0000-7000-8000-000000000000'),
          )
          .send({});
        if (res.status !== 401) failures.push(`${route} → ${res.status}`);
      }
      expect(failures).toEqual([]);
    });
  });

  describe('IDOR on trackers (another user and a guest)', () => {
    it('kick sessions and contractions of one owner are invisible to others', async () => {
      const owner = await pregnantUser(app, 30);
      const kick = await http
        .post('/v1/kick-counts/sessions')
        .set(owner)
        .expect(201);
      const contraction = await http
        .post('/v1/contractions')
        .set(owner)
        .expect(201);

      const other = await pregnantUser(app, 30);
      const guest = await anonymous(app);
      await grantHealthConsent(app, guest);
      for (const intruder of [other, guest]) {
        for (const [method, path] of [
          ['post', `/v1/kick-counts/sessions/${kick.body.id}/kicks`],
          ['post', `/v1/kick-counts/sessions/${kick.body.id}/stop`],
          ['delete', `/v1/kick-counts/sessions/${kick.body.id}`],
          ['post', `/v1/contractions/${contraction.body.id}/stop`],
          ['delete', `/v1/contractions/${contraction.body.id}`],
        ] as const) {
          const res = await http[method](path).set(intruder).send({});
          // Guests have no pregnancy, so the kick counter refuses them earlier; either way the
          // record is neither revealed nor changed.
          expect([403, 404], `${method} ${path}`).toContain(res.status);
        }
      }
      // Unchanged for the owner.
      await http
        .post(`/v1/kick-counts/sessions/${kick.body.id}/kicks`)
        .set(owner)
        .expect(200);
      await http
        .post(`/v1/contractions/${contraction.body.id}/stop`)
        .set(owner)
        .expect(200);
    });
  });

  describe('account status', () => {
    it.each(['pending_deletion', 'deleted'] as const)(
      'a %s account is refused everywhere, including staff routes',
      async (status) => {
        const admin = await staffUser(app, prisma, 'administrator');
        await http.get('/v1/admin/users').set(admin).expect(200);
        await prisma.user.update({ where: { id: admin.id }, data: { status } });
        await http.get('/v1/me').set(admin).expect(401);
        await http.get('/v1/admin/users').set(admin).expect(401);
      },
    );
  });

  describe('audit log is append-only in the database', () => {
    async function auditRow(actorUserId: string) {
      return prisma.auditEvent.create({
        data: {
          actorUserId,
          actorRole: 'administrator',
          action: 'test.append_only',
          targetType: 'user',
          targetId: actorUserId,
          metadata: { note: 'original' },
        },
      });
    }
    const pgMessage = (e: unknown) => String((e as Error).message ?? e);

    it('refuses UPDATE, DELETE and TRUNCATE for the application role', async () => {
      const user = await signUp(app);
      const row = await auditRow(user.id);
      await expect(
        prisma.auditEvent.update({
          where: { id: row.id },
          data: { action: 'tampered' },
        }),
      ).rejects.toSatisfy((e) => /append-only/.test(pgMessage(e)));
      await expect(
        prisma.auditEvent.delete({ where: { id: row.id } }),
      ).rejects.toSatisfy((e) => /append-only/.test(pgMessage(e)));
      await expect(
        prisma.$executeRaw`DELETE FROM audit_events`,
      ).rejects.toSatisfy((e) => /append-only/.test(pgMessage(e)));
      await expect(prisma.$executeRaw`TRUNCATE audit_events`).rejects.toSatisfy(
        (e) => /append-only/.test(pgMessage(e)),
      );
      const still = await prisma.auditEvent.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(still).toMatchObject({
        action: 'test.append_only',
        metadata: { note: 'original' },
      });
    });

    it('allows only anonymisation, and only when the transaction opts in', async () => {
      const user = await signUp(app);
      const row = await auditRow(user.id);
      // Without the opt-in, even clearing the actor is refused.
      await expect(
        prisma.auditEvent.update({
          where: { id: row.id },
          data: { actorUserId: null },
        }),
      ).rejects.toSatisfy((e) => /append-only/.test(pgMessage(e)));
      // With it, any other change is still refused.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.audit_anonymise', 'on', true)`;
          await tx.auditEvent.update({
            where: { id: row.id },
            data: { actorUserId: null, metadata: { note: 'rewritten' } },
          });
        }),
      ).rejects.toSatisfy((e) => /append-only/.test(pgMessage(e)));
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.audit_anonymise', 'on', true)`;
        await tx.auditEvent.update({
          where: { id: row.id },
          data: { actorUserId: null, targetId: null },
        });
      });
      const after = await prisma.auditEvent.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(after).toMatchObject({
        actorUserId: null,
        targetId: null,
        action: 'test.append_only',
        metadata: { note: 'original' },
      });
      // The opt-in was transaction-local: it does not leak to later statements.
      await expect(
        prisma.auditEvent.update({
          where: { id: row.id },
          data: { action: 'x' },
        }),
      ).rejects.toSatisfy((e) => /append-only/.test(pgMessage(e)));
    });
  });
});
