import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import {
  anonymous,
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  signUp,
  staffUser,
} from './helpers.js';

const CONFIRM = { confirm: 'DELETE MY ACCOUNT' };

describe('Privacy: export and deletion (e2e)', () => {
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

  it('exports everything stored for a user, and nobody else', async () => {
    const user = await signUp(app);
    const other = await signUp(app);
    for (const who of [user, other]) {
      await grantHealthConsent(app, who);
      await http
        .post('/v1/cycles')
        .set(who)
        .send({ periodStart: daysAgo(20), periodEnd: daysAgo(16) })
        .expect(201);
    }
    await http
      .put(`/v1/daily-logs/${daysAgo(2)}`)
      .set(user)
      .send({ symptoms: ['headache'], note: 'n' })
      .expect(200);
    await http
      .post('/v1/reminders')
      .set(user)
      .send({ kind: 'custom', localTime: '07:00', recurrence: 'FREQ=DAILY' })
      .expect(201);

    const res = await http.post('/v1/me/export').set(user).expect(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      format: 'preconception-export@1',
      account: { kind: 'user', id: user.id, email: user.email },
      cycles: [{ periodStart: daysAgo(20), periodEnd: daysAgo(16) }],
      dailyLogs: [{ date: daysAgo(2), symptoms: ['headache'], note: 'n' }],
      reminders: [{ kind: 'custom', localTime: '07:00' }],
    });
    expect(res.body.consentHistory).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toContain(other.email);

    const jobs = await http.get('/v1/me/privacy-jobs').set(user).expect(200);
    expect(jobs.body[0]).toMatchObject({ kind: 'export', status: 'completed' });
  });

  it('exports for anonymous sessions too', async () => {
    const anon = await anonymous(app);
    const res = await http.post('/v1/me/export').set(anon).expect(200);
    expect(res.body.account).toEqual({ kind: 'anonymous', id: anon.id });
  });

  it('requires the exact confirmation phrase to delete', async () => {
    const user = await signUp(app);
    await http.post('/v1/me/deletion').set(user).send({}).expect(400);
    await http
      .post('/v1/me/deletion')
      .set(user)
      .send({ confirm: 'delete my account' })
      .expect(400);
    await http.get('/v1/me').set(user).expect(200);
  });

  it('deletes the account and all its data, revoking sessions', async () => {
    const user = await signUp(app);
    await grantHealthConsent(app, user);
    await http
      .post('/v1/cycles')
      .set(user)
      .send({ periodStart: daysAgo(10) })
      .expect(201);
    await http
      .put(`/v1/daily-logs/${daysAgo(1)}`)
      .set(user)
      .send({ symptoms: ['nausea'] })
      .expect(200);
    await http
      .put('/v1/me/profile')
      .set(user)
      .send({ timeZone: 'UTC', locale: 'en' })
      .expect(200);

    await http.post('/v1/me/deletion').set(user).send(CONFIRM).expect(204);

    await http.get('/v1/me').set(user).expect(401);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    for (const count of [
      prisma.cycle.count({ where: { userId: user.id } }),
      prisma.dailyLog.count({ where: { userId: user.id } }),
      prisma.profile.count({ where: { userId: user.id } }),
      prisma.consentRecord.count({ where: { userId: user.id } }),
      prisma.authSession.count({ where: { userId: user.id } }),
      prisma.authAccount.count({ where: { userId: user.id } }),
    ]) {
      expect(await count).toBe(0);
    }
    // The job and audit records outlive the account, without a link to it.
    const audit = await prisma.auditEvent.findFirst({
      where: { action: 'account.deleted', targetId: user.id },
    });
    expect(audit).not.toBeNull();
    const job = await prisma.privacyJob.findFirst({
      where: { kind: 'deletion', userId: null, completedAt: { not: null } },
      orderBy: { requestedAt: 'desc' },
    });
    expect(job?.status).toBe('completed');
  });

  it('removes linked anonymous sessions along with the account', async () => {
    const anon = await anonymous(app);
    const user = await signUp(app);
    await http
      .post('/v1/anonymous-sessions/link')
      .set(user)
      .send({ secret: anon.secret })
      .expect(200);
    await http.post('/v1/me/deletion').set(user).send(CONFIRM).expect(204);
    expect(
      await prisma.anonymousSession.findUnique({ where: { id: anon.id } }),
    ).toBeNull();
  });

  it('refuses to delete a staff account (409)', async () => {
    const staff = await staffUser(app, prisma, 'content_editor');
    const res = await http.post('/v1/me/deletion').set(staff).send(CONFIRM);
    expect(res.status).toBe(409);
    expect(
      await prisma.user.findUnique({ where: { id: staff.id } }),
    ).not.toBeNull();
  });

  it('never writes health values into audit metadata', async () => {
    const events = await prisma.auditEvent.findMany({
      where: {
        action: {
          in: ['privacy.export', 'account.deleted', 'anonymous_session.linked'],
        },
      },
    });
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(JSON.stringify(e.metadata)).not.toMatch(
        /\d{4}-\d{2}-\d{2}|symptom|note|headache/,
      );
    }
  });
});
