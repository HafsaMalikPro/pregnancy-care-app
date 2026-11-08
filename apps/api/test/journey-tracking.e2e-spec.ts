import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  EXPORT_FORMAT_VERSION,
  RedFlagCode,
  type SymptomCheckResult,
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
const refs = [{ title: 'Clinical source', url: 'https://example.org/source' }];
const approve = {
  decision: 'approved',
  reviewerCredentials: 'RM, Registered Midwife',
  sources: refs,
};

describe('Symptom checks, trackers, weight, visits and postpartum (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  let editor: Auth & { id: string };
  let reviewer: Auth & { id: string };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = await getPrisma(app);
    http = request(app.getHttpServer());
    editor = await staffUser(app, prisma, 'content_editor');
    reviewer = await staffUser(app, prisma, 'clinical_reviewer');
  });

  afterAll(async () => {
    await app.close();
  });

  async function pregnant(weeks: number, consent = true) {
    const user = await signUp(app);
    await grantHealthConsent(app, user);
    await http
      .post('/v1/pregnancies')
      .set(user)
      .send({ dating: { method: 'lmp', lmpDate: daysAgo(weeks * 7) } })
      .expect(201);
    if (!consent) await grantHealthConsent(app, user, false);
    return user;
  }

  async function publish(path: string, body: object) {
    const created = await http
      .post(`/v1/admin/${path}`)
      .set(editor)
      .send({ locale: 'en', summary: 'Summary', references: refs, ...body })
      .expect(201);
    const id = created.body.id as string;
    await http.post(`/v1/admin/articles/${id}/submit`).set(editor).expect(200);
    await http
      .post(`/v1/admin/articles/${id}/reviews`)
      .set(reviewer)
      .send(approve)
      .expect(201);
    await http.post(`/v1/admin/articles/${id}/publish`).set(editor).expect(200);
    return id;
  }

  describe('symptom checks', () => {
    it('serves the warning-sign vocabulary publicly, labelled as not yet reviewed', async () => {
      const res = await http.get('/v1/symptom-checks/options').expect(200);
      expect(res.body.review).toBeNull();
      expect(res.body.redFlags).toHaveLength(RedFlagCode.options.length);
      expect(res.body.emergencyCallToAction).toEqual({
        label: 'Call your doctor now or go to emergency services',
        kind: 'emergency',
      });
      expect(res.body.disclaimer).toContain('not medical advice');
      const preg = await http
        .get('/v1/symptom-checks/options?stage=pregnancy')
        .expect(200);
      const codes = preg.body.redFlags.map((r: { code: string }) => r.code);
      expect(codes).toContain('reduced_baby_movement');
      expect(codes).not.toContain(
        'heavy_bleeding_or_bad_smelling_discharge_after_birth',
      );
      await http.get('/v1/symptom-checks/options?stage=nope').expect(400);
    });

    it('returns the emergency result to a visitor without saving it', async () => {
      const res = await http
        .post('/v1/symptom-checks')
        .send({ symptoms: ['vision_changes'] })
        .expect(200);
      const body = res.body as SymptomCheckResult;
      expect(body).toMatchObject({
        id: null,
        saved: false,
        level: 'emergency',
        stage: 'unknown',
        callToAction: {
          label: 'Call your doctor now or go to emergency services',
          kind: 'emergency',
        },
        review: null,
      });
      expect(body.redFlags[0].code).toBe('vision_changes');
    });

    it('never withholds the emergency result for missing consent', async () => {
      const user = await pregnant(20, false);
      const res = await http
        .post('/v1/symptom-checks')
        .set(user)
        .send({ symptoms: ['reduced_baby_movement'] })
        .expect(200);
      expect(res.body).toMatchObject({
        saved: false,
        level: 'emergency',
        stage: 'pregnancy',
      });
      expect(
        await prisma.symptomCheck.count({ where: { userId: user.id } }),
      ).toBe(0);
    });

    it('saves to the journal with consent and lists it by date for the owner only', async () => {
      const user = await pregnant(20);
      const urgent = await http
        .post('/v1/symptom-checks')
        .set(user)
        .send({ symptoms: ['nausea', 'severe_headache', 'severe_headache'] })
        .expect(200);
      expect(urgent.body).toMatchObject({
        saved: true,
        level: 'emergency',
        symptoms: ['nausea', 'severe_headache'],
        matchedRules: ['urgent_maternal_warning_sign'],
      });
      const routine = await http
        .post('/v1/symptom-checks')
        .set(user)
        .send({ symptoms: ['nausea', 'fatigue'] })
        .expect(200);
      expect(routine.body).toMatchObject({
        saved: true,
        level: 'routine',
        callToAction: null,
        matchedRules: [],
      });
      const today = urgent.body.date as string;
      const list = await http
        .get(`/v1/symptom-checks?from=${today}&to=${today}`)
        .set(user)
        .expect(200);
      expect(list.body.map((c: SymptomCheckResult) => c.level)).toEqual([
        'routine',
        'emergency',
      ]);
      const other = await signUp(app);
      const none = await http
        .get(`/v1/symptom-checks?from=${today}&to=${today}`)
        .set(other)
        .expect(200);
      expect(none.body).toEqual([]);
    });

    it('validates input (fixed vocabulary, list size, date range) and needs auth for history', async () => {
      const user = await signUp(app);
      await http.post('/v1/symptom-checks').send({ symptoms: [] }).expect(400);
      await http
        .post('/v1/symptom-checks')
        .send({ symptoms: ['made_up'] })
        .expect(400);
      await http
        .post('/v1/symptom-checks')
        .send({ symptoms: ['fever'], note: 'x' })
        .expect(400);
      await http
        .get('/v1/symptom-checks?from=2026-01-01&to=2027-06-01')
        .set(user)
        .expect(400);
      await http
        .get('/v1/symptom-checks?from=2026-01-01&to=2026-01-02')
        .expect(401);
    });
  });

  describe('kick counter', () => {
    it('is offered from the third trimester only and needs a pregnancy', async () => {
      const early = await pregnant(20);
      await http.post('/v1/kick-counts/sessions').set(early).expect(409);
      const none = await signUp(app);
      await grantHealthConsent(app, none);
      await http.post('/v1/kick-counts/sessions').set(none).expect(404);
      await http.post('/v1/kick-counts/sessions').expect(401);
    });

    it('counts movements in one running session and compares with the clinician threshold', async () => {
      const user = await pregnant(32);
      const today = (
        await http.get('/v1/pregnancies/current').set(user).expect(200)
      ).body.today as string;

      const start = await http
        .post('/v1/kick-counts/sessions')
        .set(user)
        .expect(201);
      const id = start.body.id as string;
      await http.post('/v1/kick-counts/sessions').set(user).expect(409);
      for (let i = 0; i < 3; i++) {
        await http
          .post(`/v1/kick-counts/sessions/${id}/kicks`)
          .set(user)
          .expect(200);
      }
      // No threshold yet: recorded, never compared.
      const stopped = await http
        .post(`/v1/kick-counts/sessions/${id}/stop`)
        .set(user)
        .expect(200);
      expect(stopped.body).toMatchObject({
        count: 3,
        belowThreshold: null,
        alert: null,
      });
      await http
        .post(`/v1/kick-counts/sessions/${id}/kicks`)
        .set(user)
        .expect(409);

      await http
        .put('/v1/kick-counts/threshold')
        .set(user)
        .send({ count: 10, windowMinutes: 120 })
        .expect(200);
      await http
        .put('/v1/kick-counts/threshold')
        .set(user)
        .send({ count: 0, windowMinutes: 5 })
        .expect(400);

      // A session whose full window passed with too few movements.
      const second = await http
        .post('/v1/kick-counts/sessions')
        .set(user)
        .expect(201);
      await prisma.kickSession.update({
        where: { id: second.body.id },
        data: { startedAt: new Date(Date.now() - 125 * 60_000), count: 4 },
      });
      const below = await http
        .post(`/v1/kick-counts/sessions/${second.body.id}/stop`)
        .set(user)
        .expect(200);
      expect(below.body.belowThreshold).toBe(true);
      expect(below.body.alert).toMatchObject({
        callToAction: {
          kind: 'emergency',
          label: 'Call your doctor now or go to emergency services',
        },
      });

      const summary = await http
        .get(`/v1/kick-counts?from=${today}&to=${today}`)
        .set(user)
        .expect(200);
      expect(summary.body.threshold).toMatchObject({
        count: 10,
        windowMinutes: 120,
        source: 'clinician',
      });
      expect(summary.body.thresholdLabel).toContain('clinician');
      expect(summary.body.days[0]).toMatchObject({
        date: today,
        totalCount: 7,
      });
      await http
        .get(`/v1/kick-counts?from=2026-01-01&to=2026-06-01`)
        .set(user)
        .expect(400);

      await http.delete('/v1/kick-counts/threshold').set(user).expect(204);
      const cleared = await http
        .get(`/v1/kick-counts?from=${today}&to=${today}`)
        .set(user)
        .expect(200);
      expect(cleared.body.threshold).toBeNull();
    });

    it("hides other people's sessions (404) and needs consent to count (403)", async () => {
      const owner = await pregnant(30);
      const session = await http
        .post('/v1/kick-counts/sessions')
        .set(owner)
        .expect(201);
      const stranger = await pregnant(30);
      await http
        .post(`/v1/kick-counts/sessions/${session.body.id}/kicks`)
        .set(stranger)
        .expect(404);
      await http
        .delete(`/v1/kick-counts/sessions/${session.body.id}`)
        .set(stranger)
        .expect(404);
      await grantHealthConsent(app, owner, false);
      const res = await http
        .post(`/v1/kick-counts/sessions/${session.body.id}/kicks`)
        .set(owner)
        .expect(403);
      expect(res.body.error.code).toBe('CONSENT_REQUIRED');
      await http
        .delete(`/v1/kick-counts/sessions/${session.body.id}`)
        .set(owner)
        .expect(204);
    });
  });

  describe('contraction timer', () => {
    it('records contractions and computes durations and intervals only', async () => {
      const user = await pregnant(39);
      const t0 = Date.now() - 20 * 60_000;
      await http
        .post('/v1/contractions')
        .set(user)
        .send({
          startedAt: new Date(t0).toISOString(),
          endedAt: new Date(t0 + 45_000).toISOString(),
        })
        .expect(201);
      const second = await http
        .post('/v1/contractions')
        .set(user)
        .send({
          startedAt: new Date(t0 + 8 * 60_000).toISOString(),
          endedAt: new Date(t0 + 8 * 60_000 + 55_000).toISOString(),
        })
        .expect(201);
      expect(second.body).toMatchObject({
        durationSeconds: 55,
        intervalSeconds: 480,
      });
      const running = await http.post('/v1/contractions').set(user).expect(201);
      expect(running.body.endedAt).toBeNull();
      const stopped = await http
        .post(`/v1/contractions/${running.body.id}/stop`)
        .set(user)
        .expect(200);
      expect(stopped.body.endedAt).not.toBeNull();

      const day = await http.get('/v1/contractions').set(user).expect(200);
      expect(day.body.count).toBe(3);
      expect(day.body.averageDurationSeconds).toBeGreaterThan(0);
      expect(day.body.message).toContain('contact your maternity unit');
    });

    it('rejects future and stale times, needs consent, and scopes by owner', async () => {
      const user = await pregnant(38);
      const future = new Date(Date.now() + 10 * 60_000).toISOString();
      await http
        .post('/v1/contractions')
        .set(user)
        .send({ startedAt: future })
        .expect(400);
      await http
        .post('/v1/contractions')
        .set(user)
        .send({
          startedAt: new Date(Date.now() - 13 * 3_600_000).toISOString(),
        })
        .expect(400);
      const mine = await http.post('/v1/contractions').set(user).expect(201);
      const stranger = await pregnant(38);
      await http
        .post(`/v1/contractions/${mine.body.id}/stop`)
        .set(stranger)
        .expect(404);
      await http
        .delete(`/v1/contractions/${mine.body.id}`)
        .set(stranger)
        .expect(404);
      const noConsent = await pregnant(38, false);
      await http.post('/v1/contractions').set(noConsent).expect(403);
      await http
        .delete(`/v1/contractions/${mine.body.id}`)
        .set(user)
        .expect(204);
    });
  });

  describe('weight tracking (opt-in)', () => {
    it('accepts entries only after opting in and shows a plain trend', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      const today = daysAgo(0);
      const res = await http
        .put(`/v1/weight-entries/${daysAgo(1)}`)
        .set(user)
        .send({ weightKg: 64.2 });
      expect(res.status).toBe(409);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'UTC', locale: 'en', weightTrackingEnabled: true })
        .expect(200);
      await http
        .put(`/v1/weight-entries/${daysAgo(7)}`)
        .set(user)
        .send({ weightKg: 64.2 })
        .expect(200);
      await http
        .put(`/v1/weight-entries/${today}`)
        .set(user)
        .send({ weightKg: 64.9 })
        .expect(200);
      await http
        .put(`/v1/weight-entries/${today}`)
        .set(user)
        .send({ weightKg: 65.1 })
        .expect(200);
      const trend = await http
        .get(`/v1/weight-entries?from=${daysAgo(30)}&to=${today}`)
        .set(user)
        .expect(200);
      expect(trend.body).toMatchObject({ enabled: true, changeKg: 0.9 });
      expect(trend.body.entries).toHaveLength(2);
      const text = JSON.stringify(trend.body).toLowerCase();
      for (const word of [
        'target',
        'ideal',
        'healthy range',
        'bmi',
        'calorie',
      ]) {
        if (word === 'target' || word === 'healthy range') {
          // Only in the sentence that says there is none.
          expect(
            text.match(new RegExp(word, 'g'))?.length ?? 0,
          ).toBeLessThanOrEqual(1);
        } else if (word === 'ideal') {
          expect(text).not.toMatch(/ideal (weight|range)/);
        } else {
          expect(text).not.toContain(word);
        }
      }
    });

    it('validates values and dates, needs consent, and 404s on a missing day', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'UTC', locale: 'en', weightTrackingEnabled: true })
        .expect(200);
      await http
        .put(`/v1/weight-entries/${daysAgo(0)}`)
        .set(user)
        .send({ weightKg: 5 })
        .expect(400);
      const tomorrow = new Date(Date.now() + 2 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await http
        .put(`/v1/weight-entries/${tomorrow}`)
        .set(user)
        .send({ weightKg: 60 })
        .expect(400);
      await http
        .delete(`/v1/weight-entries/${daysAgo(3)}`)
        .set(user)
        .expect(404);
      await grantHealthConsent(app, user, false);
      await http
        .put(`/v1/weight-entries/${daysAgo(0)}`)
        .set(user)
        .send({ weightKg: 60 })
        .expect(403);
    });
  });

  describe('profile quiet hours and premium locks', () => {
    it('stores quiet hours as a pair and keeps them when omitted', async () => {
      const user = await signUp(app);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'UTC', locale: 'en', quietHoursStart: '22:00' })
        .expect(400);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({
          timeZone: 'UTC',
          locale: 'en',
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
        })
        .expect(200);
      const kept = await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'Europe/London', locale: 'en' })
        .expect(200);
      expect(kept.body).toMatchObject({
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        weightTrackingEnabled: false,
      });
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({
          timeZone: 'UTC',
          locale: 'en',
          quietHoursStart: '25:00',
          quietHoursEnd: '07:00',
        })
        .expect(400);
    });

    it('reports locks off by default and serves premium bodies to everyone', async () => {
      const user = await signUp(app);
      const ent = await http.get('/v1/me/entitlement').set(user).expect(200);
      expect(ent.body).toMatchObject({ premium: false, locksEnabled: false });
      const slug = `premium-${uid()}`;
      const created = await http
        .post('/v1/admin/articles')
        .set(editor)
        .send({
          slug,
          locale: 'en',
          title: 'Premium article',
          summary: 'Summary',
          body: 'Full premium body.',
          references: refs,
          premium: true,
          category: 'pregnancy',
        })
        .expect(201);
      const id = created.body.id as string;
      await http
        .post(`/v1/admin/articles/${id}/submit`)
        .set(editor)
        .expect(200);
      await http
        .post(`/v1/admin/articles/${id}/reviews`)
        .set(reviewer)
        .send(approve)
        .expect(201);
      await http
        .post(`/v1/admin/articles/${id}/publish`)
        .set(editor)
        .expect(200);
      const visitor = await http.get(`/v1/articles/${slug}`).expect(200);
      expect(visitor.body).toMatchObject({
        premium: true,
        locked: false,
        body: 'Full premium body.',
      });
    });
  });

  describe('prenatal visit schedule', () => {
    it('publishes a reviewed schedule and maps it onto my pregnancy with booked visits', async () => {
      const country = 'ZZ'; // test-only country so other suites' schedules don't interfere
      await publish('visit-schedules', {
        slug: `visits-t2-${uid()}`,
        title: 'Second trimester visits',
        category: 'prenatal_care',
        sections: {
          trimester: 2,
          countryCode: country,
          visits: [
            {
              key: 'anomaly_scan',
              title: 'Mid-pregnancy scan',
              fromWeek: 18,
              toWeek: 21,
              purpose: 'Written by the clinical team.',
              typicalChecks: ['Scan'],
              appointmentKind: 'scan',
            },
            {
              key: 'midwife_25',
              title: 'Midwife appointment',
              fromWeek: 25,
              toWeek: 25,
              purpose: 'Written by the clinical team.',
              typicalChecks: [],
              appointmentKind: 'antenatal',
            },
          ],
        },
      });
      const user = await pregnant(19);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'UTC', locale: 'en', countryCode: country })
        .expect(200);
      const appt = await http
        .post('/v1/appointments')
        .set(user)
        .send({
          kind: 'scan',
          title: 'Scan',
          startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        })
        .expect(201);
      const visits = await http
        .get('/v1/pregnancies/current/visit-schedule')
        .set(user)
        .expect(200);
      const scan = visits.body.find(
        (v: { key: string }) => v.key === 'anomaly_scan',
      );
      expect(scan).toMatchObject({
        status: 'current',
        bookedAppointmentId: appt.body.id,
        review: { reviewerCredentials: 'RM, Registered Midwife' },
      });
      const later = visits.body.find(
        (v: { key: string }) => v.key === 'midwife_25',
      );
      expect(later).toMatchObject({
        status: 'upcoming',
        bookedAppointmentId: null,
      });

      const pub = await http
        .get(`/v1/visit-schedules?countryCode=${country}`)
        .expect(200);
      expect(
        pub.body.some(
          (s: { sections: { countryCode: string } }) =>
            s.sections.countryCode === country,
        ),
      ).toBe(true);
      await http.get('/v1/visit-schedules?countryCode=zz').expect(400);
    });

    it('rejects invalid schedules and needs an active pregnancy', async () => {
      const bad = await http
        .post('/v1/admin/visit-schedules')
        .set(editor)
        .send({
          slug: `bad-visits-${uid()}`,
          locale: 'en',
          title: 'Bad',
          summary: 'S',
          references: refs,
          category: 'prenatal_care',
          sections: {
            trimester: 1,
            countryCode: null,
            visits: [
              {
                key: 'a',
                title: 'A',
                fromWeek: 12,
                toWeek: 8,
                purpose: 'P',
                typicalChecks: [],
                appointmentKind: 'antenatal',
              },
            ],
          },
        });
      expect(bad.status).toBe(400);
      const user = await signUp(app);
      await http
        .get('/v1/pregnancies/current/visit-schedule')
        .set(user)
        .expect(404);
    });
  });

  describe('postpartum mode', () => {
    it('starts after a birth with the week guide and recovery checklist', async () => {
      const user = await pregnant(39);
      await http.get('/v1/postpartum').set(user).expect(404);
      await publish('postpartum-guides', {
        slug: 'postpartum-week-2',
        title: 'Week 2 after birth',
        category: 'postpartum',
        sections: {
          week: 2,
          body: 'Written by the clinical team.',
          recovery: ['Item'],
          feeding: [],
          emotionalWellbeing: [],
          babyCare: [],
          whenToGetHelp: ['Written by the clinical team.'],
          askAtCheck: [],
          checklist: [],
        },
      }).catch(async () => {
        // Another run already published week 2: that version is reused.
      });
      const key = `pp-recovery-${uid()}`;
      await prisma.readinessTask.create({
        data: {
          key,
          locale: 'en',
          title: 'Recovery task',
          description: 'Written by the clinical team.',
          category: 'postpartum_recovery',
          status: 'published',
          sortOrder: 0,
          premium: false,
        },
      });
      await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'birth', endedOn: daysAgo(9) })
        .expect(200);
      const pp = await http.get('/v1/postpartum').set(user).expect(200);
      expect(pp.body).toMatchObject({ daysSinceBirth: 9, week: 2 });
      expect(pp.body.guide?.sections.week).toBe(2);
      expect(
        pp.body.recoveryTasks.some((t: { key: string }) => t.key === key),
      ).toBe(true);
      expect(pp.body.disclaimer).toContain('not medical advice');

      const check = await http
        .post('/v1/symptom-checks')
        .set(user)
        .send({
          symptoms: ['heavy_bleeding_or_bad_smelling_discharge_after_birth'],
        })
        .expect(200);
      expect(check.body).toMatchObject({
        stage: 'postpartum',
        level: 'emergency',
      });

      await http.get('/v1/postpartum-guides/2').expect(200);
      await http.get('/v1/postpartum-guides/9').expect(404);
    });

    it('enforces the postpartum guide slug and refuses premium safety content', async () => {
      const res = await http
        .post('/v1/admin/postpartum-guides')
        .set(editor)
        .send({
          slug: 'postpartum-week-3',
          locale: 'en',
          title: 'Wrong week',
          summary: 'S',
          references: refs,
          category: 'postpartum',
          sections: {
            week: 4,
            body: 'B',
            recovery: [],
            feeding: [],
            emotionalWellbeing: [],
            babyCare: [],
            whenToGetHelp: ['W'],
            askAtCheck: [],
            checklist: [],
          },
        });
      expect(res.status).toBe(400);
      const reserved = await http.post('/v1/admin/articles').set(editor).send({
        slug: 'postpartum-week-5',
        locale: 'en',
        title: 'Not a guide',
        summary: 'S',
        body: 'B',
        references: refs,
        premium: false,
        category: 'postpartum',
      });
      expect(reserved.status).toBe(400);
    });
  });

  describe('export, guest linking and deletion cover the new records', () => {
    it('exports v2 with every new table, links guest trackers, and deletes them', async () => {
      const guest = await anonymous(app);
      await grantHealthConsent(app, guest);
      await http
        .post('/v1/pregnancies')
        .set(guest)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(30 * 7) } })
        .expect(201);
      await http
        .put('/v1/me/profile')
        .set(guest)
        .send({ timeZone: 'UTC', locale: 'en', weightTrackingEnabled: true })
        .expect(200);
      await http.post('/v1/kick-counts/sessions').set(guest).expect(201);
      await http.post('/v1/contractions').set(guest).expect(201);
      await http
        .post('/v1/symptom-checks')
        .set(guest)
        .send({ symptoms: ['fever'] })
        .expect(200);
      await http
        .put(`/v1/weight-entries/${daysAgo(0)}`)
        .set(guest)
        .send({ weightKg: 70 })
        .expect(200);

      const exported = await http.post('/v1/me/export').set(guest).expect(200);
      expect(exported.body.formatVersion).toBe(EXPORT_FORMAT_VERSION);
      expect(exported.body.format).toBe(
        `preconception-export@${EXPORT_FORMAT_VERSION}`,
      );
      for (const key of [
        'symptomChecks',
        'kickSessions',
        'contractions',
        'weightEntries',
      ]) {
        expect(exported.body[key]).toHaveLength(1);
      }
      expect(exported.body.profile.weightTrackingEnabled).toBe(true);

      const user = await signUp(app);
      await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: guest.secret })
        .expect(200);
      const where = { userId: user.id };
      expect(await prisma.kickSession.count({ where })).toBe(1);
      expect(await prisma.contraction.count({ where })).toBe(1);
      expect(await prisma.symptomCheck.count({ where })).toBe(1);
      expect(await prisma.weightEntry.count({ where })).toBe(1);

      await http
        .post('/v1/me/deletion')
        .set(user)
        .send({ confirm: 'DELETE MY ACCOUNT' })
        .expect(204);
      expect(await prisma.kickSession.count({ where })).toBe(0);
      expect(await prisma.contraction.count({ where })).toBe(0);
      expect(await prisma.symptomCheck.count({ where })).toBe(0);
      expect(await prisma.weightEntry.count({ where })).toBe(0);
    });

    it('refuses to link a guest into an account that has tracker data (409)', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'UTC', locale: 'en', weightTrackingEnabled: true })
        .expect(200);
      // The account's only health data is one weight entry.
      await http
        .put(`/v1/weight-entries/${daysAgo(0)}`)
        .set(user)
        .send({ weightKg: 61 })
        .expect(200);
      const guest = await anonymous(app);
      const res = await http
        .post('/v1/anonymous-sessions/link')
        .set(user)
        .send({ secret: guest.secret })
        .expect(409);
      expect(res.body.error.code).toBe('ACCOUNT_HAS_HEALTH_DATA');
    });
  });
});
