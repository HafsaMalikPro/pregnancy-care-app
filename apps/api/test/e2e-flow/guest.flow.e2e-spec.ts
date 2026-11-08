import type { INestApplication } from '@nestjs/common';
import { Me, Pregnancy } from '@preconception/contracts';
import type { App } from 'supertest/types.js';
import { createTestApp, getPrisma } from '../helpers.js';
import { staffTeam, uid } from '../fixtures.js';
import { CONSENT, http, shift, todayUtc } from './flow-helpers.js';

describe('Flow: guest (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('creates a session, consents, starts a pregnancy, journals and ticks a task', async () => {
    const created = await http(app)
      .post('/v1/anonymous-sessions')
      .send({ platform: 'web' })
      .expect(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      secret: expect.stringMatching(/^[\w-]{43}$/),
      expiresAt: expect.any(String),
    });
    const guest = { authorization: `Anonymous ${created.body.secret}` };

    const me = await http(app).get('/v1/me').set(guest).expect(200);
    expect(Me.parse(me.body)).toMatchObject({
      kind: 'anonymous',
      id: created.body.id,
    });

    // Health writes need consent first.
    const blocked = await http(app)
      .put(`/v1/daily-logs/${shift(todayUtc(), -1)}`)
      .set(guest)
      .send({ symptoms: [] })
      .expect(403);
    expect(blocked.body.error.code).toBe('CONSENT_REQUIRED');
    await http(app)
      .post('/v1/me/consents')
      .set(guest)
      .send(CONSENT)
      .expect(201);

    const lmp = shift(todayUtc(), -70);
    await http(app)
      .post('/v1/pregnancies')
      .set(guest)
      .send({ dating: { method: 'lmp', lmpDate: lmp } })
      .expect(201);
    const current = await http(app)
      .get('/v1/pregnancies/current')
      .set(guest)
      .expect(200);
    expect(Pregnancy.parse(current.body)).toMatchObject({
      dueDate: shift(lmp, 280),
      week: 10,
    });

    const day = shift(todayUtc(), -1);
    await http(app)
      .put(`/v1/daily-logs/${day}`)
      .set(guest)
      .send({ symptoms: ['nausea'], note: 'Morning only', mood: 'okay' })
      .expect(200);
    const log = await http(app)
      .get(`/v1/daily-logs/${day}`)
      .set(guest)
      .expect(200);
    expect(log.body).toMatchObject({
      date: day,
      symptoms: ['nausea'],
      note: 'Morning only',
      mood: 'okay',
    });

    const prisma = await getPrisma(app);
    const team = await staffTeam(app, prisma);
    const task = await http(app)
      .post('/v1/admin/readiness-tasks')
      .set(team.editor)
      .send({
        key: `flow-${uid()}`,
        locale: 'en',
        title: 'Pack a hospital bag',
        description: 'Essentials.',
        category: 'nutrition',
        sortOrder: 1,
        premium: false,
      })
      .expect(201);
    await http(app)
      .post(`/v1/admin/readiness-tasks/${task.body.id}/publish`)
      .set(team.reviewer)
      .expect(200);
    const done = await http(app)
      .put(`/v1/readiness/tasks/${task.body.id}/progress`)
      .set(guest)
      .send({ completed: true })
      .expect(200);
    expect(done.body.completedAt).not.toBeNull();
  });

  it('negative: no credentials 401, a wrong secret 401, a missing log 404, a bad body 400', async () => {
    await http(app).get('/v1/me').expect(401);
    await http(app)
      .get('/v1/me')
      .set({ authorization: `Anonymous ${'A'.repeat(43)}` })
      .expect(401);
    const created = await http(app)
      .post('/v1/anonymous-sessions')
      .send({ platform: 'web' })
      .expect(201);
    const guest = { authorization: `Anonymous ${created.body.secret}` };
    await http(app)
      .get(`/v1/daily-logs/${shift(todayUtc(), -3)}`)
      .set(guest)
      .expect(404);
    await http(app)
      .post('/v1/anonymous-sessions')
      .send({ platform: 'fax-machine' })
      .expect(400);
  });
});
