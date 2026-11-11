import type { INestApplication } from '@nestjs/common';
import { Me } from '@preconception/contracts';
import type { App } from 'supertest/types.js';
import { createTestApp, PASSWORD, uniqueEmail } from '../helpers.js';
import { http } from './flow-helpers.js';

describe('Flow: account (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('signs up, signs in, reads /me, updates the profile, signs out and back in', async () => {
    const email = uniqueEmail('flow');
    const up = await http(app)
      .post('/v1/auth/sign-up/email')
      .send({ email, password: PASSWORD, name: 'Flow Person' })
      .expect(200);
    expect(up.body.user).toMatchObject({ email, name: 'Flow Person' });
    const signIn = await http(app)
      .post('/v1/auth/sign-in/email')
      .send({ email, password: PASSWORD })
      .expect(200);
    const auth = {
      authorization: `Bearer ${signIn.headers['set-auth-token']}`,
    };

    const me = await http(app).get('/v1/me').set(auth).expect(200);
    expect(Me.parse(me.body)).toMatchObject({ kind: 'user', email });

    const profile = await http(app)
      .put('/v1/me/profile')
      .set(auth)
      .send({
        timeZone: 'Asia/Karachi',
        locale: 'en',
        dietPattern: 'vegetarian',
        foodAllergies: ['peanut'],
      })
      .expect(200);
    expect(profile.body).toMatchObject({
      timeZone: 'Asia/Karachi',
      dietPattern: 'vegetarian',
      foodAllergies: ['peanut'],
    });

    await http(app).post('/v1/auth/sign-out').set(auth).send({}).expect(200);
    await http(app).get('/v1/me').set(auth).expect(401);
    const again = await http(app)
      .post('/v1/auth/sign-in/email')
      .send({ email, password: PASSWORD })
      .expect(200);
    await http(app)
      .get('/v1/me')
      .set({ authorization: `Bearer ${again.headers['set-auth-token']}` })
      .expect(200);
  });

  it('negative: duplicate sign-up, short password, bad profile body, no session', async () => {
    const email = uniqueEmail('dup');
    await http(app)
      .post('/v1/auth/sign-up/email')
      .send({ email, password: PASSWORD, name: 'A' })
      .expect(200);
    const dup = await http(app)
      .post('/v1/auth/sign-up/email')
      .send({ email, password: PASSWORD, name: 'B' });
    expect([400, 422]).toContain(dup.status);
    await http(app)
      .post('/v1/auth/sign-up/email')
      .send({ email: uniqueEmail(), password: 'short', name: 'C' })
      .expect(400);
    const signIn = await http(app)
      .post('/v1/auth/sign-in/email')
      .send({ email, password: PASSWORD })
      .expect(200);
    const auth = {
      authorization: `Bearer ${signIn.headers['set-auth-token']}`,
    };
    await http(app)
      .put('/v1/me/profile')
      .set(auth)
      .send({ timeZone: 'Mars/Olympus', locale: 'en' })
      .expect(400);
    await http(app)
      .put('/v1/me/profile')
      .send({ timeZone: 'UTC', locale: 'en' })
      .expect(401);
  });
});
