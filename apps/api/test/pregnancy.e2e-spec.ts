import type { INestApplication } from '@nestjs/common';
import { Pregnancy, Timeline, WeekGuide } from '@preconception/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';
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

/** A body that the global ValidationPipe accepts for a week guide. */
function sections(overrides: Record<string, unknown> = {}) {
  return {
    baby: 'Your baby is about the size of a lime; the kidneys have started making urine.',
    body: 'Many women find nausea starts to ease around now.',
    symptoms: ['Tiredness', 'Nausea'],
    eat: 'Keep taking folic acid. Small, frequent meals can help nausea.',
    move: 'Gentle walking if you feel up to it.',
    visits: 'A dating scan is often offered between 11 and 14 weeks.',
    askAtVisit: ['Which screening tests are offered?'],
    prepare: ['Save your maternity unit number'],
    avoid: ['Alcohol', 'Unpasteurised cheese'],
    whenToGetHelp: ['Vaginal bleeding', 'Severe belly pain'],
    checklist: ['Book your dating scan'],
    message: 'You are nearly through the first trimester.',
    firstPregnancyNote: null,
    subsequentPregnancyNote: null,
    ...overrides,
  };
}

async function newUserWithConsent(
  app: INestApplication<App>,
): Promise<Auth & { id: string }> {
  const user = await signUp(app);
  await grantHealthConsent(app, user);
  return user;
}

describe('Pregnancy tracking (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getPrisma(app);
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('starting a pregnancy', () => {
    it('requires health-data consent', async () => {
      const user = await signUp(app);
      const res = await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(60) } });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('CONSENT_REQUIRED');
    });

    it('dates from the last period and reports week, trimester and term', async () => {
      const user = await newUserWithConsent(app);
      const res = await http
        .post('/v1/pregnancies')
        .set(user)
        .send({
          dating: { method: 'lmp', lmpDate: daysAgo(87) },
          firstPregnancy: true,
        })
        .expect(201);
      expect(Pregnancy.parse(res.body)).toMatchObject({
        status: 'active',
        dueDate: daysAgo(87 - 280),
        datingMethod: 'lmp',
        datingSource: 'self',
        today: daysAgo(0),
        gestationalAge: { weeks: 12, days: 3 },
        week: 12,
        trimester: 1,
        termStatus: 'preterm',
        daysUntilDue: 193,
        firstPregnancy: true,
        fetusCount: 'unknown',
      });
    });

    it('adjusts for cycle length', async () => {
      const user = await newUserWithConsent(app);
      const res = await http
        .post('/v1/pregnancies')
        .set(user)
        .send({
          dating: { method: 'lmp', lmpDate: daysAgo(100), cycleLengthDays: 35 },
        })
        .expect(201);
      expect(res.body.dueDate).toBe(daysAgo(100 - 287));
    });

    it.each([
      [
        { method: 'due_date', dueDate: daysAgo(-100) },
        { weeks: 25, days: 5 },
        2,
      ],
      [
        {
          method: 'ultrasound',
          scanDate: daysAgo(10),
          gestationalWeeks: 12,
          gestationalDays: 0,
        },
        { weeks: 13, days: 3 },
        1,
      ],
      [
        { method: 'ivf', transferDate: daysAgo(20), embryoAgeDays: 5 },
        { weeks: 5, days: 4 },
        1,
      ],
    ])('dates by %j', async (dating, gestationalAge, trimester) => {
      const user = await newUserWithConsent(app);
      const res = await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating, source: 'clinician' })
        .expect(201);
      expect(res.body).toMatchObject({
        gestationalAge,
        trimester,
        datingSource: 'clinician',
        datingMethod: dating.method,
      });
    });

    it.each([
      [{ dating: { method: 'lmp' } }, 'dating.lmpDate'],
      [{ dating: { method: 'lmp', lmpDate: daysAgo(-1) } }, 'lmpDate'],
      [{ dating: { method: 'lmp', lmpDate: daysAgo(320) } }, 'method'],
      [{ dating: { method: 'due_date', dueDate: daysAgo(-300) } }, 'dueDate'],
      [
        {
          dating: { method: 'lmp', lmpDate: daysAgo(30), cycleLengthDays: 60 },
        },
        'dating.cycleLengthDays',
      ],
      [
        {
          dating: {
            method: 'ultrasound',
            scanDate: daysAgo(5),
            gestationalWeeks: 10,
            gestationalDays: 7,
          },
        },
        'dating.gestationalDays',
      ],
      [{ dating: { method: 'guess' } }, 'dating.method'],
      [{}, 'dating'],
      [
        { dating: { method: 'lmp', lmpDate: daysAgo(30) }, userId: 'x' },
        'property',
      ],
      [
        {
          dating: { method: 'lmp', lmpDate: daysAgo(30) },
          fetusCount: 'seven',
        },
        'fetusCount',
      ],
      [
        {
          dating: { method: 'lmp', lmpDate: daysAgo(30) },
          foodRestrictions: ['<script>'],
        },
        'foodRestrictions',
      ],
    ])('rejects %j', async (body, path) => {
      const user = await newUserWithConsent(app);
      const res = await http.post('/v1/pregnancies').set(user).send(body);
      expect(res.status).toBe(400);
      const paths = res.body.error.details.map(
        (d: { path: string; message: string }) => `${d.path} ${d.message}`,
      );
      expect(paths.join(' | ')).toContain(path);
    });

    it('allows only one active pregnancy (409)', async () => {
      const user = await newUserWithConsent(app);
      await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(50) } })
        .expect(201);
      const res = await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(40) } });
      expect(res.status).toBe(409);
    });

    it('works for anonymous sessions', async () => {
      const anon = await anonymous(app);
      await grantHealthConsent(app, anon);
      await http
        .post('/v1/pregnancies')
        .set(anon)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(70) } })
        .expect(201);
      const res = await http
        .get('/v1/pregnancies/current')
        .set(anon)
        .expect(200);
      expect(res.body.week).toBe(10);
    });
  });

  describe('the active pregnancy', () => {
    let user: Auth & { id: string };

    beforeAll(async () => {
      user = await newUserWithConsent(app);
      await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(150) } })
        .expect(201);
    });

    it('404s when there is none', async () => {
      const fresh = await newUserWithConsent(app);
      await http.get('/v1/pregnancies/current').set(fresh).expect(404);
      await http.get('/v1/pregnancies/current/timeline').set(fresh).expect(404);
      await http
        .patch('/v1/pregnancies/current')
        .set(fresh)
        .send({ firstPregnancy: false })
        .expect(404);
    });

    it('updates details and normalises food restrictions', async () => {
      const res = await http
        .patch('/v1/pregnancies/current')
        .set(user)
        .send({
          firstPregnancy: false,
          fetusCount: 'twins',
          restrictExercise: true,
          foodRestrictions: [' Dairy ', 'nuts'],
        })
        .expect(200);
      expect(res.body).toMatchObject({
        firstPregnancy: false,
        fetusCount: 'twins',
        restrictExercise: true,
        foodRestrictions: ['dairy', 'nuts'],
      });
      const again = await http
        .patch('/v1/pregnancies/current')
        .set(user)
        .send({ fetusCount: 'one' })
        .expect(200);
      expect(again.body).toMatchObject({
        fetusCount: 'one',
        restrictExercise: true,
        firstPregnancy: false,
      });
    });

    it('re-dates after a scan, says how far it moved, and keeps the history', async () => {
      const before = await http
        .get('/v1/pregnancies/current')
        .set(user)
        .expect(200);
      const res = await http
        .put('/v1/pregnancies/current/dating')
        .set(user)
        .send({
          dating: {
            method: 'ultrasound',
            scanDate: daysAgo(3),
            gestationalWeeks: 21,
            gestationalDays: 0,
          },
          source: 'clinician',
        })
        .expect(200);
      // LMP 150 days ago → 150 days; scan says 147 + 3 = 150? 21w0d = 147 at the scan, 150 today.
      expect(res.body.change).toEqual({
        previousDueDate: before.body.dueDate,
        newDueDate: before.body.dueDate,
        shiftDays: 0,
      });

      const later = await http
        .put('/v1/pregnancies/current/dating')
        .set(user)
        .send({
          dating: { method: 'due_date', dueDate: daysAgo(150 - 280 - 7) },
          source: 'clinician',
        })
        .expect(200);
      expect(later.body.change.shiftDays).toBe(7);
      expect(later.body.pregnancy).toMatchObject({
        datingMethod: 'due_date',
        datingSource: 'clinician',
        gestationalAge: { weeks: 20, days: 3 },
      });

      const history = await http
        .get('/v1/pregnancies/current/dating-history')
        .set(user)
        .expect(200);
      expect(history.body.map((h: { method: string }) => h.method)).toEqual([
        'due_date',
        'ultrasound',
        'lmp',
      ]);
      expect(history.body[2].inputs).toEqual({
        method: 'lmp',
        lmpDate: daysAgo(150),
      });
    });

    it('returns a 42-week timeline with milestones that follows the due date', async () => {
      const res = await http
        .get('/v1/pregnancies/current/timeline')
        .set(user)
        .expect(200);
      const t = Timeline.parse(res.body);
      expect(t.weeks).toHaveLength(42);
      const current = await http.get('/v1/pregnancies/current').set(user);
      expect(t.dueDate).toBe(current.body.dueDate);
      expect(
        t.milestones.find((m) => m.key === 'second_trimester')?.status,
      ).toBe('past');
      expect(t.milestones.find((m) => m.key === 'due_date')).toMatchObject({
        date: t.dueDate,
        status: 'upcoming',
      });
    });

    it("keeps each person's pregnancy private", async () => {
      const other = await newUserWithConsent(app);
      await http.get('/v1/pregnancies/current').set(other).expect(404);
      const list = await http.get('/v1/pregnancies').set(other).expect(200);
      expect(list.body.page.total).toBe(0);
    });
  });

  describe('ending and restarting', () => {
    it('ends for a loss, then allows a new pregnancy', async () => {
      const user = await newUserWithConsent(app);
      await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(60) } })
        .expect(201);
      await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'loss', endedOn: daysAgo(-1) })
        .expect(400);
      const ended = await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'loss', endedOn: daysAgo(2) })
        .expect(200);
      expect(ended.body).toMatchObject({
        status: 'ended',
        outcome: 'loss',
        endedOn: daysAgo(2),
        today: daysAgo(2),
        gestationalAge: { weeks: 8, days: 2 },
      });
      await http.get('/v1/pregnancies/current').set(user).expect(404);
      await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'loss', endedOn: daysAgo(1) })
        .expect(404);

      await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(14) } })
        .expect(201);
      const list = await http.get('/v1/pregnancies').set(user).expect(200);
      expect(list.body.items.map((p: Pregnancy) => p.status)).toEqual([
        'active',
        'ended',
      ]);
    });

    it('rejects an unknown outcome', async () => {
      const user = await newUserWithConsent(app);
      await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(60) } })
        .expect(201);
      await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'unknown', endedOn: daysAgo(0) })
        .expect(400);
    });
  });

  describe('week guides', () => {
    let editor: Auth & { id: string };
    let reviewer: Auth & { id: string };

    async function publishWeek(week: number, title = `Week ${week}`) {
      const created = await http
        .post('/v1/admin/week-guides')
        .set(editor)
        .send({
          week,
          locale: 'en',
          title,
          summary: 'This week at a glance.',
          sections: sections(),
          references: [{ title: 'ACOG', url: 'https://www.acog.org/' }],
        })
        .expect(201);
      expect(created.body).toMatchObject({
        kind: 'week_guide',
        week,
        slug: `pregnancy-week-${week}`,
        premium: false,
        status: 'draft',
      });
      const id = created.body.id;
      await http
        .post(`/v1/admin/articles/${id}/submit`)
        .set(editor)
        .expect(200);
      await http
        .post(`/v1/admin/articles/${id}/reviews`)
        .set(reviewer)
        .send({
          decision: 'approved',
          reviewerCredentials: 'RM, Midwife',
          sources: [{ title: 'NHS' }],
        })
        .expect(201);
      await http
        .post(`/v1/admin/articles/${id}/publish`)
        .set(editor)
        .expect(200);
      return id as string;
    }

    beforeAll(async () => {
      editor = await staffUser(app, prisma, 'content_editor');
      reviewer = await staffUser(app, prisma, 'clinical_reviewer');
    });

    it('go through clinical review, then appear for the current week', async () => {
      await publishWeek(12, 'Week 12: nearly through the first trimester');
      const guide = await http.get('/v1/week-guides/12').expect(200);
      expect(WeekGuide.parse(guide.body)).toMatchObject({
        week: 12,
        title: 'Week 12: nearly through the first trimester',
        review: { reviewerCredentials: 'RM, Midwife' },
      });

      const user = await newUserWithConsent(app);
      await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(86) } })
        .expect(201);
      const thisWeek = await http
        .get('/v1/pregnancies/current/week')
        .set(user)
        .expect(200);
      expect(thisWeek.body.pregnancy.week).toBe(12);
      expect(thisWeek.body.guide.sections.whenToGetHelp).toContain(
        'Vaginal bleeding',
      );
    });

    it('returns no guide until that week is published', async () => {
      const user = await newUserWithConsent(app);
      await http
        .post('/v1/pregnancies')
        .set(user)
        .send({
          dating: {
            method: 'ivf',
            transferDate: daysAgo(20),
            embryoAgeDays: 5,
          },
        })
        .expect(201);
      const res = await http
        .get('/v1/pregnancies/current/week')
        .set(user)
        .expect(200);
      expect(res.body).toMatchObject({ pregnancy: { week: 5 }, guide: null });
      await http.get('/v1/week-guides/3').expect(404);
    });

    it('validates the week parameter', async () => {
      for (const w of ['0', '43', 'abc'])
        await http.get(`/v1/week-guides/${w}`).expect(400);
    });

    it('a new version replaces the published one', async () => {
      await publishWeek(30, 'Week 30 v1');
      await publishWeek(30, 'Week 30 v2');
      const res = await http.get('/v1/week-guides/30').expect(200);
      expect(res.body.title).toBe('Week 30 v2');
    });

    it('stay out of the article list and article reads', async () => {
      await publishWeek(31);
      const list = await http.get('/v1/articles?limit=100').expect(200);
      expect(
        list.body.items.map((a: { slug: string }) => a.slug),
      ).not.toContain('pregnancy-week-31');
      await http.get('/v1/articles/pregnancy-week-31').expect(404);
      const admin = await http
        .get('/v1/admin/articles?kind=week_guide&limit=100')
        .set(editor)
        .expect(200);
      expect(
        admin.body.items.every(
          (a: { kind: string }) => a.kind === 'week_guide',
        ),
      ).toBe(true);
    });

    it.each([
      [{ week: 0 }, 'week'],
      [{ week: 43 }, 'week'],
      [{ sections: sections({ whenToGetHelp: [] }) }, 'sections.whenToGetHelp'],
      [{ sections: sections({ baby: '' }) }, 'sections.baby'],
      [{ references: [] }, 'references'],
      [{ premium: true }, 'property'],
    ])('validate drafts %j', async (overrides, path) => {
      const res = await http
        .post('/v1/admin/week-guides')
        .set(editor)
        .send({
          week: 20,
          locale: 'en',
          title: 't',
          summary: 's',
          sections: sections(),
          references: [{ title: 'x' }],
          ...overrides,
        });
      expect(res.status).toBe(400);
      expect(
        res.body.error.details
          .map(
            (d: { path: string; message: string }) => `${d.path} ${d.message}`,
          )
          .join(' | '),
      ).toContain(path);
    });

    it('cannot be made premium, and articles cannot take their slug or sections', async () => {
      const created = await http
        .post('/v1/admin/week-guides')
        .set(editor)
        .send({
          week: 25,
          locale: 'en',
          title: 't',
          summary: 's',
          sections: sections(),
          references: [{ title: 'x' }],
        });
      const id =
        created.status === 201
          ? created.body.id
          : (
              await prisma.article.findFirstOrThrow({
                where: { slug: 'pregnancy-week-25', status: 'draft' },
              })
            ).id;
      await http
        .patch(`/v1/admin/articles/${id}`)
        .set(editor)
        .send({ premium: true })
        .expect(400);

      await http
        .post('/v1/admin/articles')
        .set(editor)
        .send({
          slug: 'pregnancy-week-7',
          locale: 'en',
          title: 't',
          summary: 's',
          body: 'b',
          references: [],
          premium: false,
        })
        .expect(400);
      const article = await http
        .post('/v1/admin/articles')
        .set(editor)
        .send({
          slug: `plain-${Date.now()}`,
          locale: 'en',
          title: 't',
          summary: 's',
          body: 'b',
          references: [],
          premium: false,
        })
        .expect(201);
      await http
        .patch(`/v1/admin/articles/${article.body.id}`)
        .set(editor)
        .send({ sections: sections() })
        .expect(400);
    });

    it('only content editors create them', async () => {
      const user = await signUp(app);
      await http.post('/v1/admin/week-guides').set(user).send({}).expect(403);
      await http
        .post('/v1/admin/week-guides')
        .set(reviewer)
        .send({
          week: 9,
          locale: 'en',
          title: 't',
          summary: 's',
          sections: sections(),
          references: [{ title: 'x' }],
        })
        .expect(403);
    });
  });

  describe('personalisation profile', () => {
    it('stores country, diet, allergies and activity level', async () => {
      const user = await signUp(app);
      const res = await http
        .put('/v1/me/profile')
        .set(user)
        .send({
          timeZone: 'Asia/Karachi',
          locale: 'en',
          countryCode: 'PK',
          dietPattern: 'eggetarian',
          foodAllergies: ['peanut'],
          activityLevel: 'low',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        countryCode: 'PK',
        dietPattern: 'eggetarian',
        foodAllergies: ['peanut'],
        activityLevel: 'low',
      });
      const def = await http
        .get('/v1/me/profile')
        .set(await signUp(app))
        .expect(200);
      expect(def.body).toMatchObject({
        countryCode: null,
        dietPattern: null,
        foodAllergies: [],
        activityLevel: null,
      });
    });

    it.each([
      { countryCode: 'pk' },
      { countryCode: 'PAK' },
      { dietPattern: 'keto' },
      { foodAllergies: ['peanut', 'peanut'] },
      { foodAllergies: ['chocolate'] },
      { activityLevel: 'extreme' },
    ])('rejects %j', async (extra) => {
      const user = await signUp(app);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'UTC', locale: 'en', ...extra })
        .expect(400);
    });
  });

  describe('linking, export and deletion', () => {
    it('moves an anonymous pregnancy into a new account', async () => {
      const anon = await anonymous(app);
      await grantHealthConsent(app, anon);
      await http
        .post('/v1/pregnancies')
        .set(anon)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(40) } })
        .expect(201);
      const user = await signUp(app);
      const res = await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: anon.secret })
        .expect(200);
      expect(res.body.pregnancies).toBe(1);
      const current = await http
        .get('/v1/pregnancies/current')
        .set(user)
        .expect(200);
      expect(current.body.week).toBe(5);
    });

    it('refuses to link when the account already tracks a pregnancy', async () => {
      const user = await newUserWithConsent(app);
      await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(40) } })
        .expect(201);
      const anon = await anonymous(app);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: anon.secret })
        .expect(409);
    });

    it('exports pregnancies with their dating history', async () => {
      const user = await newUserWithConsent(app);
      await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(40) } })
        .expect(201);
      await http
        .put('/v1/pregnancies/current/dating')
        .set(user)
        .send({ dating: { method: 'due_date', dueDate: daysAgo(-245) } })
        .expect(200);
      const res = await http.post('/v1/me/export').set(user).expect(200);
      expect(res.body.pregnancies).toHaveLength(1);
      expect(res.body.pregnancies[0]).toMatchObject({
        status: 'active',
        dueDate: daysAgo(-245),
        datingMethod: 'due_date',
      });
      expect(
        res.body.pregnancies[0].datingHistory.map(
          (d: { method: string }) => d.method,
        ),
      ).toEqual(['lmp', 'due_date']);
    });

    it('deletes pregnancies and dating history with the account', async () => {
      const user = await newUserWithConsent(app);
      const created = await http
        .post('/v1/pregnancies')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(40) } })
        .expect(201);
      await http
        .post('/v1/me/deletion')
        .set(user)
        .send({ confirm: 'DELETE MY ACCOUNT' })
        .expect(204);
      expect(
        await prisma.pregnancy.count({ where: { id: created.body.id } }),
      ).toBe(0);
      expect(
        await prisma.pregnancyDating.count({
          where: { pregnancyId: created.body.id },
        }),
      ).toBe(0);
    });
  });
});
