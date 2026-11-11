import type { INestApplication } from '@nestjs/common';
import {
  ActivityLog,
  Appointment,
  ExercisePlan,
  MealLog,
  PersonalMealPlan,
  SavedItem,
  ShoppingItem,
} from '@preconception/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  activitySections,
  daysFromNow,
  mealPlanSections,
  pregnantUser,
  publishStructured,
  recipeSections,
  staffTeam,
  type Team,
  uid,
} from './fixtures.js';
import {
  anonymous,
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  signUp,
} from './helpers.js';

describe('Planning: nutrition, exercise, appointments, saved (integration)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let team: Team;
  let midPregnancyWalk: string;
  let eggRecipe: string;
  let berryRecipe: string;
  let eggPlan: string;
  let berryPlan: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getPrisma(app);
    http = request(app.getHttpServer());
    team = await staffTeam(app, prisma);
    // Reviewed for weeks 14-27 only.
    midPregnancyWalk = (
      await publishStructured(
        app,
        team,
        'activities',
        activitySections({ trimesters: [2], fromWeek: 14, toWeek: 27 }),
      )
    ).slug;
    eggRecipe = (
      await publishStructured(
        app,
        team,
        'recipes',
        recipeSections([{ name: '1 egg, boiled' }]),
      )
    ).slug;
    berryRecipe = (
      await publishStructured(
        app,
        team,
        'recipes',
        recipeSections([{ name: 'Mixed berries' }, { name: 'Oats' }]),
      )
    ).slug;
    eggPlan = (
      await publishStructured(
        app,
        team,
        'meal-plans',
        mealPlanSections([eggRecipe]),
      )
    ).slug;
    berryPlan = (
      await publishStructured(
        app,
        team,
        'meal-plans',
        mealPlanSections([berryRecipe]),
      )
    ).slug;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('exercise plan matches the week of the requested date (regression)', () => {
    it('offers a week 14-27 activity in week 20 but not for a date in week 30', async () => {
      const user = await pregnantUser(app, 20);
      const today = ExercisePlan.parse(
        (await http.get('/v1/me/exercise-plan').set(user).expect(200)).body,
      );
      expect(today.week).toBe(20);
      expect(today.activities.map((a) => a.slug)).toContain(midPregnancyWalk);

      // Bug: the plan used to be filtered by today's week whatever date was asked for.
      const later = ExercisePlan.parse(
        (
          await http
            .get('/v1/me/exercise-plan')
            .query({ date: daysFromNow(10 * 7) })
            .set(user)
            .expect(200)
        ).body,
      );
      expect(later.week).toBe(30);
      expect(later.activities.map((a) => a.slug)).not.toContain(
        midPregnancyWalk,
      );
      expect(later.disclaimer).toMatch(/not an exercise prescription/);
    });

    it("only offers each day activities reviewed for that day's own week", async () => {
      // A short-lived activity reviewed for week 27 only, so a week-27 plan certainly has an
      // activity that must disappear on the days that fall in week 28.
      const week27 = (
        await publishStructured(
          app,
          team,
          'activities',
          activitySections({ trimesters: [2, 3], fromWeek: 27, toWeek: 27 }),
          `aaa-w27-${uid()}`,
          // Sorts first, so it is among the two activities a daily plan shows.
          `000 Week 27 walk ${uid()}`,
        )
      ).slug;
      const user = await pregnantUser(app, 27);
      const res = await http
        .get('/v1/daily-plan')
        .query({ date: daysFromNow(1), days: 7 })
        .set(user)
        .expect(200);
      const weeks = new Set<number>(
        res.body.days.map((d: { pregnancyWeek: number }) => d.pregnancyWeek),
      );
      expect([...weeks].sort((a, b) => a - b)).toEqual([27, 28]);
      const fits = new Map<
        string,
        { fromWeek: number | null; toWeek: number | null }
      >();
      for (const day of res.body.days) {
        for (const task of day.tasks.filter(
          (t: { source: string }) => t.source === 'activity',
        )) {
          const slug = (task.key as string).split(':')[2];
          if (!fits.has(slug)) {
            fits.set(
              slug,
              (await http.get(`/v1/activities/${slug}`).expect(200)).body
                .sections,
            );
          }
          const { fromWeek, toWeek } = fits.get(slug)!;
          expect(fromWeek === null || day.pregnancyWeek >= fromWeek).toBe(true);
          expect(toWeek === null || day.pregnancyWeek <= toWeek).toBe(true);
        }
      }
      const exercise27 = await http
        .get('/v1/me/exercise-plan')
        .query({ date: daysFromNow(1) })
        .set(user)
        .expect(200);
      expect(
        exercise27.body.activities.map((a: { slug: string }) => a.slug),
      ).toContain(week27);
    });

    it('withholds activities when a clinician restricted exercise, for any date', async () => {
      const user = await pregnantUser(app, 20, { restrictExercise: true });
      const res = await http
        .get('/v1/me/exercise-plan')
        .query({ date: daysFromNow(14) })
        .set(user)
        .expect(200);
      expect(res.body).toMatchObject({
        availability: 'clinician_guidance',
        activities: [],
      });
    });
  });

  describe('meal plan safety filters (regression)', () => {
    async function planFor(profile: object) {
      const user = await pregnantUser(app, 20);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'UTC', locale: 'en', ...profile })
        .expect(200);
      const plan = PersonalMealPlan.parse(
        (
          await http
            .get('/v1/me/meal-plan')
            .query({ days: 7 })
            .set(user)
            .expect(200)
        ).body,
      );
      const ingredients = plan.days.flatMap((d) =>
        d.meals.flatMap((m) =>
          m.recipe.sections.ingredients.map((i) => i.name.toLowerCase()),
        ),
      );
      return { plan, ingredients };
    }

    it('excluding "eggs" (plural) removes a recipe with "1 egg"', async () => {
      const { plan, ingredients } = await planFor({ excludedFoods: ['eggs'] });
      expect(plan.planSlug).not.toBe(eggPlan);
      expect(ingredients.filter((n) => /\begg\b/.test(n))).toEqual([]);
      expect(plan.filters.excludedFoods).toContain('eggs');
    });

    it('an intolerance to "berry" removes a recipe with "mixed berries"', async () => {
      const { plan, ingredients } = await planFor({
        foodIntolerances: ['berry'],
      });
      expect(plan.planSlug).not.toBe(berryPlan);
      expect(ingredients.filter((n) => n.includes('berr'))).toEqual([]);
    });

    it('a clinician food restriction applies the same way', async () => {
      const user = await pregnantUser(app, 20, { foodRestrictions: ['Eggs'] });
      const plan = PersonalMealPlan.parse(
        (await http.get('/v1/me/meal-plan').set(user).expect(200)).body,
      );
      expect(plan.planSlug).not.toBe(eggPlan);
    });

    it('validates the query', async () => {
      const user = await pregnantUser(app, 20);
      await http
        .get('/v1/me/meal-plan')
        .query({ days: 8 })
        .set(user)
        .expect(400);
      await http
        .get('/v1/me/meal-plan')
        .query({ date: '2026-02-30' })
        .set(user)
        .expect(400);
      await http
        .get('/v1/me/meal-plan')
        .query({ locale: 'xx' })
        .set(user)
        .expect(400);
    });
  });

  describe('meal and activity logs', () => {
    it('lists, filters by range, and unlogs meals; 404 when nothing to unlog', async () => {
      const user = await pregnantUser(app, 20);
      const path = `/v1/meal-logs/${daysAgo(1)}/lunch/${eggRecipe}`;
      const first = MealLog.parse(
        (await http.put(path).set(user).expect(200)).body,
      );
      const again = MealLog.parse(
        (await http.put(path).set(user).expect(200)).body,
      );
      expect(again.id).toBe(first.id);
      const list = await http
        .get('/v1/meal-logs')
        .query({ from: daysAgo(3), to: daysAgo(0) })
        .set(user)
        .expect(200);
      expect(list.body).toHaveLength(1);
      await http.delete(path).set(user).expect(204);
      await http.delete(path).set(user).expect(404);
    });

    it('rejects unpublished recipes, bad slots, bad ranges and missing consent', async () => {
      const user = await pregnantUser(app, 20);
      await http
        .put(`/v1/meal-logs/${daysAgo(0)}/lunch/no-such-${uid()}`)
        .set(user)
        .expect(404);
      await http
        .put(`/v1/meal-logs/${daysAgo(0)}/brunch/${eggRecipe}`)
        .set(user)
        .expect(400);
      await http
        .get('/v1/meal-logs')
        .query({ from: daysAgo(0), to: daysAgo(1) })
        .set(user)
        .expect(400);
      await http
        .get('/v1/meal-logs')
        .query({ from: daysAgo(100), to: daysAgo(0) })
        .set(user)
        .expect(400);
      const noConsent = await signUp(app);
      const res = await http
        .put(`/v1/meal-logs/${daysAgo(0)}/lunch/${eggRecipe}`)
        .set(noConsent)
        .expect(403);
      expect(res.body.error.code).toBe('CONSENT_REQUIRED');
    });

    it('records activity minutes, updates them idempotently, lists and unlogs', async () => {
      const user = await pregnantUser(app, 20);
      const path = `/v1/activity-logs/${daysAgo(0)}/${midPregnancyWalk}`;
      const a = ActivityLog.parse(
        (await http.put(path).set(user).send({ minutes: 20 }).expect(200)).body,
      );
      const b = ActivityLog.parse(
        (await http.put(path).set(user).send({ minutes: 35 }).expect(200)).body,
      );
      expect(b.id).toBe(a.id);
      expect(b.minutes).toBe(35);
      const plan = ExercisePlan.parse(
        (await http.get('/v1/me/exercise-plan').set(user).expect(200)).body,
      );
      expect(
        plan.activities.find((x) => x.slug === midPregnancyWalk)?.doneToday,
      ).toBe(true);
      const list = await http
        .get('/v1/activity-logs')
        .query({ from: daysAgo(0), to: daysAgo(0) })
        .set(user)
        .expect(200);
      expect(list.body).toHaveLength(1);
      await http.put(path).set(user).send({ minutes: 601 }).expect(400);
      await http.put(path).set(user).send({ minutes: 0 }).expect(400);
      await http
        .put(`/v1/activity-logs/${daysFromNow(1)}/${midPregnancyWalk}`)
        .set(user)
        .send({})
        .expect(400);
      await http
        .put(`/v1/activity-logs/${daysAgo(0)}/unknown-${uid()}`)
        .set(user)
        .send({})
        .expect(404);
      await http.delete(path).set(user).expect(204);
      await http.delete(path).set(user).expect(404);
    });

    it('stores one row when the same meal is logged concurrently', async () => {
      const user = await pregnantUser(app, 20);
      const path = `/v1/meal-logs/${daysAgo(0)}/dinner/${berryRecipe}`;
      const results = await Promise.all(
        Array.from({ length: 5 }, () => http.put(path).set(user)),
      );
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.mealLog.count({ where: { userId: user.id } })).toBe(
        1,
      );
    });
  });

  describe('appointments', () => {
    const at = (days: number, time = '10:30:00Z') =>
      `${daysFromNow(days)}T${time}`;

    it('creates, reads, updates, lists upcoming and deletes, linked to the pregnancy', async () => {
      const user = await pregnantUser(app, 20);
      const created = Appointment.parse(
        (
          await http
            .post('/v1/appointments')
            .set(user)
            .send({
              kind: 'scan',
              title: '  Anomaly scan  ',
              startsAt: at(3),
              location: 'Clinic',
              questions: ['Placenta position?'],
            })
            .expect(201)
        ).body,
      );
      expect(created.title).toBe('Anomaly scan');
      expect(created.pregnancyId).toBe(user.pregnancyId);

      const got = await http
        .get(`/v1/appointments/${created.id}`)
        .set(user)
        .expect(200);
      expect(got.body.questions).toEqual(['Placenta position?']);
      const updated = await http
        .patch(`/v1/appointments/${created.id}`)
        .set(user)
        .send({ title: 'Scan', notes: 'Bring notes' })
        .expect(200);
      expect(updated.body).toMatchObject({
        title: 'Scan',
        notes: 'Bring notes',
        location: 'Clinic',
      });

      await http
        .post('/v1/appointments')
        .set(user)
        .send({ kind: 'blood_test', title: 'Past', startsAt: at(-3) })
        .expect(201);
      const upcoming = await http.get('/v1/appointments').set(user).expect(200);
      expect(upcoming.body.map((a: Appointment) => a.id)).toEqual([created.id]);
      const ranged = await http
        .get('/v1/appointments')
        .query({ from: at(-10), to: at(10) })
        .set(user)
        .expect(200);
      expect(ranged.body).toHaveLength(2);
      expect(ranged.body[0].title).toBe('Past');

      await http.delete(`/v1/appointments/${created.id}`).set(user).expect(204);
      await http.get(`/v1/appointments/${created.id}`).set(user).expect(404);
      await http.delete(`/v1/appointments/${created.id}`).set(user).expect(404);
    });

    it('validates input and ranges', async () => {
      const user = await pregnantUser(app, 20);
      const bad = [
        { kind: 'dentist', title: 'x', startsAt: at(1) },
        { kind: 'scan', title: '', startsAt: at(1) },
        { kind: 'scan', title: 'x', startsAt: '2026-13-01T10:00:00Z' },
        { kind: 'scan', title: 'x', startsAt: `${daysFromNow(1)}T10:00:00` },
        { kind: 'scan', title: 'x', startsAt: at(1), userId: user.id },
      ];
      for (const body of bad) {
        await http.post('/v1/appointments').set(user).send(body).expect(400);
      }
      await http
        .get('/v1/appointments')
        .query({ from: at(5), to: at(1) })
        .set(user)
        .expect(400);
      await http
        .get('/v1/appointments')
        .query({ from: at(0), to: at(400) })
        .set(user)
        .expect(400);
      await http.get('/v1/appointments/not-a-uuid').set(user).expect(400);
    });

    it('needs consent to create or change, but not to delete', async () => {
      const user = await signUp(app);
      const res = await http
        .post('/v1/appointments')
        .set(user)
        .send({ kind: 'scan', title: 'x', startsAt: at(1) })
        .expect(403);
      expect(res.body.error.code).toBe('CONSENT_REQUIRED');
      await grantHealthConsent(app, user);
      const created = await http
        .post('/v1/appointments')
        .set(user)
        .send({ kind: 'scan', title: 'x', startsAt: at(1) })
        .expect(201);
      expect(created.body.pregnancyId).toBeNull();
      await grantHealthConsent(app, user, false);
      await http
        .patch(`/v1/appointments/${created.body.id}`)
        .set(user)
        .send({ title: 'y' })
        .expect(403);
      await http
        .delete(`/v1/appointments/${created.body.id}`)
        .set(user)
        .expect(204);
    });

    it('caps appointments at 200 per owner', async () => {
      const user = await pregnantUser(app, 20);
      await prisma.appointment.createMany({
        data: Array.from({ length: 200 }, (_, i) => ({
          userId: user.id,
          kind: 'other' as const,
          title: `a${i}`,
          startsAt: new Date(Date.now() + 86_400_000),
        })),
      });
      await http
        .post('/v1/appointments')
        .set(user)
        .send({ kind: 'scan', title: 'one too many', startsAt: at(1) })
        .expect(400);
    });
  });

  describe('shopping list', () => {
    it('adds, merges by name, checks, clears checked and removes', async () => {
      const user = await signUp(app);
      const milk = ShoppingItem.parse(
        (
          await http
            .post('/v1/shopping-list')
            .set(user)
            .send({ name: '  Milk ', quantity: '1 l' })
            .expect(201)
        ).body,
      );
      expect(milk.name).toBe('milk');
      const again = await http
        .post('/v1/shopping-list')
        .set(user)
        .send({ name: 'MILK' })
        .expect(201);
      expect(again.body.id).toBe(milk.id);
      const bread = await http
        .post('/v1/shopping-list')
        .set(user)
        .send({ name: 'bread' })
        .expect(201);

      const checked = await http
        .patch(`/v1/shopping-list/${milk.id}`)
        .set(user)
        .send({ checked: true, quantity: '2 l' })
        .expect(200);
      expect(checked.body).toMatchObject({ checked: true, quantity: '2 l' });
      const list = await http.get('/v1/shopping-list').set(user).expect(200);
      expect(list.body.map((i: ShoppingItem) => i.name)).toEqual([
        'bread',
        'milk',
      ]);

      await http.delete('/v1/shopping-list').set(user).expect(204);
      const after = await http.get('/v1/shopping-list').set(user).expect(200);
      expect(after.body.map((i: ShoppingItem) => i.id)).toEqual([
        bread.body.id,
      ]);
      await http
        .delete(`/v1/shopping-list/${bread.body.id}`)
        .set(user)
        .expect(204);
      await http
        .delete(`/v1/shopping-list/${bread.body.id}`)
        .set(user)
        .expect(404);
    });

    it('rejects blank and oversized names and caps the list at 300', async () => {
      const user = await signUp(app);
      await http
        .post('/v1/shopping-list')
        .set(user)
        .send({ name: '   ' })
        .expect(400);
      await http
        .post('/v1/shopping-list')
        .set(user)
        .send({ name: 'x'.repeat(101) })
        .expect(400);
      await http.post('/v1/shopping-list').set(user).send({}).expect(400);
      await prisma.shoppingItem.createMany({
        data: Array.from({ length: 300 }, (_, i) => ({
          userId: user.id,
          name: `item ${i}`,
        })),
      });
      await http
        .post('/v1/shopping-list')
        .set(user)
        .send({ name: 'one more' })
        .expect(400);
    });
  });

  describe('saved content', () => {
    it('saves published items idempotently, filters by kind and removes', async () => {
      const user = await anonymous(app);
      const a = SavedItem.parse(
        (await http.put(`/v1/saved/recipe/${eggRecipe}`).set(user).expect(200))
          .body,
      );
      const b = await http
        .put(`/v1/saved/recipe/${eggRecipe}`)
        .set(user)
        .expect(200);
      expect(b.body.savedAt).toBe(a.savedAt);
      await http
        .put(`/v1/saved/activity/${midPregnancyWalk}`)
        .set(user)
        .expect(200);
      const recipes = await http
        .get('/v1/saved')
        .query({ kind: 'recipe' })
        .set(user)
        .expect(200);
      expect(recipes.body).toEqual([a]);
      const all = await http.get('/v1/saved').set(user).expect(200);
      expect(all.body).toHaveLength(2);
      await http.delete(`/v1/saved/recipe/${eggRecipe}`).set(user).expect(204);
      await http.delete(`/v1/saved/recipe/${eggRecipe}`).set(user).expect(404);
    });

    it('404s for unpublished or wrong-kind items and 400s for a bad kind', async () => {
      const user = await signUp(app);
      await http.put(`/v1/saved/activity/${eggRecipe}`).set(user).expect(404);
      await http.put(`/v1/saved/recipe/missing-${uid()}`).set(user).expect(404);
      await http.put(`/v1/saved/podcast/${eggRecipe}`).set(user).expect(400);
      await http.put('/v1/saved/recipe/Not_A_Slug').set(user).expect(400);
    });

    it('caps saved items at 500', async () => {
      const user = await signUp(app);
      await prisma.savedContent.createMany({
        data: Array.from({ length: 500 }, (_, i) => ({
          userId: user.id,
          kind: 'article' as const,
          slug: `s-${i}`,
        })),
      });
      await http.put(`/v1/saved/recipe/${eggRecipe}`).set(user).expect(400);
    });
  });

  describe('daily plan', () => {
    it('works without a pregnancy, in the profile time zone, with reminders', async () => {
      const user = await signUp(app);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'Asia/Karachi', locale: 'en' })
        .expect(200);
      await http
        .post('/v1/reminders')
        .set(user)
        .send({
          kind: 'daily_log',
          localTime: '08:30',
          recurrence: 'FREQ=DAILY',
        })
        .expect(201);
      const res = await http
        .get('/v1/daily-plan')
        .query({ days: 2 })
        .set(user)
        .expect(200);
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Karachi',
      }).format(new Date());
      expect(res.body.days[0].date).toBe(today);
      for (const day of res.body.days) {
        expect(day.pregnancyWeek).toBeNull();
        const sources = day.tasks.map((t: { source: string }) => t.source);
        expect(sources).not.toContain('meal');
        expect(sources).not.toContain('activity');
        expect(sources).not.toContain('plan');
        const reminder = day.tasks.find(
          (t: { source: string }) => t.source === 'reminder',
        );
        expect(reminder).toMatchObject({
          title: 'Daily check-in',
          done: false,
        });
      }
    });

    it('marks and clears the week-guide task, and validates the request', async () => {
      const user = await pregnantUser(app, 12);
      const date = daysAgo(0);
      const done = await http
        .put(`/v1/daily-plan/${date}/tasks/guide:w12`)
        .set(user)
        .send({ done: true })
        .expect(200);
      expect(
        done.body.tasks.find((t: { key: string }) => t.key === 'guide:w12')
          ?.done,
      ).toBe(true);
      // Repeating is harmless and stores one completion.
      await http
        .put(`/v1/daily-plan/${date}/tasks/guide:w12`)
        .set(user)
        .send({ done: true })
        .expect(200);
      expect(
        await prisma.planTaskCompletion.count({ where: { userId: user.id } }),
      ).toBe(1);
      const cleared = await http
        .put(`/v1/daily-plan/${date}/tasks/guide:w12`)
        .set(user)
        .send({ done: false })
        .expect(200);
      expect(
        cleared.body.tasks.find((t: { key: string }) => t.key === 'guide:w12')
          ?.done,
      ).toBe(false);

      for (const key of ['guide:w0', 'guide:w43', 'journal:x', 'guide:w1x']) {
        await http
          .put(`/v1/daily-plan/${date}/tasks/${key}`)
          .set(user)
          .send({ done: true })
          .expect(400);
      }
      await http
        .put(`/v1/daily-plan/${date}/tasks/guide:w12`)
        .set(user)
        .send({})
        .expect(400);
      await http.get('/v1/daily-plan').query({ days: 0 }).set(user).expect(400);

      const noPregnancy = await signUp(app);
      await grantHealthConsent(app, noPregnancy);
      await http
        .put(`/v1/daily-plan/${date}/tasks/guide:w12`)
        .set(noPregnancy)
        .send({ done: true })
        .expect(404);
      const noConsent = await signUp(app);
      await http
        .put(`/v1/daily-plan/${date}/tasks/guide:w12`)
        .set(noConsent)
        .send({ done: true })
        .expect(403);
    });

    it('marks journal and meal tasks done only from saved records', async () => {
      const user = await pregnantUser(app, 20);
      const date = daysAgo(0);
      const before = await http.get('/v1/daily-plan').set(user).expect(200);
      const journal = before.body.days[0].tasks.find(
        (t: { source: string }) => t.source === 'journal',
      );
      expect(journal.done).toBe(false);
      await http
        .put(`/v1/daily-logs/${date}`)
        .set(user)
        .send({ symptoms: [], waterGlasses: 6 })
        .expect(200);
      const after = await http.get('/v1/daily-plan').set(user).expect(200);
      const tasks = after.body.days[0].tasks;
      expect(
        tasks.find((t: { source: string }) => t.source === 'journal').done,
      ).toBe(true);
      expect(
        tasks.find((t: { source: string }) => t.source === 'hydration'),
      ).toBeDefined();
    });
  });

  describe('public catalog', () => {
    it('lists, filters and pages recipes, and hides drafts', async () => {
      const draft = await http
        .post('/v1/admin/recipes')
        .set(team.editor)
        .send({
          slug: `draft-${uid()}`,
          locale: 'en',
          title: 'Draft',
          summary: 's',
          category: 'nutrition',
          references: [],
          sections: recipeSections([{ name: 'Milk', allergens: ['milk'] }]),
        })
        .expect(201);
      const page = await http
        .get('/v1/recipes')
        .query({ limit: 100 })
        .expect(200);
      const slugs = page.body.items.map((r: { slug: string }) => r.slug);
      expect(slugs).toContain(eggRecipe);
      expect(slugs).not.toContain(draft.body.slug);
      await http.get(`/v1/recipes/${draft.body.slug}`).expect(404);

      const one = await http
        .get('/v1/recipes')
        .query({ limit: 1, offset: 0 })
        .expect(200);
      expect(one.body.items).toHaveLength(1);
      expect(one.body.page).toMatchObject({ limit: 1, offset: 0 });
      expect(one.body.page.total).toBeGreaterThanOrEqual(2);

      const noEgg = await http
        .get('/v1/recipes')
        .query({
          excludeAllergens: 'egg,milk',
          diet: 'vegetarian',
          slot: 'lunch',
          limit: 100,
        })
        .expect(200);
      for (const r of noEgg.body.items) {
        expect(r.allergens).not.toContain('milk');
        expect(r.sections.dietPatterns).toContain('vegetarian');
      }
      await http
        .get('/v1/recipes')
        .query({ excludeAllergens: 'gluten-ish' })
        .expect(400);
      await http.get('/v1/recipes').query({ limit: 101 }).expect(400);
      await http.get('/v1/recipes/Bad_Slug').expect(404);
    });

    it('filters activities by week, trimester and type', async () => {
      const inRange = await http
        .get('/v1/activities')
        .query({ week: 20, trimester: 2, type: 'walking', limit: 100 })
        .expect(200);
      expect(inRange.body.items.map((a: { slug: string }) => a.slug)).toContain(
        midPregnancyWalk,
      );
      const outOfRange = await http
        .get('/v1/activities')
        .query({ week: 30, limit: 100 })
        .expect(200);
      expect(
        outOfRange.body.items.map((a: { slug: string }) => a.slug),
      ).not.toContain(midPregnancyWalk);
      const one = await http
        .get(`/v1/activities/${midPregnancyWalk}`)
        .expect(200);
      expect(one.body.sections.stopSigns.length).toBeGreaterThan(0);
      expect(one.body.review).toMatchObject({
        reviewerCredentials: 'RM, Registered Midwife',
      });
      await http.get('/v1/activities').query({ week: 43 }).expect(400);
      await http.get(`/v1/activities/missing-${uid()}`).expect(404);
    });

    it('serves meal plans with their recipes and filters by trimester and diet', async () => {
      const plan = await http.get(`/v1/meal-plans/${eggPlan}`).expect(200);
      expect(plan.body.slug).toBe(eggPlan);
      const list = await http
        .get('/v1/meal-plans')
        .query({ trimester: 2, diet: 'vegetarian', limit: 100 })
        .expect(200);
      expect(list.body.items.map((p: { slug: string }) => p.slug)).toContain(
        eggPlan,
      );
      const vegan = await http
        .get('/v1/meal-plans')
        .query({ diet: 'vegan', limit: 100 })
        .expect(200);
      expect(
        vegan.body.items.map((p: { slug: string }) => p.slug),
      ).not.toContain(eggPlan);
      await http.get(`/v1/meal-plans/missing-${uid()}`).expect(404);
    });
  });
});
