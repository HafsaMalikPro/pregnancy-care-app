import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { createTestApp, grantHealthConsent, signUp } from '../helpers.js';
import { http, shift, todayUtc } from './flow-helpers.js';

/**
 * Due dates checked against arithmetic done here, not the API's dating code. Weeks are
 * completed weeks (dating.ts): week N runs from N·7 to N·7+6 days after the LMP.
 */
describe('Flow: pregnancy and dating (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  async function consenting() {
    const user = await signUp(app);
    await grantHealthConsent(app, user);
    return user;
  }

  it.each([
    [
      'LMP',
      () => {
        const lmpDate = shift(todayUtc(), -84);
        return { dating: { method: 'lmp', lmpDate }, due: shift(lmpDate, 280) };
      },
    ],
    [
      'ultrasound (12w3d)',
      () => {
        const scanDate = shift(todayUtc(), -10);
        return {
          dating: {
            method: 'ultrasound',
            scanDate,
            gestationalWeeks: 12,
            gestationalDays: 3,
          },
          due: shift(scanDate, 280 - 87),
        };
      },
    ],
    [
      'IVF (day-5 transfer)',
      () => {
        const transferDate = shift(todayUtc(), -30);
        return {
          dating: { method: 'ivf', transferDate, embryoAgeDays: 5 },
          due: shift(transferDate, 280 - 14 - 5),
        };
      },
    ],
  ])('dates by %s', async (_, make) => {
    const user = await consenting();
    const { dating, due } = make();
    const res = await http(app)
      .post('/v1/pregnancies')
      .set(user)
      .send({ dating })
      .expect(201);
    expect(res.body.dueDate).toBe(due);
    const current = await http(app)
      .get('/v1/pregnancies/current')
      .set(user)
      .expect(200);
    expect(current.body).toMatchObject({
      dueDate: due,
      trimester: expect.any(Number),
      termStatus: expect.any(String),
    });
  });

  it('re-dates, shows the timeline and a week, then ends the pregnancy', async () => {
    const user = await consenting();
    const lmpDate = shift(todayUtc(), -100);
    await http(app)
      .post('/v1/pregnancies')
      .set(user)
      .send({ dating: { method: 'lmp', lmpDate } })
      .expect(201);
    const newLmp = shift(lmpDate, 7);
    await http(app)
      .put('/v1/pregnancies/current/dating')
      .set(user)
      .send({ dating: { method: 'lmp', lmpDate: newLmp }, source: 'clinician' })
      .expect(200);
    const redated = await http(app)
      .get('/v1/pregnancies/current')
      .set(user)
      .expect(200);
    expect(redated.body.dueDate).toBe(shift(newLmp, 280));
    const history = await http(app)
      .get('/v1/pregnancies/current/dating-history')
      .set(user)
      .expect(200);
    expect(history.body.length).toBeGreaterThanOrEqual(2);

    const timeline = await http(app)
      .get('/v1/pregnancies/current/timeline')
      .set(user)
      .expect(200);
    expect(timeline.body.milestones.length).toBeGreaterThan(0);
    const week = await http(app)
      .get('/v1/pregnancies/current/weeks/14')
      .set(user)
      .expect(200);
    expect(week.body).toMatchObject({
      week: 14,
      trimester: 2,
      startDate: shift(newLmp, 14 * 7),
      endDate: shift(newLmp, 14 * 7 + 6),
    });

    await http(app)
      .post('/v1/pregnancies/current/end')
      .set(user)
      .send({ outcome: 'birth', endedOn: shift(todayUtc(), -1) })
      .expect(200);
    await http(app).get('/v1/pregnancies/current').set(user).expect(404);
  });

  it('negative: no pregnancy 404, second active 409, future LMP 400, no auth 401, week 43 400', async () => {
    const user = await consenting();
    await http(app).get('/v1/pregnancies/current').set(user).expect(404);
    await http(app)
      .post('/v1/pregnancies')
      .set(user)
      .send({ dating: { method: 'lmp', lmpDate: shift(todayUtc(), 3) } })
      .expect(400);
    await http(app)
      .post('/v1/pregnancies')
      .set(user)
      .send({ dating: { method: 'lmp', lmpDate: shift(todayUtc(), -60) } })
      .expect(201);
    await http(app)
      .post('/v1/pregnancies')
      .set(user)
      .send({ dating: { method: 'lmp', lmpDate: shift(todayUtc(), -61) } })
      .expect(409);
    await http(app)
      .get('/v1/pregnancies/current/weeks/43')
      .set(user)
      .expect(400);
    await http(app).get('/v1/pregnancies/current').expect(401);
  });
});
