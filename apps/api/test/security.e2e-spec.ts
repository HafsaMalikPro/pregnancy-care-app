import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Public } from '../src/auth/auth.decorators.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  approval,
  articleDraft,
  pregnantUser,
  refs,
  staffTeam,
  type Team,
  uid,
} from './fixtures.js';
import {
  anonymous,
  type Auth,
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  signUp,
  staffUser,
} from './helpers.js';

/** Throws an error carrying sensitive-looking text, to check that 500s never echo it. */
@Public('test-only probe controller')
@Controller('leak-probe')
class LeakProbeController {
  @Get()
  fail(): never {
    throw new Error('postgresql://admin:hunter2@db/prod lmp=2026-01-01');
  }
}

type Role =
  'user' | 'anon' | 'editor' | 'reviewer' | 'admin' | 'support' | 'noMfa';
const EVERY_ROLE: Role[] = [
  'user',
  'anon',
  'editor',
  'reviewer',
  'admin',
  'support',
  'noMfa',
];

/**
 * Every staff route and the roles allowed to call it (administrator passes every staff check;
 * staff without two-factor auth pass none). Requests carry empty bodies and random ids, so an
 * allowed role gets past the guard to a 400/404 and nothing is changed.
 */
const id = '00000000-0000-7000-8000-000000000000';
const STAFF_ROUTES: [
  method: 'get' | 'post' | 'patch',
  path: string,
  allowed: Role[],
][] = [
  ['get', '/v1/admin/articles', ['editor', 'reviewer', 'admin']],
  ['get', `/v1/admin/articles/${id}`, ['editor', 'reviewer', 'admin']],
  ['post', '/v1/admin/articles', ['editor', 'admin']],
  ['patch', `/v1/admin/articles/${id}`, ['editor', 'admin']],
  ['post', `/v1/admin/articles/${id}/submit`, ['editor', 'admin']],
  ['post', `/v1/admin/articles/${id}/reviews`, ['reviewer', 'admin']],
  ['post', `/v1/admin/articles/${id}/publish`, ['editor', 'admin']],
  ['post', `/v1/admin/articles/${id}/archive`, ['editor', 'admin']],
  ['post', '/v1/admin/recipes', ['editor', 'admin']],
  ['post', '/v1/admin/activities', ['editor', 'admin']],
  ['post', '/v1/admin/meal-plans', ['editor', 'admin']],
  ['post', '/v1/admin/week-guides', ['editor', 'admin']],
  ['get', '/v1/admin/content/coverage', ['editor', 'reviewer', 'admin']],
  ['get', '/v1/admin/readiness-tasks', ['editor', 'reviewer', 'admin']],
  ['post', '/v1/admin/readiness-tasks', ['editor', 'admin']],
  ['patch', `/v1/admin/readiness-tasks/${id}`, ['editor', 'admin']],
  ['post', `/v1/admin/readiness-tasks/${id}/publish`, ['reviewer', 'admin']],
  ['post', `/v1/admin/readiness-tasks/${id}/archive`, ['editor', 'admin']],
  ['get', '/v1/admin/users', ['support', 'admin']],
  ['patch', `/v1/admin/users/${id}/staff-role`, ['admin']],
  ['get', '/v1/admin/audit-events', ['admin']],
  ['get', '/v1/admin/reminder-deliveries/stats', ['support', 'admin']],
];

describe('Security and authorization (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let team: Team;
  let as: Record<Role, Auth>;

  beforeAll(async () => {
    app = await createTestApp({}, [LeakProbeController]);
    prisma = await getPrisma(app);
    http = request(app.getHttpServer());
    team = await staffTeam(app, prisma);
    as = {
      ...team,
      user: await signUp(app),
      anon: await anonymous(app),
      noMfa: await staffUser(app, prisma, 'administrator', false),
    };
  });

  afterAll(async () => {
    await app.close();
  });

  describe('role-based access to every staff route', () => {
    it.each(STAFF_ROUTES)('%s %s', async (method, path, allowed) => {
      for (const role of EVERY_ROLE) {
        const res = await http[method](path).set(as[role]).send({});
        if (allowed.includes(role)) {
          expect([200, 400, 404], `${role} should pass the guard`).toContain(
            res.status,
          );
        } else {
          expect(res.status, `${role} must be refused`).toBe(403);
          expect(res.body.error.code).toBe('FORBIDDEN');
        }
      }
      await http[method](path).send({}).expect(401);
    });
  });

  describe('authentication', () => {
    it('rejects malformed, tampered and unknown credentials with 401', async () => {
      const user = await signUp(app);
      const token = user.authorization.slice('Bearer '.length);
      const tampered = `${token.slice(0, -2)}${token.endsWith('aa') ? 'bb' : 'aa'}`;
      for (const authorization of [
        `Bearer ${tampered}`,
        'Bearer ',
        'Bearer not-a-token',
        'Anonymous short',
        `Anonymous ${'A'.repeat(43)}`,
        `Anonymous ${'A'.repeat(43)} extra`,
        'Basic dXNlcjpwYXNz',
      ]) {
        const res = await http.get('/v1/me').set({ authorization }).expect(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      }
      await http.get('/v1/me').set(user).expect(200);
    });

    it('rejects an expired session', async () => {
      const user = await signUp(app);
      await http.get('/v1/me').set(user).expect(200);
      await prisma.authSession.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http.get('/v1/me').set(user).expect(401);
    });

    it('signs out: the token stops working', async () => {
      const user = await signUp(app);
      await http.post('/v1/auth/sign-out').set(user).send({}).expect(200);
      await http.get('/v1/me').set(user).expect(401);
    });

    it('revokes a staff session as soon as the role changes', async () => {
      const editor = await staffUser(app, prisma, 'content_editor');
      await http.get('/v1/admin/articles').set(editor).expect(200);
      await http
        .patch(`/v1/admin/users/${editor.id}/staff-role`)
        .set(team.admin)
        .send({ staffRole: null })
        .expect(200);
      await http.get('/v1/admin/articles').set(editor).expect(401);
    });

    it('guests cannot use account-only routes', async () => {
      const guest = await anonymous(app);
      await http
        .post('/v1/me/deletion')
        .set(guest)
        .send({ confirm: 'DELETE MY ACCOUNT' })
        .expect(403);
      await http.get('/v1/me/privacy-jobs').set(guest).expect(403);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(guest)
        .send({ secret: (guest as Auth & { secret: string }).secret })
        .expect(403);
    });
  });

  describe('cross-user access (IDOR)', () => {
    it('another user or guest cannot read, change or delete records by id', async () => {
      const owner = await pregnantUser(app, 20);
      const appointment = (
        await http
          .post('/v1/appointments')
          .set(owner)
          .send({
            kind: 'scan',
            title: 'Mine',
            startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          })
          .expect(201)
      ).body.id;
      const item = (
        await http
          .post('/v1/shopping-list')
          .set(owner)
          .send({ name: 'iron' })
          .expect(201)
      ).body.id;
      const reminder = (
        await http
          .post('/v1/reminders')
          .set(owner)
          .send({
            kind: 'daily_log',
            localTime: '09:00',
            recurrence: 'FREQ=DAILY',
          })
          .expect(201)
      ).body.id;
      const cycle = (
        await http
          .post('/v1/cycles')
          .set(owner)
          .send({ periodStart: daysAgo(400), periodEnd: daysAgo(396) })
          .expect(201)
      ).body.id;
      await http
        .put(`/v1/daily-logs/${daysAgo(1)}`)
        .set(owner)
        .send({ symptoms: ['nausea'] })
        .expect(200);

      const intruders = [await signUp(app), await anonymous(app)];
      for (const other of intruders) {
        await grantHealthConsent(app, other);
        await http
          .get(`/v1/appointments/${appointment}`)
          .set(other)
          .expect(404);
        await http
          .patch(`/v1/appointments/${appointment}`)
          .set(other)
          .send({ title: 'x' })
          .expect(404);
        await http
          .delete(`/v1/appointments/${appointment}`)
          .set(other)
          .expect(404);
        await http
          .patch(`/v1/shopping-list/${item}`)
          .set(other)
          .send({ checked: true })
          .expect(404);
        await http.delete(`/v1/shopping-list/${item}`).set(other).expect(404);
        await http
          .patch(`/v1/reminders/${reminder}`)
          .set(other)
          .send({ enabled: false })
          .expect(404);
        await http.delete(`/v1/reminders/${reminder}`).set(other).expect(404);
        await http.get(`/v1/cycles/${cycle}`).set(other).expect(404);
        await http
          .patch(`/v1/cycles/${cycle}`)
          .set(other)
          .send({ periodEnd: daysAgo(395) })
          .expect(404);
        await http.delete(`/v1/cycles/${cycle}`).set(other).expect(404);
        await http
          .get(`/v1/daily-logs/${daysAgo(1)}`)
          .set(other)
          .expect(404);
        await http
          .delete(`/v1/daily-logs/${daysAgo(1)}`)
          .set(other)
          .expect(404);
        await http.get('/v1/pregnancies/current').set(other).expect(404);
        const list = await http.get('/v1/shopping-list').set(other).expect(200);
        expect(list.body).toEqual([]);
      }

      // The owner's records are untouched.
      expect(
        (
          await http
            .get(`/v1/appointments/${appointment}`)
            .set(owner)
            .expect(200)
        ).body.title,
      ).toBe('Mine');
      expect(
        (await http.get('/v1/shopping-list').set(owner)).body[0],
      ).toMatchObject({ id: item, checked: false });
      expect(
        await prisma.reminder.findUnique({ where: { id: reminder } }),
      ).toMatchObject({ enabled: true });
      await http.get(`/v1/cycles/${cycle}`).set(owner).expect(200);
      await http
        .get(`/v1/daily-logs/${daysAgo(1)}`)
        .set(owner)
        .expect(200);
    });

    it('ignores client-supplied owner ids and roles', async () => {
      const user = await signUp(app);
      const victim = await signUp(app);
      await grantHealthConsent(app, user);
      await http
        .put(`/v1/daily-logs/${daysAgo(0)}`)
        .set(user)
        .send({ symptoms: [], userId: victim.id })
        .expect(400);
      await http
        .post('/v1/auth/update-user')
        .set(user)
        .send({ staffRole: 'administrator' })
        .expect((r) => expect(r.status).toBeGreaterThanOrEqual(200));
      const me = await http.get('/v1/me').set(user).expect(200);
      expect(me.body.staffRole ?? null).toBeNull();
      await http.get('/v1/admin/users').set(user).expect(403);
    });
  });

  describe('separation of duties in clinical review (regression)', () => {
    it('an administrator who edited an article cannot approve it; another reviewer can', async () => {
      const draft = await articleDraft(app, team.editor);
      await http
        .patch(`/v1/admin/articles/${draft.id}`)
        .set(team.admin)
        .send({ summary: 'Edited by the administrator.' })
        .expect(200);
      await http
        .post(`/v1/admin/articles/${draft.id}/submit`)
        .set(team.editor)
        .expect(200);
      const res = await http
        .post(`/v1/admin/articles/${draft.id}/reviews`)
        .set(team.admin)
        .send(approval)
        .expect(403);
      expect(res.body.error.message).toMatch(/edited/);
      await http
        .post(`/v1/admin/articles/${draft.id}/reviews`)
        .set(team.reviewer)
        .send(approval)
        .expect(201);
    });

    it('an administrator who did not touch an article can review it', async () => {
      const draft = await articleDraft(app, team.editor);
      await http
        .post(`/v1/admin/articles/${draft.id}/submit`)
        .set(team.editor)
        .expect(200);
      await http
        .post(`/v1/admin/articles/${draft.id}/reviews`)
        .set(team.admin)
        .send({
          ...approval,
          decision: 'changes_requested',
          comments: 'Add sources.',
        })
        .expect(201);
    });

    it('whoever created or edited a readiness task cannot publish it', async () => {
      const created = await http
        .post('/v1/admin/readiness-tasks')
        .set(team.admin)
        .send({
          key: `sod-${uid()}`,
          locale: 'en',
          title: 'Pack the hospital bag',
          description: 'Maternity notes, clothes, snacks.',
          category: 'hospital_bag',
          sortOrder: 1,
          premium: false,
        })
        .expect(201);
      const task = created.body.id as string;
      const self = await http
        .post(`/v1/admin/readiness-tasks/${task}/publish`)
        .set(team.admin)
        .expect(403);
      expect(self.body.error.code).toBe('FORBIDDEN');
      await http
        .post(`/v1/admin/readiness-tasks/${task}/publish`)
        .set(team.reviewer)
        .expect(200);

      // A later edit by the editor: the administrator's earlier authorship no longer counts,
      // but the editor's does (editors can't publish anyway, so use a second reviewer path).
      await http
        .patch(`/v1/admin/readiness-tasks/${task}`)
        .set(team.editor)
        .send({ title: 'Pack the bag' })
        .expect(200);
      await http
        .post(`/v1/admin/readiness-tasks/${task}/publish`)
        .set(team.admin)
        .expect(200);

      // The audit trail records each step in order.
      const events = await prisma.auditEvent.findMany({
        where: { targetId: task },
        orderBy: { createdAt: 'asc' },
        select: { action: true, actorUserId: true },
      });
      expect(events.map((e) => e.action)).toEqual([
        'readiness_task.created',
        'readiness_task.published',
        'readiness_task.updated',
        'readiness_task.published',
      ]);
    });
  });

  describe('clinical content exposure', () => {
    it('never serves draft, in-review, approved or archived content publicly', async () => {
      const draft = await articleDraft(app, team.editor);
      const isPublic = async () => {
        const one = await http.get(`/v1/articles/${draft.slug}`);
        const list = await http.get('/v1/articles').query({ limit: 100 });
        return {
          status: one.status,
          listed: list.body.items.some(
            (a: { slug: string }) => a.slug === draft.slug,
          ),
        };
      };
      expect(await isPublic()).toEqual({ status: 404, listed: false });
      await http
        .post(`/v1/admin/articles/${draft.id}/submit`)
        .set(team.editor)
        .expect(200);
      expect(await isPublic()).toEqual({ status: 404, listed: false });
      await http
        .post(`/v1/admin/articles/${draft.id}/reviews`)
        .set(team.reviewer)
        .send(approval)
        .expect(201);
      expect(await isPublic()).toEqual({ status: 404, listed: false });
      await http
        .post(`/v1/admin/articles/${draft.id}/publish`)
        .set(team.editor)
        .expect(200);
      const published = await http
        .get(`/v1/articles/${draft.slug}`)
        .expect(200);
      expect(published.body.review).toMatchObject({
        reviewerCredentials: approval.reviewerCredentials,
      });
      await http
        .post(`/v1/admin/articles/${draft.id}/archive`)
        .set(team.editor)
        .expect(200);
      expect(await isPublic()).toEqual({ status: 404, listed: false });
    });

    it('a rejected review sends content back to draft and is not shown as reviewed', async () => {
      const draft = await articleDraft(app, team.editor);
      await http
        .post(`/v1/admin/articles/${draft.id}/submit`)
        .set(team.editor)
        .expect(200);
      await http
        .post(`/v1/admin/articles/${draft.id}/reviews`)
        .set(team.reviewer)
        .send({
          ...approval,
          decision: 'changes_requested',
          comments: 'Needs sources.',
        })
        .expect(201);
      const admin = await http
        .get(`/v1/admin/articles/${draft.id}`)
        .set(team.editor)
        .expect(200);
      expect(admin.body.status).toBe('draft');
      await http
        .post(`/v1/admin/articles/${draft.id}/publish`)
        .set(team.editor)
        .expect(409);
      await http.get(`/v1/articles/${draft.slug}`).expect(404);
    });

    it('validates review submissions', async () => {
      const draft = await articleDraft(app, team.editor);
      await http
        .post(`/v1/admin/articles/${draft.id}/submit`)
        .set(team.editor)
        .expect(200);
      for (const body of [
        {},
        { ...approval, decision: 'maybe' },
        { ...approval, reviewerCredentials: '' },
        { ...approval, sources: 'none' },
      ]) {
        await http
          .post(`/v1/admin/articles/${draft.id}/reviews`)
          .set(team.reviewer)
          .send(body)
          .expect(400);
      }
      await http
        .post(`/v1/admin/articles/${draft.id}/submit`)
        .set(team.editor)
        .expect(409);
      expect(refs.length).toBeGreaterThan(0);
    });
  });

  describe('information leakage', () => {
    it('returns a generic 500 without internals', async () => {
      const res = await http.get('/v1/leak-probe').expect(500);
      expect(res.body).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred.',
          requestId: res.headers['x-request-id'],
        },
      });
      expect(JSON.stringify(res.body)).not.toMatch(
        /hunter2|postgresql|lmp=|at .*\.ts/,
      );
    });

    it('does not reveal whether an id belongs to someone else', async () => {
      const owner = await pregnantUser(app, 20);
      const appt = await http
        .post('/v1/appointments')
        .set(owner)
        .send({
          kind: 'scan',
          title: 'x',
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);
      const other = await signUp(app);
      const foreign = await http
        .get(`/v1/appointments/${appt.body.id}`)
        .set(other)
        .expect(404);
      const missing = await http
        .get(`/v1/appointments/${randomUUID()}`)
        .set(other)
        .expect(404);
      expect(foreign.body.error.message).toBe(missing.body.error.message);
    });

    it('never returns credential material from account endpoints', async () => {
      const user = await signUp(app);
      const me = await http.get('/v1/me').set(user).expect(200);
      const admin = await http
        .get('/v1/admin/users')
        .query({ email: user.email })
        .set(team.support)
        .expect(200);
      for (const body of [me.body, admin.body]) {
        expect(JSON.stringify(body)).not.toMatch(
          /password|credentialHash|secret|token/i,
        );
      }
    });

    it('does not expose health values to support staff', async () => {
      const owner = await pregnantUser(app, 20);
      const res = await http
        .get('/v1/admin/users')
        .query({ email: owner.email })
        .set(team.support)
        .expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/dueDate|pregnan|symptom/i);
    });
  });

  describe('guest linking', () => {
    it('moves planning and journal data, de-duplicating saved and shopping items', async () => {
      const guest = await anonymous(app);
      await grantHealthConsent(app, guest);
      await http
        .post('/v1/pregnancies')
        .set(guest)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(100) } })
        .expect(201);
      await http
        .put(`/v1/daily-logs/${daysAgo(0)}`)
        .set(guest)
        .send({ symptoms: ['fatigue'], mood: 'okay' })
        .expect(200);
      await http
        .post('/v1/appointments')
        .set(guest)
        .send({
          kind: 'scan',
          title: 'Guest scan',
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);
      await http
        .post('/v1/shopping-list')
        .set(guest)
        .send({ name: 'oats' })
        .expect(201);
      await http
        .post('/v1/shopping-list')
        .set(guest)
        .send({ name: 'dates' })
        .expect(201);

      const user = await signUp(app);
      // The account already has a non-health item with the same name: no duplicate after linking.
      await http
        .post('/v1/shopping-list')
        .set(user)
        .send({ name: 'oats' })
        .expect(201);
      const linked = await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: (guest as Auth & { secret: string }).secret })
        .expect(200);
      expect(linked.body).toMatchObject({
        pregnancies: 1,
        dailyLogs: 1,
        consentRecords: 1,
      });

      await http.get('/v1/pregnancies/current').set(user).expect(200);
      const log = await http
        .get(`/v1/daily-logs/${daysAgo(0)}`)
        .set(user)
        .expect(200);
      expect(log.body).toMatchObject({ symptoms: ['fatigue'], mood: 'okay' });
      const appts = await http.get('/v1/appointments').set(user).expect(200);
      expect(appts.body.map((a: { title: string }) => a.title)).toEqual([
        'Guest scan',
      ]);
      const list = await http.get('/v1/shopping-list').set(user).expect(200);
      expect(list.body.map((i: { name: string }) => i.name).sort()).toEqual([
        'dates',
        'oats',
      ]);
      // Consent moved with the data, so the account can keep writing.
      await http
        .put(`/v1/daily-logs/${daysAgo(1)}`)
        .set(user)
        .send({ symptoms: [] })
        .expect(200);

      // The guest secret is retired and cannot be linked again, by anyone.
      await http.get('/v1/me').set(guest).expect(401);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: (guest as Auth & { secret: string }).secret })
        .expect(404);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(await signUp(app))
        .send({ secret: (guest as Auth & { secret: string }).secret })
        .expect(404);
      expect(
        await prisma.anonymousSession.findUnique({ where: { id: guest.id } }),
      ).toMatchObject({
        linkedUserId: user.id,
      });
    });

    it('rolls back completely when linking is refused', async () => {
      const guest = await anonymous(app);
      await grantHealthConsent(app, guest);
      await http
        .put(`/v1/daily-logs/${daysAgo(0)}`)
        .set(guest)
        .send({ symptoms: ['nausea'] })
        .expect(200);
      const user = await pregnantUser(app, 10);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: (guest as Auth & { secret: string }).secret })
        .expect(409);
      // Nothing moved and the guest session still works.
      await http
        .get(`/v1/daily-logs/${daysAgo(0)}`)
        .set(guest)
        .expect(200);
      expect(await prisma.dailyLog.count({ where: { userId: user.id } })).toBe(
        0,
      );
      expect(
        (await prisma.anonymousSession.findUnique({ where: { id: guest.id } }))
          ?.linkedUserId,
      ).toBeNull();
    });
  });
});
