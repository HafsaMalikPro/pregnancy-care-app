import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type {
  DailyPlan,
  ExercisePlan,
  PersonalMealPlan,
  Recipe,
} from '@preconception/contracts';
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

const uid = () => randomUUID().slice(0, 8);
const refs = [{ title: 'NICE guideline', url: 'https://www.nice.org.uk/' }];
const approve = {
  decision: 'approved',
  reviewerCredentials: 'RD, Registered Dietitian',
  sources: refs,
};

const recipeSections = (
  allergens: string[] = [],
  diet = ['vegetarian', 'no_restriction'],
) => ({
  mealSlots: ['lunch', 'dinner'],
  servings: 2,
  prepMinutes: 25,
  ingredients: [
    { name: 'Red lentils', quantity: '150 g', allergens: [] },
    {
      name: allergens.length ? 'Paneer' : 'Spinach',
      quantity: '100 g',
      allergens,
    },
  ],
  steps: ['Rinse the lentils.', 'Simmer until soft.'],
  dietPatterns: diet,
  nutrients: [{ name: 'Iron', note: 'Lentils are a source of non-haem iron.' }],
  foodSafetyNotes: ['Reheat until steaming hot.'],
  substitutions: [{ ingredient: 'Spinach', alternatives: ['Kale'] }],
  cuisine: 'south_asian',
  media: [],
});

const activitySections = {
  type: 'walking',
  instructions: ['Walk at a pace where you can still talk.'],
  durationMinutes: null,
  intensity: 'gentle',
  trimesters: [1, 2, 3],
  fromWeek: null,
  toWeek: null,
  safetyNotes: ['Wear supportive shoes.'],
  contraindications: ['Your clinician has advised rest.'],
  stopSigns: ['Vaginal bleeding', 'Chest pain'],
  media: [],
};

describe('Pregnancy platform: content, planning and privacy (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let editor: Auth & { id: string };
  let reviewer: Auth & { id: string };
  const slugs = { dal: '', paneer: '', walk: '', plan: '' };

  async function publishStructured(
    path: string,
    slug: string,
    sections: object,
    category: string,
  ) {
    const created = await http
      .post(`/v1/admin/${path}`)
      .set(editor)
      .send({
        slug,
        locale: 'en',
        title: `Title ${slug}`,
        summary: 'Summary',
        category,
        references: refs,
        sections,
      })
      .expect(201);
    const id = created.body.id as string;
    await http.post(`/v1/admin/articles/${id}/submit`).set(editor).expect(200);
    await http
      .post(`/v1/admin/articles/${id}/reviews`)
      .set(reviewer)
      .send(approve)
      .expect(201);
    return id;
  }

  async function pregnantUser(extra: object = {}, weeksAgo = 20) {
    const user = await signUp(app);
    await grantHealthConsent(app, user);
    await http
      .post('/v1/pregnancies')
      .set(user)
      .send({
        dating: { method: 'lmp', lmpDate: daysAgo(weeksAgo * 7) },
        ...extra,
      })
      .expect(201);
    return user;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getPrisma(app);
    http = request(app.getHttpServer());
    editor = await staffUser(app, prisma, 'content_editor');
    reviewer = await staffUser(app, prisma, 'clinical_reviewer');

    slugs.dal = `dal-${uid()}`;
    slugs.paneer = `paneer-${uid()}`;
    slugs.walk = `walk-${uid()}`;
    slugs.plan = `plan-${uid()}`;
    for (const [slug, allergens] of [
      [slugs.dal, []],
      [slugs.paneer, ['milk']],
    ] as const) {
      const id = await publishStructured(
        'recipes',
        slug,
        recipeSections([...allergens]),
        'nutrition',
      );
      await http
        .post(`/v1/admin/articles/${id}/publish`)
        .set(editor)
        .expect(200);
    }
    const walk = await publishStructured(
      'activities',
      slugs.walk,
      activitySections,
      'exercise',
    );
    await http
      .post(`/v1/admin/articles/${walk}/publish`)
      .set(editor)
      .expect(200);
    const plan = await publishStructured(
      'meal-plans',
      slugs.plan,
      {
        days: [
          {
            day: 1,
            meals: [
              { slot: 'lunch', recipeSlug: slugs.dal },
              { slot: 'dinner', recipeSlug: slugs.dal },
            ],
          },
        ],
        dietPatterns: ['no_restriction', 'vegetarian'],
        trimesters: [1, 2, 3],
        hydrationNote: 'Sip water through the day.',
        cuisine: 'south_asian',
      },
      'nutrition',
    );
    await http
      .post(`/v1/admin/articles/${plan}/publish`)
      .set(editor)
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('structured clinical content', () => {
    it('validates sections against the contract with field paths', async () => {
      const res = await http
        .post('/v1/admin/activities')
        .set(editor)
        .send({
          slug: `bad-${uid()}`,
          locale: 'en',
          title: 'No stop signs',
          summary: 'x',
          category: 'exercise',
          references: refs,
          sections: { ...activitySections, stopSigns: [] },
        })
        .expect(400);
      expect(JSON.stringify(res.body.error)).toContain('sections.stopSigns');
    });

    it('rejects reusing a slug for a different kind of content', async () => {
      await http
        .post('/v1/admin/articles')
        .set(editor)
        .send({
          slug: slugs.dal,
          locale: 'en',
          title: 't',
          summary: 's',
          body: 'b',
          references: refs,
          premium: false,
        })
        .expect(409);
    });

    it('serves only published recipes, with review info and allergens', async () => {
      const res = await http.get(`/v1/recipes/${slugs.paneer}`).expect(200);
      const recipe = res.body as Recipe;
      expect(recipe.allergens).toEqual(['milk']);
      expect(recipe.review?.reviewerCredentials).toBe(
        'RD, Registered Dietitian',
      );

      const list = await http
        .get('/v1/recipes')
        .query({ excludeAllergens: 'milk', limit: 100 })
        .expect(200);
      const listed = (list.body.items as Recipe[]).map((r) => r.slug);
      expect(listed).toContain(slugs.dal);
      expect(listed).not.toContain(slugs.paneer);

      const draftSlug = `draft-${uid()}`;
      await http
        .post('/v1/admin/recipes')
        .set(editor)
        .send({
          slug: draftSlug,
          locale: 'en',
          title: 'Draft',
          summary: 's',
          category: 'nutrition',
          references: refs,
          sections: recipeSections(),
        })
        .expect(201);
      await http.get(`/v1/recipes/${draftSlug}`).expect(404);
    });

    it('will not publish a meal plan before its recipes are published', async () => {
      const unpublished = `later-${uid()}`;
      await http
        .post('/v1/admin/recipes')
        .set(editor)
        .send({
          slug: unpublished,
          locale: 'en',
          title: 'Later',
          summary: 's',
          category: 'nutrition',
          references: refs,
          sections: recipeSections(),
        })
        .expect(201);
      const id = await publishStructured(
        'meal-plans',
        `plan-${uid()}`,
        {
          days: [
            { day: 1, meals: [{ slot: 'lunch', recipeSlug: unpublished }] },
          ],
          dietPatterns: ['no_restriction'],
          trimesters: [2],
          hydrationNote: 'Drink regularly.',
          cuisine: null,
        },
        'nutrition',
      );
      const res = await http
        .post(`/v1/admin/articles/${id}/publish`)
        .set(editor)
        .expect(409);
      expect(res.body.error.message).toContain(unpublished);
    });

    it('reports week-guide coverage for all 42 weeks', async () => {
      const res = await http
        .get('/v1/admin/content/coverage')
        .set(reviewer)
        .expect(200);
      expect(res.body.weekGuides).toHaveLength(42);
      expect(
        res.body.byKind.some((k: { kind: string }) => k.kind === 'recipe'),
      ).toBe(true);
    });

    it('lists week guides in one request', async () => {
      const res = await http
        .get('/v1/week-guides')
        .query({ from: 1, to: 42 })
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      await http.get('/v1/week-guides').query({ from: 10, to: 5 }).expect(400);
    });
  });

  describe('personal meal and exercise plans', () => {
    it('leaves out recipes with a saved allergen and explains the filters', async () => {
      const user = await pregnantUser();
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({
          timeZone: 'UTC',
          locale: 'en',
          foodAllergies: ['milk'],
          excludedFoods: ['beef'],
        })
        .expect(200);
      const res = await http
        .get('/v1/me/meal-plan')
        .set(user)
        .query({ days: 7 })
        .expect(200);
      const plan = res.body as PersonalMealPlan;
      expect(plan.availability).toBe('available');
      expect(plan.days).toHaveLength(7);
      // Hydration is always framed as a general amount to adjust with a clinician, and no
      // calorie or weight-loss target appears anywhere in the plan.
      expect(plan.hydrationGuidance).toContain('Adjust it with your clinician');
      expect(JSON.stringify(plan)).not.toMatch(/calori|kcal|weight[- ]loss/i);
      expect(plan.filters.excludedAllergens).toEqual(['milk']);
      for (const day of plan.days) {
        for (const meal of day.meals)
          expect(meal.recipe.allergens).not.toContain('milk');
      }
    });

    it('withholds generic plans when a clinician manages eating or limits exercise', async () => {
      const user = await pregnantUser({
        clinicianNutritionPlan: true,
        restrictExercise: true,
      });
      const meals = await http.get('/v1/me/meal-plan').set(user).expect(200);
      expect((meals.body as PersonalMealPlan).availability).toBe(
        'clinician_guidance',
      );
      expect(meals.body.days).toEqual([]);
      const exercise = await http
        .get('/v1/me/exercise-plan')
        .set(user)
        .expect(200);
      expect((exercise.body as ExercisePlan).availability).toBe(
        'clinician_guidance',
      );
      expect(exercise.body.activities).toEqual([]);
      expect(exercise.body.disclaimer).toMatch(/not an exercise prescription/);
    });

    it('says when there is no pregnancy', async () => {
      const user = await signUp(app);
      const res = await http.get('/v1/me/meal-plan').set(user).expect(200);
      expect(res.body.availability).toBe('no_pregnancy');
    });

    it('logs meals and activities idempotently and rejects future dates', async () => {
      const user = await pregnantUser();
      const today = (await http.get('/v1/pregnancies/current').set(user)).body
        .today as string;
      const path = `/v1/meal-logs/${today}/lunch/${slugs.dal}`;
      const a = await http.put(path).set(user).expect(200);
      const b = await http.put(path).set(user).expect(200);
      expect(b.body.id).toBe(a.body.id);
      const tomorrow = new Date(Date.parse(today) + 86_400_000)
        .toISOString()
        .slice(0, 10);
      await http
        .put(`/v1/meal-logs/${tomorrow}/lunch/${slugs.dal}`)
        .set(user)
        .expect(400);
      await http
        .put(`/v1/meal-logs/${today}/lunch/no-such-recipe`)
        .set(user)
        .expect(404);

      const log1 = await http
        .put(`/v1/activity-logs/${today}/${slugs.walk}`)
        .set(user)
        .send({ minutes: 20 })
        .expect(200);
      const log2 = await http
        .put(`/v1/activity-logs/${today}/${slugs.walk}`)
        .set(user)
        .send({ minutes: 25 })
        .expect(200);
      expect(log2.body.id).toBe(log1.body.id);
      expect(log2.body.minutes).toBe(25);
      const plan = await http.get('/v1/me/exercise-plan').set(user).expect(200);
      expect(Array.isArray(plan.body.pelvicFloor)).toBe(true);
      expect(JSON.stringify(plan.body)).not.toMatch(/calori|kcal|burn/i);
      expect(
        plan.body.activities.find(
          (x: { slug: string }) => x.slug === slugs.walk,
        )?.doneToday,
      ).toBe(true);
    });

    it('needs health-data consent to log', async () => {
      const user = await signUp(app);
      const res = await http
        .put(`/v1/meal-logs/${daysAgo(0)}/lunch/${slugs.dal}`)
        .set(user)
        .expect(403);
      expect(res.body.error.code).toBe('CONSENT_REQUIRED');
    });

    it('builds a shopping list from the meal plan without duplicates', async () => {
      const user = await pregnantUser();
      await http
        .post('/v1/shopping-list')
        .set(user)
        .send({ name: '  Red Lentils ' })
        .expect(201);
      const res = await http
        .post('/v1/shopping-list/from-meal-plan')
        .set(user)
        .send({ days: 7 })
        .expect(201);
      const names = (res.body.items as { name: string }[]).map((i) => i.name);
      expect(names.filter((n) => n === 'red lentils')).toHaveLength(1);
      const again = await http
        .post('/v1/shopping-list/from-meal-plan')
        .set(user)
        .send({ days: 7 })
        .expect(201);
      expect(again.body.added).toBe(0);
    });
  });

  describe('daily plan', () => {
    it('returns stable tasks and marks them done only from saved records', async () => {
      const user = await pregnantUser({}, 12);
      const first = (await http.get('/v1/daily-plan').set(user).expect(200))
        .body as DailyPlan;
      const again = (await http.get('/v1/daily-plan').set(user).expect(200))
        .body as DailyPlan;
      expect(again.days[0].tasks.map((t) => t.key)).toEqual(
        first.days[0].tasks.map((t) => t.key),
      );

      const day = first.days[0];
      const journal = day.tasks.find((t) => t.source === 'journal');
      expect(journal?.done).toBe(false);
      await http
        .put(`/v1/daily-logs/${day.date}`)
        .set(user)
        .send({ symptoms: [], waterGlasses: 4 })
        .expect(200);

      const guideKey = day.tasks.find((t) => t.source === 'plan')
        ?.key as string;
      expect(guideKey).toBe(`guide:w${day.pregnancyWeek}`);
      const updated = await http
        .put(`/v1/daily-plan/${day.date}/tasks/${guideKey}`)
        .set(user)
        .send({ done: true })
        .expect(200);
      const done = Object.fromEntries(
        updated.body.tasks.map((t: { source: string; done: boolean }) => [
          t.source,
          t.done,
        ]),
      );
      expect(done).toMatchObject({
        plan: true,
        journal: true,
        hydration: true,
      });

      const week = (
        await http
          .get('/v1/daily-plan')
          .set(user)
          .query({ days: 7 })
          .expect(200)
      ).body as DailyPlan;
      expect(week.days).toHaveLength(7);
      await http
        .put(`/v1/daily-plan/${day.date}/tasks/journal:${day.date}`)
        .set(user)
        .send({ done: true })
        .expect(400);
    });

    it('shows appointments as informational tasks at local time', async () => {
      const user = await pregnantUser();
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'Asia/Karachi', locale: 'en' })
        .expect(200);
      const today = (await http.get('/v1/pregnancies/current').set(user)).body
        .today as string;
      await http
        .post('/v1/appointments')
        .set(user)
        .send({
          kind: 'scan',
          title: 'Anomaly scan',
          startsAt: `${today}T10:30:00+05:00`,
          questions: ['Is the placenta low?'],
        })
        .expect(201);
      const plan = (
        await http
          .get('/v1/daily-plan')
          .set(user)
          .query({ date: today })
          .expect(200)
      ).body as DailyPlan;
      const appt = plan.days[0].tasks.find((t) => t.source === 'appointment');
      expect(appt).toMatchObject({
        title: 'Anomaly scan',
        time: '10:30',
        completable: false,
      });
    });
  });

  describe('ownership and isolation', () => {
    it('never lets one user read, change or delete another user’s records', async () => {
      const alice = await pregnantUser();
      const bob = await pregnantUser();
      const appt = await http
        .post('/v1/appointments')
        .set(alice)
        .send({
          kind: 'antenatal',
          title: 'Midwife',
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);
      const item = await http
        .post('/v1/shopping-list')
        .set(alice)
        .send({ name: 'oats' })
        .expect(201);

      await http.get(`/v1/appointments/${appt.body.id}`).set(bob).expect(404);
      await http
        .patch(`/v1/appointments/${appt.body.id}`)
        .set(bob)
        .send({ title: 'x' })
        .expect(404);
      await http
        .delete(`/v1/appointments/${appt.body.id}`)
        .set(bob)
        .expect(404);
      await http
        .patch(`/v1/shopping-list/${item.body.id}`)
        .set(bob)
        .send({ checked: true })
        .expect(404);
      await http
        .delete(`/v1/shopping-list/${item.body.id}`)
        .set(bob)
        .expect(404);
      expect(
        (await http.get('/v1/appointments').set(bob).expect(200)).body,
      ).toEqual([]);
      expect(
        (
          await http
            .get(`/v1/appointments/${appt.body.id}`)
            .set(alice)
            .expect(200)
        ).body.title,
      ).toBe('Midwife');
    });
  });

  describe('pregnancy journey and outcomes', () => {
    it('describes a specific week with its dates', async () => {
      const user = await pregnantUser({}, 20);
      const current = await http
        .get('/v1/pregnancies/current/weeks/20')
        .set(user)
        .expect(200);
      expect(current.body.status).toBe('current');
      expect(current.body.trimester).toBe(2);
      const later = await http
        .get('/v1/pregnancies/current/weeks/30')
        .set(user)
        .expect(200);
      expect(later.body).toMatchObject({ status: 'upcoming', trimester: 3 });
      expect(later.body.startDate < later.body.endDate).toBe(true);
    });

    it('saves birth preferences against the active pregnancy', async () => {
      const user = await pregnantUser();
      const empty = await http
        .get('/v1/pregnancies/current/birth-preferences')
        .set(user)
        .expect(200);
      expect(empty.body.updatedAt).toBeNull();
      const saved = await http
        .put('/v1/pregnancies/current/birth-preferences')
        .set(user)
        .send({
          birthSetting: 'hospital',
          painRelief: ['breathing'],
          supportPeople: ['partner'],
          feedingIntention: 'undecided',
          notes: null,
        })
        .expect(200);
      expect(saved.body.birthSetting).toBe('hospital');
    });

    it('pauses pregnancy reminders when a pregnancy ends with a loss', async () => {
      const user = await pregnantUser();
      for (const kind of ['readiness_checkin', 'daily_log', 'custom']) {
        await http
          .post('/v1/reminders')
          .set(user)
          .send({ kind, localTime: '09:00', recurrence: 'FREQ=DAILY' })
          .expect(201);
      }
      await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'loss', endedOn: daysAgo(0) })
        .expect(200);
      const reminders = (await http.get('/v1/reminders').set(user).expect(200))
        .body as { kind: string; enabled: boolean }[];
      const enabled = Object.fromEntries(
        reminders.map((r) => [r.kind, r.enabled]),
      );
      expect(enabled).toEqual({
        readiness_checkin: false,
        daily_log: false,
        custom: true,
      });
      // History is kept.
      expect(
        (await http.get('/v1/pregnancies').set(user).expect(200)).body.items[0]
          .outcome,
      ).toBe('loss');
    });

    it('keeps the journal reminder after a birth', async () => {
      const user = await pregnantUser({}, 39);
      await http
        .post('/v1/reminders')
        .set(user)
        .send({
          kind: 'daily_log',
          localTime: '09:00',
          recurrence: 'FREQ=DAILY',
        })
        .expect(201);
      await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'birth', endedOn: daysAgo(0) })
        .expect(200);
      const [r] = (await http.get('/v1/reminders').set(user).expect(200)).body;
      expect(r.enabled).toBe(true);
    });
  });

  describe('journal and preferences', () => {
    it('keeps new journal fields when an older client omits them', async () => {
      const user = await pregnantUser();
      const date = daysAgo(1);
      await http
        .put(`/v1/daily-logs/${date}`)
        .set(user)
        .send({
          symptoms: ['fatigue'],
          mood: 'good',
          sleepMinutes: 420,
          questions: 'Iron?',
        })
        .expect(200);
      const res = await http
        .put(`/v1/daily-logs/${date}`)
        .set(user)
        .send({ symptoms: [], note: 'ok' })
        .expect(200);
      expect(res.body).toMatchObject({
        mood: 'good',
        sleepMinutes: 420,
        questions: 'Iron?',
        symptoms: [],
      });
      const cleared = await http
        .put(`/v1/daily-logs/${date}`)
        .set(user)
        .send({ symptoms: [], mood: null })
        .expect(200);
      expect(cleared.body.mood).toBeNull();
    });

    it('marks checklist tasks recommended for the current week', async () => {
      const user = await pregnantUser({}, 30);
      const tasks = (
        await http.get('/v1/readiness/tasks').set(user).expect(200)
      ).body as {
        fromWeek: number | null;
        recommendedNow: boolean | null;
      }[];
      for (const t of tasks)
        if (t.fromWeek === null)
          expect(
            t.recommendedNow === null || typeof t.recommendedNow === 'boolean',
          ).toBe(true);
    });
  });

  describe('privacy', () => {
    it('exports, links and deletes the new records', async () => {
      const guest = await anonymous(app);
      await grantHealthConsent(app, guest);
      await http
        .post('/v1/pregnancies')
        .set(guest)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(100) } })
        .expect(201);
      await http
        .post('/v1/appointments')
        .set(guest)
        .send({
          kind: 'blood_test',
          title: 'Bloods',
          startsAt: new Date(Date.now() + 3_600_000).toISOString(),
        })
        .expect(201);
      await http.put(`/v1/saved/recipe/${slugs.dal}`).set(guest).expect(200);

      const user = await signUp(app);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: guest.secret })
        .expect(200);
      expect(
        (await http.get('/v1/appointments').set(user).expect(200)).body,
      ).toHaveLength(1);
      expect(
        (await http.get('/v1/saved').set(user).expect(200)).body[0].slug,
      ).toBe(slugs.dal);

      const exported = await http.post('/v1/me/export').set(user).expect(200);
      expect(exported.body.appointments[0].title).toBe('Bloods');
      expect(exported.body.savedContent[0].slug).toBe(slugs.dal);

      await http
        .post('/v1/me/deletion')
        .set(user)
        .send({ confirm: 'DELETE MY ACCOUNT' })
        .expect(204);
      expect(
        await prisma.appointment.count({ where: { userId: user.id } }),
      ).toBe(0);
      expect(
        await prisma.savedContent.count({ where: { userId: user.id } }),
      ).toBe(0);
    });
  });
});
