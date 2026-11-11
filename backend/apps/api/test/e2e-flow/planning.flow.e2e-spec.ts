import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import {
  mealPlanSections,
  pregnantUser,
  publishStructured,
  recipeSections,
  staffTeam,
} from '../fixtures.js';
import { createTestApp, getPrisma } from '../helpers.js';
import { http, todayUtc } from './flow-helpers.js';

describe('Flow: planning (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
    const team = await staffTeam(app, await getPrisma(app));
    // Content this suite's plans can draw on (other suites add more).
    const safe = await publishStructured(
      app,
      team,
      'recipes',
      recipeSections([{ name: 'Lentils' }], ['no_restriction', 'vegetarian']),
    );
    const milk = await publishStructured(
      app,
      team,
      'recipes',
      recipeSections(
        [{ name: 'Yogurt', allergens: ['milk'] }],
        ['no_restriction', 'vegetarian'],
      ),
    );
    await publishStructured(
      app,
      team,
      'meal-plans',
      mealPlanSections([safe.slug, milk.slug]),
    );
  });
  afterAll(async () => {
    await app.close();
  });

  it('filters meal plans by diet and allergies', async () => {
    const user = await pregnantUser(app, 20);
    await http(app)
      .put('/v1/me/profile')
      .set(user)
      .send({
        timeZone: 'UTC',
        locale: 'en',
        dietPattern: 'vegetarian',
        foodAllergies: ['milk'],
      })
      .expect(200);
    const plan = await http(app)
      .get('/v1/me/meal-plan')
      .query({ date: todayUtc(), days: 1 })
      .set(user)
      .expect(200);
    expect(plan.body.filters).toMatchObject({
      dietPattern: 'vegetarian',
      excludedAllergens: ['milk'],
    });
    for (const day of plan.body.days) {
      for (const meal of day.meals) {
        const allergens = meal.recipe.sections.ingredients.flatMap(
          (i: { allergens: string[] }) => i.allergens,
        );
        expect(allergens).not.toContain('milk');
        expect(meal.recipe.sections.dietPatterns).toContain('vegetarian');
      }
    }
  });

  it('offers no exercise plan when the clinician restricted exercise', async () => {
    const user = await pregnantUser(app, 20, { restrictExercise: true });
    const plan = await http(app)
      .get('/v1/me/exercise-plan')
      .query({ date: todayUtc() })
      .set(user)
      .expect(200);
    expect(plan.body).toMatchObject({
      availability: 'clinician_guidance',
      activities: [],
    });
  });

  it('shopping list add, check, clear; daily plan read-only; appointments and reminders CRUD', async () => {
    const user = await pregnantUser(app, 20);
    const item = await http(app)
      .post('/v1/shopping-list')
      .set(user)
      .send({ name: 'Spinach', quantity: '1 bag' })
      .expect(201);
    const checked = await http(app)
      .patch(`/v1/shopping-list/${item.body.id}`)
      .set(user)
      .send({ checked: true })
      .expect(200);
    expect(checked.body.checked).toBe(true);
    await http(app).delete('/v1/shopping-list').set(user).expect(204);
    expect(
      (await http(app).get('/v1/shopping-list').set(user).expect(200)).body
        .items ?? [],
    ).toHaveLength(0);

    const plan = await http(app).get('/v1/daily-plan').set(user).expect(200);
    expect(plan.body.days[0]).toMatchObject({
      date: expect.any(String),
      tasks: expect.any(Array),
    });
    await http(app).post('/v1/daily-plan').set(user).send({}).expect(404);

    const startsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const appt = await http(app)
      .post('/v1/appointments')
      .set(user)
      .send({ kind: 'scan', title: 'Anomaly scan', startsAt })
      .expect(201);
    await http(app)
      .patch(`/v1/appointments/${appt.body.id}`)
      .set(user)
      .send({ location: 'Clinic B' })
      .expect(200);
    expect(
      (
        await http(app)
          .get(`/v1/appointments/${appt.body.id}`)
          .set(user)
          .expect(200)
      ).body.location,
    ).toBe('Clinic B');
    await http(app)
      .delete(`/v1/appointments/${appt.body.id}`)
      .set(user)
      .expect(204);
    await http(app)
      .get(`/v1/appointments/${appt.body.id}`)
      .set(user)
      .expect(404);

    const rem = await http(app)
      .post('/v1/reminders')
      .set(user)
      .send({ kind: 'daily_log', localTime: '21:00', recurrence: 'FREQ=DAILY' })
      .expect(201);
    await http(app)
      .patch(`/v1/reminders/${rem.body.id}`)
      .set(user)
      .send({ enabled: false })
      .expect(200);
    await http(app)
      .delete(`/v1/reminders/${rem.body.id}`)
      .set(user)
      .expect(204);
  });

  it('negative: bad bodies 400, missing ids 404, no auth 401', async () => {
    const user = await pregnantUser(app, 20);
    await http(app).post('/v1/shopping-list').set(user).send({}).expect(400);
    await http(app)
      .post('/v1/reminders')
      .set(user)
      .send({ kind: 'daily_log', localTime: '25:00', recurrence: 'FREQ=DAILY' })
      .expect(400);
    await http(app)
      .patch('/v1/appointments/00000000-0000-7000-8000-000000000000')
      .set(user)
      .send({ title: 'x' })
      .expect(404);
    await http(app).get('/v1/me/meal-plan').expect(401);
  });
});
