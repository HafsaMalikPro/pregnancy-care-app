import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  Article,
  ArticleSummary,
  ReadinessTask,
} from '@preconception/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  anonymous,
  type Auth,
  createTestApp,
  getPrisma,
  grantHealthConsent,
  signUp,
  staffUser,
} from './helpers.js';

function draft(slug: string, premium = false) {
  return {
    slug,
    locale: 'en',
    title: `Title ${slug}`,
    summary: 'Short summary',
    body: 'Evidence-based body text.',
    references: [
      { title: 'WHO preconception care', url: 'https://www.who.int/' },
    ],
    premium,
  };
}

const review = (decision: 'approved' | 'changes_requested' = 'approved') => ({
  decision,
  reviewerCredentials: 'MD, Obstetrics & Gynecology',
  sources: [{ title: 'NICE guideline', url: 'https://www.nice.org.uk/' }],
});

describe('Content workflow and admin (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let editor: Auth & { id: string };
  let reviewer: Auth & { id: string };
  let admin: Auth & { id: string };
  let support: Auth & { id: string };

  /** Draft → review → approve → publish. Returns the published article id. */
  async function publish(slug: string, premium = false): Promise<string> {
    const created = await http
      .post('/v1/admin/articles')
      .set(editor)
      .send(draft(slug, premium))
      .expect(201);
    const id = created.body.id;
    await http.post(`/v1/admin/articles/${id}/submit`).set(editor).expect(200);
    await http
      .post(`/v1/admin/articles/${id}/reviews`)
      .set(reviewer)
      .send(review())
      .expect(201);
    await http.post(`/v1/admin/articles/${id}/publish`).set(editor).expect(200);
    return id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getPrisma(app);
    http = request(app.getHttpServer());
    editor = await staffUser(app, prisma, 'content_editor');
    reviewer = await staffUser(app, prisma, 'clinical_reviewer');
    admin = await staffUser(app, prisma, 'administrator');
    support = await staffUser(app, prisma, 'support');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('staff access', () => {
    it('forbids ordinary users and anonymous sessions (403)', async () => {
      const user = await signUp(app);
      const anon = await anonymous(app);
      for (const path of [
        '/v1/admin/articles',
        '/v1/admin/users',
        '/v1/admin/audit-events',
      ]) {
        await http.get(path).set(user).expect(403);
        await http.get(path).set(anon).expect(403);
      }
    });

    it('requires two-factor auth for staff', async () => {
      const noMfa = await staffUser(app, prisma, 'content_editor', false);
      const res = await http.get('/v1/admin/articles').set(noMfa).expect(403);
      expect(res.body.error.message).toMatch(/two-factor/);
    });

    it('enforces roles per action', async () => {
      await http
        .post('/v1/admin/articles')
        .set(reviewer)
        .send(draft(`r-${randomUUID()}`))
        .expect(403);
      await http.get('/v1/admin/users').set(editor).expect(403);
      await http.get('/v1/admin/audit-events').set(support).expect(403);
      await http.get('/v1/admin/users').set(support).expect(200);
      // Administrators pass every staff check.
      await http.get('/v1/admin/articles').set(admin).expect(200);
    });
  });

  describe('article workflow', () => {
    it('publishes only after an approving review, then serves it publicly', async () => {
      const slug = `folic-${randomUUID().slice(0, 8)}`;
      const created = await http
        .post('/v1/admin/articles')
        .set(editor)
        .send(draft(slug))
        .expect(201);
      expect(created.body).toMatchObject({
        status: 'draft',
        version: 1,
        createdById: editor.id,
      });
      const id = created.body.id;

      await http
        .post(`/v1/admin/articles/${id}/publish`)
        .set(editor)
        .expect(409);
      await http.get(`/v1/articles/${slug}`).expect(404);

      await http
        .post(`/v1/admin/articles/${id}/submit`)
        .set(editor)
        .expect(200);
      await http
        .patch(`/v1/admin/articles/${id}`)
        .set(editor)
        .send({ title: 'x' })
        .expect(409);
      await http
        .post(`/v1/admin/articles/${id}/reviews`)
        .set(reviewer)
        .send(review())
        .expect(201);
      const published = await http
        .post(`/v1/admin/articles/${id}/publish`)
        .set(editor)
        .expect(200);
      expect(published.body.status).toBe('published');

      const pub = await http.get(`/v1/articles/${slug}`).expect(200);
      expect(Article.parse(pub.body)).toMatchObject({
        slug,
        version: 1,
        locked: false,
        body: 'Evidence-based body text.',
        review: { reviewerCredentials: 'MD, Obstetrics & Gynecology' },
      });
      expect(pub.body.nextReviewDue).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const list = await http.get('/v1/articles?limit=100').expect(200);
      expect(
        list.body.items.map(
          (a: ArticleSummary) => ArticleSummary.parse(a).slug,
        ),
      ).toContain(slug);
    });

    it('sends changes back to draft', async () => {
      const created = await http
        .post('/v1/admin/articles')
        .set(editor)
        .send(draft(`cr-${randomUUID().slice(0, 8)}`))
        .expect(201);
      const id = created.body.id;
      await http
        .post(`/v1/admin/articles/${id}/submit`)
        .set(editor)
        .expect(200);
      const res = await http
        .post(`/v1/admin/articles/${id}/reviews`)
        .set(reviewer)
        .send(review('changes_requested'))
        .expect(201);
      expect(res.body.article.status).toBe('draft');
      await http
        .patch(`/v1/admin/articles/${id}`)
        .set(editor)
        .send({ body: 'Revised.' })
        .expect(200);
    });

    it('stops authors from reviewing their own article', async () => {
      const created = await http
        .post('/v1/admin/articles')
        .set(admin)
        .send(draft(`self-${randomUUID().slice(0, 8)}`))
        .expect(201);
      await http
        .post(`/v1/admin/articles/${created.body.id}/submit`)
        .set(admin)
        .expect(200);
      await http
        .post(`/v1/admin/articles/${created.body.id}/reviews`)
        .set(admin)
        .send(review())
        .expect(403);
    });

    it('archives the previous version when a new one is published', async () => {
      const slug = `ver-${randomUUID().slice(0, 8)}`;
      const v1 = await publish(slug);
      await http
        .post('/v1/admin/articles')
        .set(editor)
        .send(draft(slug))
        .expect(201)
        .then(async (res) => {
          expect(res.body.version).toBe(2);
          // Only one working copy at a time.
          await http
            .post('/v1/admin/articles')
            .set(editor)
            .send(draft(slug))
            .expect(409);
          await http
            .post(`/v1/admin/articles/${res.body.id}/submit`)
            .set(editor)
            .expect(200);
          await http
            .post(`/v1/admin/articles/${res.body.id}/reviews`)
            .set(reviewer)
            .send(review())
            .expect(201);
          await http
            .post(`/v1/admin/articles/${res.body.id}/publish`)
            .set(editor)
            .expect(200);
        });
      const old = await http
        .get(`/v1/admin/articles/${v1}`)
        .set(editor)
        .expect(200);
      expect(old.body.status).toBe('archived');
      const pub = await http.get(`/v1/articles/${slug}`).expect(200);
      expect(pub.body.version).toBe(2);
    });

    it('unpublishes on archive', async () => {
      const slug = `arch-${randomUUID().slice(0, 8)}`;
      const id = await publish(slug);
      await http
        .post(`/v1/admin/articles/${id}/archive`)
        .set(editor)
        .expect(200);
      await http.get(`/v1/articles/${slug}`).expect(404);
      await http
        .post(`/v1/admin/articles/${id}/archive`)
        .set(editor)
        .expect(409);
    });

    it.each([
      { ...draft('Bad Slug') },
      { ...draft('ok-slug'), locale: 'de' },
      {
        ...draft('ok-slug'),
        references: [{ title: 'x', url: 'http://insecure.test' }],
      },
      { ...draft('ok-slug'), title: '' },
      { ...draft('ok-slug'), status: 'published' },
    ])('validates drafts %#', async (body) => {
      const res = await http
        .post('/v1/admin/articles')
        .set(editor)
        .send(body)
        .expect(400);
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('reports nested validation paths', async () => {
      const res = await http
        .post('/v1/admin/articles')
        .set(editor)
        .send({
          ...draft('nested-path'),
          references: [{ title: 'x', url: 'ftp://x' }],
        })
        .expect(400);
      expect(res.body.error.details[0].path).toBe('references.0.url');
    });

    it('records audit events for every transition', async () => {
      const id = await publish(`audit-${randomUUID().slice(0, 8)}`);
      const events = await http
        .get(`/v1/admin/audit-events?limit=100`)
        .set(admin)
        .expect(200);
      const actions = events.body.items
        .filter((e: { targetId: string }) => e.targetId === id)
        .map((e: { action: string }) => e.action)
        .sort();
      expect(actions).toEqual([
        'article.created',
        'article.published',
        'article.review.approved',
        'article.submitted',
      ]);
    });

    it('returns 404 for unknown or malformed public slugs', async () => {
      await http.get('/v1/articles/does-not-exist').expect(404);
      await http.get('/v1/articles/..%2F..%2Fetc').expect(404);
    });
  });

  describe('premium gating', () => {
    let slug: string;

    beforeAll(async () => {
      slug = `premium-${randomUUID().slice(0, 8)}`;
      await publish(slug, true);
    });

    it('locks the body for visitors, anonymous sessions and free users', async () => {
      for (const auth of [{}, await anonymous(app), await signUp(app)]) {
        const res = await http
          .get(`/v1/articles/${slug}`)
          .set(auth)
          .expect(200);
        expect(res.body).toMatchObject({
          locked: true,
          body: null,
          premium: true,
        });
      }
    });

    it('unlocks it for an active subscription only', async () => {
      const user = await signUp(app);
      const sub = await prisma.subscription.create({
        data: {
          userId: user.id,
          provider: 'web',
          productId: 'premium_monthly',
          externalId: randomUUID(),
          state: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        },
      });
      const ent = await http.get('/v1/me/entitlement').set(user).expect(200);
      expect(ent.body).toMatchObject({ premium: true, status: 'active' });
      const res = await http.get(`/v1/articles/${slug}`).set(user).expect(200);
      expect(res.body).toMatchObject({
        locked: false,
        body: 'Evidence-based body text.',
      });

      await prisma.subscription.update({
        where: { id: sub.id },
        data: { currentPeriodEnd: new Date(Date.now() - 1000) },
      });
      const lapsed = await http.get('/v1/me/entitlement').set(user).expect(200);
      expect(lapsed.body).toMatchObject({ premium: false, status: 'expired' });
      const locked = await http
        .get(`/v1/articles/${slug}`)
        .set(user)
        .expect(200);
      expect(locked.body.locked).toBe(true);
    });

    it('401s when invalid credentials are sent to a public article', async () => {
      await http
        .get(`/v1/articles/${slug}`)
        .set({ authorization: 'Bearer nope' })
        .expect(401);
    });
  });

  describe('readiness tasks', () => {
    let freeTask: string;
    let premiumTask: string;
    let draftTask: string;

    beforeAll(async () => {
      const make = async (premium: boolean, publishIt: boolean) => {
        const res = await http
          .post('/v1/admin/readiness-tasks')
          .set(editor)
          .send({
            key: `task-${randomUUID().slice(0, 8)}`,
            locale: 'en',
            title: 'Start folic acid',
            description: 'Daily 400 µg supplement.',
            category: 'nutrition',
            sortOrder: 1,
            premium,
          })
          .expect(201);
        if (publishIt) {
          await http
            .post(`/v1/admin/readiness-tasks/${res.body.id}/publish`)
            .set(reviewer)
            .expect(200);
        }
        return res.body.id as string;
      };
      freeTask = await make(false, true);
      premiumTask = await make(true, true);
      draftTask = await make(false, false);
    });

    it('only clinical reviewers publish tasks', async () => {
      await http
        .post(`/v1/admin/readiness-tasks/${draftTask}/publish`)
        .set(editor)
        .expect(403);
    });

    it('lists published tasks, locking premium descriptions', async () => {
      const user = await signUp(app);
      const res = await http.get('/v1/readiness/tasks').set(user).expect(200);
      const tasks = (res.body as ReadinessTask[]).map((t) =>
        ReadinessTask.parse(t),
      );
      const ids = tasks.map((t) => t.id);
      expect(ids).toContain(freeTask);
      expect(ids).toContain(premiumTask);
      expect(ids).not.toContain(draftTask);
      expect(tasks.find((t) => t.id === premiumTask)).toMatchObject({
        locked: true,
        description: null,
      });
    });

    it('records progress with consent, keeping it private per owner', async () => {
      const user = await signUp(app);
      const blocked = await http
        .put(`/v1/readiness/tasks/${freeTask}/progress`)
        .set(user)
        .send({ completed: true });
      expect(blocked.body.error.code).toBe('CONSENT_REQUIRED');
      await grantHealthConsent(app, user);
      const done = await http
        .put(`/v1/readiness/tasks/${freeTask}/progress`)
        .set(user)
        .send({ completed: true, note: 'Ask about dosage' })
        .expect(200);
      expect(done.body).toMatchObject({ note: 'Ask about dosage' });
      expect(done.body.completedAt).not.toBeNull();

      const other = await signUp(app);
      const theirs = await http
        .get('/v1/readiness/tasks')
        .set(other)
        .expect(200);
      expect(
        theirs.body.find((t: ReadinessTask) => t.id === freeTask),
      ).toMatchObject({ completedAt: null, note: null });

      const undone = await http
        .put(`/v1/readiness/tasks/${freeTask}/progress`)
        .set(user)
        .send({ completed: false })
        .expect(200);
      expect(undone.body.completedAt).toBeNull();
    });

    it('requires premium for premium tasks and 404s for unpublished ones', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      const res = await http
        .put(`/v1/readiness/tasks/${premiumTask}/progress`)
        .set(user)
        .send({ completed: true });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PREMIUM_REQUIRED');
      await http
        .put(`/v1/readiness/tasks/${draftTask}/progress`)
        .set(user)
        .send({ completed: true })
        .expect(404);
    });

    it('returns an edited task to draft until re-published', async () => {
      await http
        .patch(`/v1/admin/readiness-tasks/${freeTask}`)
        .set(editor)
        .send({ title: 'Updated' })
        .expect(200);
      const user = await signUp(app);
      const res = await http.get('/v1/readiness/tasks').set(user).expect(200);
      expect(res.body.map((t: ReadinessTask) => t.id)).not.toContain(freeTask);
      await http
        .post(`/v1/admin/readiness-tasks/${freeTask}/publish`)
        .set(reviewer)
        .expect(200);
    });

    it('rejects duplicate keys (409)', async () => {
      const key = `dup-${randomUUID().slice(0, 8)}`;
      const body = {
        key,
        locale: 'en',
        title: 't',
        description: 'd',
        category: 'nutrition',
        sortOrder: 0,
        premium: false,
      };
      await http
        .post('/v1/admin/readiness-tasks')
        .set(editor)
        .send(body)
        .expect(201);
      await http
        .post('/v1/admin/readiness-tasks')
        .set(editor)
        .send(body)
        .expect(409);
    });
  });

  describe('user administration', () => {
    it('looks up accounts without exposing health data', async () => {
      const user = await signUp(app);
      const res = await http
        .get(`/v1/admin/users?email=${encodeURIComponent(user.email)}`)
        .set(support)
        .expect(200);
      expect(res.body.page.total).toBe(1);
      expect(Object.keys(res.body.items[0]).sort()).toEqual([
        'createdAt',
        'email',
        'emailVerified',
        'id',
        'name',
        'staffRole',
        'status',
        'twoFactorEnabled',
      ]);
    });

    it('lets administrators change roles, revoking sessions and auditing it', async () => {
      const user = await signUp(app);
      await http
        .patch(`/v1/admin/users/${user.id}/staff-role`)
        .set(support)
        .send({ staffRole: 'support' })
        .expect(403);
      const res = await http
        .patch(`/v1/admin/users/${user.id}/staff-role`)
        .set(admin)
        .send({ staffRole: 'support' })
        .expect(200);
      expect(res.body.staffRole).toBe('support');
      await http.get('/v1/me').set(user).expect(401);
      const audit = await prisma.auditEvent.findFirst({
        where: { action: 'user.staff_role_changed', targetId: user.id },
      });
      expect(audit).toMatchObject({
        actorUserId: admin.id,
        metadata: { from: null, to: 'support' },
      });
    });

    it('stops administrators from changing their own role', async () => {
      await http
        .patch(`/v1/admin/users/${admin.id}/staff-role`)
        .set(admin)
        .send({ staffRole: null })
        .expect(403);
    });

    it('validates role changes', async () => {
      const user = await signUp(app);
      await http
        .patch(`/v1/admin/users/${user.id}/staff-role`)
        .set(admin)
        .send({ staffRole: 'superuser' })
        .expect(400);
      await http
        .patch(
          '/v1/admin/users/01a14ddb-0000-7000-8000-000000000000/staff-role',
        )
        .set(admin)
        .send({ staffRole: null })
        .expect(404);
    });
  });
});
