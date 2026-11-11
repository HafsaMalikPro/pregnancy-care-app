import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import {
  anonymous,
  createTestApp,
  grantHealthConsent,
  signUp,
} from '../helpers.js';
import { http, shift, todayUtc } from './flow-helpers.js';

describe('Flow: guest to account linking (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('moves guest data into a new account and retires the guest secret', async () => {
    const guest = await anonymous(app);
    await grantHealthConsent(app, guest);
    const day = shift(todayUtc(), -2);
    await http(app)
      .put(`/v1/daily-logs/${day}`)
      .set(guest)
      .send({ symptoms: ['fatigue'], note: 'from guest' })
      .expect(200);

    const user = await signUp(app);
    const linked = await http(app)
      .post('/v1/anonymous-sessions/link')
      .set(user)
      .send({ secret: guest.secret })
      .expect(200);
    expect(linked.body.dailyLogs).toBeGreaterThanOrEqual(1);
    const log = await http(app)
      .get(`/v1/daily-logs/${day}`)
      .set(user)
      .expect(200);
    expect(log.body).toMatchObject({
      symptoms: ['fatigue'],
      note: 'from guest',
    });
    await http(app).get('/v1/me').set(guest).expect(401);
  });

  it('negative: an account with health data gets 409 ACCOUNT_HAS_HEALTH_DATA and nothing moves; bad secret 400/404', async () => {
    const user = await signUp(app);
    await grantHealthConsent(app, user);
    await http(app)
      .put(`/v1/daily-logs/${shift(todayUtc(), -1)}`)
      .set(user)
      .send({ symptoms: [] })
      .expect(200);
    const guest = await anonymous(app);
    await grantHealthConsent(app, guest);
    const day = shift(todayUtc(), -4);
    await http(app)
      .put(`/v1/daily-logs/${day}`)
      .set(guest)
      .send({ symptoms: ['headache'] })
      .expect(200);

    const refused = await http(app)
      .post('/v1/anonymous-sessions/link')
      .set(user)
      .send({ secret: guest.secret })
      .expect(409);
    expect(refused.body.error.code).toBe('ACCOUNT_HAS_HEALTH_DATA');
    await http(app).get(`/v1/daily-logs/${day}`).set(guest).expect(200);
    await http(app).get(`/v1/daily-logs/${day}`).set(user).expect(404);

    const bad = await http(app)
      .post('/v1/anonymous-sessions/link')
      .set(user)
      .send({ secret: 'x' });
    expect([400, 404]).toContain(bad.status);
    await http(app)
      .post('/v1/anonymous-sessions/link')
      .send({ secret: guest.secret })
      .expect(401);
  });
});
