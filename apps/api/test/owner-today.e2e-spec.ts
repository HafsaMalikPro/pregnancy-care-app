import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp, grantHealthConsent, signUp } from './helpers.js';

/** Calendar date in `zone`, shifted by `days`. */
function dateIn(zone: string, days = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(
    new Date(),
  );
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * "Today" for every health read and write comes from the profile time zone on the server.
 * UTC+14 and UTC−11 between them differ from the UTC date at every moment of the day, so a
 * server that used its own (UTC) date would fail at least one of these cases whenever it runs.
 */
describe.each([
  ['Pacific/Kiritimati', 'UTC+14'],
  ['Pacific/Pago_Pago', 'UTC−11'],
])("'today' in the owner's profile zone: %s (%s)", (zone) => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let user: { authorization: string };
  let today: string;
  let tomorrow: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    user = await signUp(app);
    await grantHealthConsent(app, user);
    await http
      .put('/v1/me/profile')
      .set(user)
      .send({ timeZone: zone, locale: 'en' })
      .expect(200);
    today = dateIn(zone);
    tomorrow = dateIn(zone, 1);
    await http
      .post('/v1/pregnancies')
      .set(user)
      .send({ dating: { method: 'lmp', lmpDate: dateIn(zone, -12 * 7) } })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the zone date as today on reads', async () => {
    const current = await http
      .get('/v1/pregnancies/current')
      .set(user)
      .expect(200);
    expect(current.body.today).toBe(today);
    expect(current.body.gestationalAge).toMatchObject({ weeks: 12, days: 0 });
    const plan = await http.get('/v1/daily-plan').set(user).expect(200);
    expect(plan.body.days[0].date).toBe(today);
  });

  it('accepts journal writes for the zone date and rejects the next day', async () => {
    await http
      .put(`/v1/daily-logs/${today}`)
      .set(user)
      .send({ symptoms: ['fatigue'] })
      .expect(200);
    const future = await http
      .put(`/v1/daily-logs/${tomorrow}`)
      .set(user)
      .send({ symptoms: ['fatigue'] });
    expect(future.status).toBe(400);
    expect(JSON.stringify(future.body.error.details)).toContain('future');
  });

  it('rejects future period starts and pregnancy end dates', async () => {
    const cycle = await http
      .post('/v1/cycles')
      .set(user)
      .send({ periodStart: tomorrow });
    expect(cycle.status).toBe(400);
    const end = await http
      .post('/v1/pregnancies/current/end')
      .set(user)
      .send({ outcome: 'birth', endedOn: tomorrow });
    expect(end.status).toBe(400);
  });

  it('rejects daily-plan task completion for a future date', async () => {
    const plan = await http.get('/v1/daily-plan').set(user).expect(200);
    const task = plan.body.days[0].tasks.find(
      (t: { source: string }) => t.source === 'plan',
    );
    const key: string = task?.key ?? 'guide:w12';
    await http
      .put(`/v1/daily-plan/${today}/tasks/${encodeURIComponent(key)}`)
      .set(user)
      .send({ done: true })
      .expect(200);
    const future = await http
      .put(`/v1/daily-plan/${tomorrow}/tasks/${encodeURIComponent(key)}`)
      .set(user)
      .send({ done: true });
    expect(future.status).toBe(400);
  });
});
