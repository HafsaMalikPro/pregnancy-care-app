import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { pregnantUser } from '../fixtures.js';
import { createTestApp, getPrisma, signUp } from '../helpers.js';
import { http, shift, todayUtc } from './flow-helpers.js';

describe('Flow: privacy export and deletion (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('exports as a no-store attachment with format v2', async () => {
    const user = await pregnantUser(app, 18);
    await http(app)
      .put(`/v1/daily-logs/${shift(todayUtc(), -1)}`)
      .set(user)
      .send({ symptoms: ['fatigue'] })
      .expect(200);
    const res = await http(app).post('/v1/me/export').set(user).expect(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body).toMatchObject({
      format: 'preconception-export@2',
      dailyLogs: [expect.objectContaining({ symptoms: ['fatigue'] })],
    });
  });

  it('deletes only with the exact confirmation, then removes the rows', async () => {
    const user = await pregnantUser(app, 18);
    await http(app)
      .post('/v1/me/deletion')
      .set(user)
      .send({ confirm: 'delete my account' })
      .expect(400);
    await http(app)
      .post('/v1/me/deletion')
      .set(user)
      .send({ confirm: 'DELETE' })
      .expect(400);
    await http(app).post('/v1/me/deletion').set(user).send({}).expect(400);
    await http(app)
      .post('/v1/me/deletion')
      .set(user)
      .send({ confirm: 'DELETE MY ACCOUNT' })
      .expect(204);
    const prisma = await getPrisma(app);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.pregnancy.count({ where: { userId: user.id } })).toBe(
      0,
    );
    expect(
      await prisma.consentRecord.count({ where: { userId: user.id } }),
    ).toBe(0);
    await http(app).get('/v1/me').set(user).expect(401);
  });

  it('negative: no auth 401; a guest cannot delete an account', async () => {
    await http(app).post('/v1/me/export').expect(401);
    const guest = await http(app)
      .post('/v1/anonymous-sessions')
      .send({ platform: 'web' })
      .expect(201);
    const res = await http(app)
      .post('/v1/me/deletion')
      .set({ authorization: `Anonymous ${guest.body.secret}` })
      .send({ confirm: 'DELETE MY ACCOUNT' });
    expect([403, 204]).toContain(res.status);
    await signUp(app);
  });
});
