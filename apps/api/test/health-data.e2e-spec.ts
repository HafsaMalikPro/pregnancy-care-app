import type { INestApplication } from '@nestjs/common';
import {
  ApiError,
  ConsentState,
  CycleEntry,
  CycleEstimate,
  DailyLog,
  Profile,
  Reminder,
} from '@preconception/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import {
  anonymous,
  type Auth,
  createTestApp,
  daysAgo,
  grantHealthConsent,
  signUp,
} from './helpers.js';

const MISSING_ID = '01a14ddb-0000-7000-8000-000000000000';

describe('Health data (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let alice: Auth;
  let bob: Auth;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    alice = await signUp(app);
    bob = await signUp(app);
    await grantHealthConsent(app, alice);
    await grantHealthConsent(app, bob);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('consent', () => {
    it('reports every purpose, defaulting to not granted', async () => {
      const fresh = await signUp(app);
      const res = await http.get('/v1/me/consents').set(fresh).expect(200);
      expect(
        res.body.map((c: ConsentState) => ConsentState.parse(c).purpose).sort(),
      ).toEqual([
        'health_data_processing',
        'marketing_email',
        'product_analytics',
      ]);
      expect(res.body.every((c: ConsentState) => !c.granted)).toBe(true);
    });

    it('blocks health writes without consent and after withdrawal', async () => {
      const user = await signUp(app);
      const blocked = await http
        .post('/v1/cycles')
        .set(user)
        .send({ periodStart: daysAgo(3) });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('CONSENT_REQUIRED');

      await grantHealthConsent(app, user);
      await http
        .post('/v1/cycles')
        .set(user)
        .send({ periodStart: daysAgo(3) })
        .expect(201);

      await grantHealthConsent(app, user, false);
      const withdrawn = await http
        .put(`/v1/daily-logs/${daysAgo(1)}`)
        .set(user)
        .send({ symptoms: [] });
      expect(withdrawn.body.error.code).toBe('CONSENT_REQUIRED');
      // Existing data stays readable after withdrawal.
      const list = await http.get('/v1/cycles').set(user).expect(200);
      expect(list.body.page.total).toBe(1);
    });

    it.each([
      {
        purpose: 'health_data_processing',
        granted: 'yes',
        policyVersion: 'v1',
        source: 'x_y',
      },
      {
        purpose: 'tracking',
        granted: true,
        policyVersion: 'v1',
        source: 'settings',
      },
      {
        purpose: 'product_analytics',
        granted: true,
        policyVersion: 'v1',
        source: 'Bad Source',
      },
      { purpose: 'product_analytics', granted: true, source: 'settings' },
    ])('rejects invalid consent %j', async (body) => {
      await http.post('/v1/me/consents').set(alice).send(body).expect(400);
    });
  });

  describe('cycles', () => {
    let aliceCycle: CycleEntry;

    beforeAll(async () => {
      const res = await http
        .post('/v1/cycles')
        .set(alice)
        .send({ periodStart: daysAgo(100), periodEnd: daysAgo(96) })
        .expect(201);
      aliceCycle = CycleEntry.parse(res.body);
    });

    it('creates and reads a period in the contract shape', async () => {
      const res = await http
        .get(`/v1/cycles/${aliceCycle.id}`)
        .set(alice)
        .expect(200);
      expect(res.body).toEqual(aliceCycle);
      expect(aliceCycle).toMatchObject({
        periodStart: daysAgo(100),
        periodEnd: daysAgo(96),
      });
    });

    it('rejects an overlapping period with 409', async () => {
      const res = await http
        .post('/v1/cycles')
        .set(alice)
        .send({ periodStart: daysAgo(98) });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
      // The database message quotes the dates; it must not reach the client.
      expect(JSON.stringify(res.body)).not.toContain(daysAgo(98));
    });

    it.each([
      [{ periodStart: '2026-02-30' }, 'periodStart'],
      [{ periodStart: '26-01-01' }, 'periodStart'],
      [{}, 'periodStart'],
      [{ periodStart: daysAgo(-5) }, 'periodStart'],
      [{ periodStart: daysAgo(80), periodEnd: daysAgo(85) }, 'periodEnd'],
      [{ periodStart: daysAgo(80), userId: MISSING_ID }, 'property'],
    ])('rejects %j (400, %s)', async (body, path) => {
      const res = await http.post('/v1/cycles').set(alice).send(body);
      expect(res.status).toBe(400);
      expect(
        ApiError.parse(res.body).error.details?.some(
          (d) => d.message.includes(path) || d.path === path,
        ),
      ).toBe(true);
    });

    it('rejects a period longer than 30 days (database check → 400)', async () => {
      const res = await http
        .post('/v1/cycles')
        .set(alice)
        .send({ periodStart: daysAgo(300), periodEnd: daysAgo(250) });
      expect(res.status).toBe(400);
    });

    it('updates a period and can clear its end date', async () => {
      const created = await http
        .post('/v1/cycles')
        .set(alice)
        .send({ periodStart: daysAgo(200), periodEnd: daysAgo(197) })
        .expect(201);
      const patched = await http
        .patch(`/v1/cycles/${created.body.id}`)
        .set(alice)
        .send({ periodEnd: null })
        .expect(200);
      expect(patched.body.periodEnd).toBeNull();
      const moved = await http
        .patch(`/v1/cycles/${created.body.id}`)
        .set(alice)
        .send({ periodStart: daysAgo(201) })
        .expect(200);
      expect(moved.body.periodStart).toBe(daysAgo(201));
    });

    it('deletes a period, then 404s', async () => {
      const created = await http
        .post('/v1/cycles')
        .set(alice)
        .send({ periodStart: daysAgo(400) })
        .expect(201);
      await http.delete(`/v1/cycles/${created.body.id}`).set(alice).expect(204);
      await http.get(`/v1/cycles/${created.body.id}`).set(alice).expect(404);
      await http.delete(`/v1/cycles/${created.body.id}`).set(alice).expect(404);
    });

    it('400s on a malformed id and 404s on an unknown one', async () => {
      await http.get('/v1/cycles/not-a-uuid').set(alice).expect(400);
      await http.get(`/v1/cycles/${MISSING_ID}`).set(alice).expect(404);
    });

    it("never exposes or changes another person's period (404)", async () => {
      await http.get(`/v1/cycles/${aliceCycle.id}`).set(bob).expect(404);
      await http
        .patch(`/v1/cycles/${aliceCycle.id}`)
        .set(bob)
        .send({ periodEnd: null })
        .expect(404);
      await http.delete(`/v1/cycles/${aliceCycle.id}`).set(bob).expect(404);
      const list = await http.get('/v1/cycles').set(bob).expect(200);
      expect(list.body.items.map((c: CycleEntry) => c.id)).not.toContain(
        aliceCycle.id,
      );
      await http.get(`/v1/cycles/${aliceCycle.id}`).set(alice).expect(200);
    });

    it('works the same for anonymous sessions', async () => {
      const anon = await anonymous(app);
      await grantHealthConsent(app, anon);
      const res = await http
        .post('/v1/cycles')
        .set(anon)
        .send({ periodStart: daysAgo(100) })
        .expect(201);
      // Same date as Alice's period is fine: overlap rules are per owner.
      await http.get(`/v1/cycles/${res.body.id}`).set(anon).expect(200);
      await http.get(`/v1/cycles/${res.body.id}`).set(alice).expect(404);
    });

    describe('pagination', () => {
      let user: Auth;

      beforeAll(async () => {
        user = await signUp(app);
        await grantHealthConsent(app, user);
        for (let i = 0; i < 5; i++) {
          await http
            .post('/v1/cycles')
            .set(user)
            .send({ periodStart: daysAgo(30 * i + 2) })
            .expect(201);
        }
      });

      it('pages newest first with totals', async () => {
        const first = await http
          .get('/v1/cycles?limit=2')
          .set(user)
          .expect(200);
        expect(first.body.page).toEqual({ limit: 2, offset: 0, total: 5 });
        expect(first.body.items.map((c: CycleEntry) => c.periodStart)).toEqual([
          daysAgo(2),
          daysAgo(32),
        ]);
        const last = await http
          .get('/v1/cycles?limit=2&offset=4')
          .set(user)
          .expect(200);
        expect(last.body.items).toHaveLength(1);
        const past = await http
          .get('/v1/cycles?offset=50')
          .set(user)
          .expect(200);
        expect(past.body.items).toEqual([]);
      });

      it.each(['limit=0', 'limit=101', 'offset=-1', 'limit=abc', 'limit=1.5'])(
        'rejects %s',
        async (qs) => {
          await http.get(`/v1/cycles?${qs}`).set(user).expect(400);
        },
      );

      it('returns an empty page for someone with no data', async () => {
        const fresh = await signUp(app);
        const res = await http.get('/v1/cycles').set(fresh).expect(200);
        expect(res.body).toEqual({
          items: [],
          page: { limit: 20, offset: 0, total: 0 },
        });
      });
    });

    describe('estimate', () => {
      it('reports insufficient history with limitations and no window', async () => {
        const fresh = await signUp(app);
        const res = await http
          .get('/v1/cycles/estimate')
          .set(fresh)
          .expect(200);
        expect(CycleEstimate.parse(res.body)).toMatchObject({
          confidence: 'insufficient_history',
          nextPeriodWindow: null,
          cyclesUsed: 0,
        });
        expect(res.body.limitations.length).toBeGreaterThan(0);
      });

      it('projects the next window from regular cycles', async () => {
        const user = await signUp(app);
        await grantHealthConsent(app, user);
        for (const d of [113, 85, 57, 29, 1]) {
          await http
            .post('/v1/cycles')
            .set(user)
            .send({ periodStart: daysAgo(d) })
            .expect(201);
        }
        const res = await http.get('/v1/cycles/estimate').set(user).expect(200);
        expect(res.body).toMatchObject({
          method: 'calendar-average@1',
          confidence: 'moderate',
          cyclesUsed: 4,
          nextPeriodWindow: { earliest: daysAgo(-25), latest: daysAgo(-29) },
        });
      });
    });
  });

  describe('daily logs', () => {
    const day = daysAgo(4);

    it('creates, replaces, reads and deletes a log', async () => {
      const put = await http
        .put(`/v1/daily-logs/${day}`)
        .set(alice)
        .send({ symptoms: ['cramps'], note: 'private note' })
        .expect(200);
      expect(DailyLog.parse(put.body)).toMatchObject({
        date: day,
        symptoms: ['cramps'],
        note: 'private note',
      });
      const replaced = await http
        .put(`/v1/daily-logs/${day}`)
        .set(alice)
        .send({ symptoms: [] })
        .expect(200);
      expect(replaced.body).toMatchObject({ symptoms: [], note: null });
      await http.get(`/v1/daily-logs/${day}`).set(alice).expect(200);
      await http.delete(`/v1/daily-logs/${day}`).set(alice).expect(204);
      await http.get(`/v1/daily-logs/${day}`).set(alice).expect(404);
    });

    it('lists a date range oldest first', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      for (const d of [daysAgo(1), daysAgo(9), daysAgo(5)]) {
        await http
          .put(`/v1/daily-logs/${d}`)
          .set(user)
          .send({ symptoms: ['fatigue'] })
          .expect(200);
      }
      const res = await http
        .get(`/v1/daily-logs?from=${daysAgo(6)}&to=${daysAgo(0)}`)
        .set(user)
        .expect(200);
      expect(res.body.map((l: DailyLog) => l.date)).toEqual([
        daysAgo(5),
        daysAgo(1),
      ]);
    });

    it.each([
      [{ symptoms: ['not_a_symptom'] }, 'symptoms'],
      [{ symptoms: ['cramps', 'cramps'] }, 'symptoms'],
      [{ symptoms: 'cramps' }, 'symptoms'],
      [{ symptoms: [], note: 'x'.repeat(2001) }, 'note'],
      [{}, 'symptoms'],
    ])('rejects %j', async (body, path) => {
      const res = await http.put(`/v1/daily-logs/${day}`).set(alice).send(body);
      expect(res.status).toBe(400);
      expect(
        res.body.error.details.map((d: { path: string }) => d.path),
      ).toContain(path);
    });

    it.each(['2026-13-01', 'today', '2026-1-1'])(
      'rejects date parameter %s',
      async (d) => {
        await http
          .put(`/v1/daily-logs/${d}`)
          .set(alice)
          .send({ symptoms: [] })
          .expect(400);
      },
    );

    it('rejects future dates and bad ranges', async () => {
      await http
        .put(`/v1/daily-logs/${daysAgo(-3)}`)
        .set(alice)
        .send({ symptoms: [] })
        .expect(400);
      await http
        .get(`/v1/daily-logs?from=${daysAgo(1)}&to=${daysAgo(5)}`)
        .set(alice)
        .expect(400);
      await http
        .get(`/v1/daily-logs?from=${daysAgo(400)}&to=${daysAgo(0)}`)
        .set(alice)
        .expect(400);
      await http.get('/v1/daily-logs').set(alice).expect(400);
    });

    it("keeps each person's logs private", async () => {
      await http
        .put(`/v1/daily-logs/${day}`)
        .set(alice)
        .send({ symptoms: ['acne'] })
        .expect(200);
      await http.get(`/v1/daily-logs/${day}`).set(bob).expect(404);
      await http.delete(`/v1/daily-logs/${day}`).set(bob).expect(404);
      const range = await http
        .get(`/v1/daily-logs?from=${day}&to=${day}`)
        .set(bob)
        .expect(200);
      expect(range.body).toEqual([]);
    });
  });

  describe('profile', () => {
    it('returns defaults, then the saved profile', async () => {
      const user = await signUp(app);
      const def = await http.get('/v1/me/profile').set(user).expect(200);
      expect(def.body).toEqual({
        timeZone: 'UTC',
        locale: 'en',
        planningHorizonMonths: null,
        countryCode: null,
        dietPattern: null,
        foodAllergies: [],
        activityLevel: null,
        foodIntolerances: [],
        excludedFoods: [],
        cuisinePreferences: [],
        contentTopics: [],
        reducedMotion: false,
        largerText: false,
        quietHoursStart: null,
        quietHoursEnd: null,
        weightTrackingEnabled: false,
      });
      const saved = await http
        .put('/v1/me/profile')
        .set(user)
        .send({
          timeZone: 'Asia/Karachi',
          locale: 'en',
          planningHorizonMonths: 6,
        })
        .expect(200);
      expect(Profile.parse(saved.body).planningHorizonMonths).toBe(6);
      const again = await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'Asia/Karachi', locale: 'en' })
        .expect(200);
      expect(again.body.planningHorizonMonths).toBeNull();

      // Preference fields keep their saved value when an older client omits them.
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({
          timeZone: 'UTC',
          locale: 'en',
          excludedFoods: [' Beef '],
          largerText: true,
        })
        .expect(200);
      const kept = await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: 'UTC', locale: 'en' })
        .expect(200);
      expect(kept.body).toMatchObject({
        excludedFoods: ['beef'],
        largerText: true,
      });
    });

    it.each([
      { timeZone: 'Mars/Olympus', locale: 'en' },
      { timeZone: 'UTC', locale: 'fr' },
      { timeZone: 'UTC', locale: 'en', planningHorizonMonths: 61 },
      { timeZone: 'UTC', locale: 'en', planningHorizonMonths: -1 },
      { timeZone: 'UTC', locale: 'en', excludedFoods: ['<script>'] },
      {
        timeZone: 'UTC',
        locale: 'en',
        cuisinePreferences: Array(11)
          .fill('x')
          .map((x, i) => x + i),
      },
    ])('rejects %j', async (body) => {
      await http.put('/v1/me/profile').set(alice).send(body).expect(400);
    });
  });

  describe('reminders', () => {
    const valid = {
      kind: 'daily_log',
      localTime: '08:30',
      recurrence: 'FREQ=WEEKLY;BYDAY=MO,TH',
    };

    it('creates, lists, updates and deletes', async () => {
      const user = await signUp(app);
      const created = await http
        .post('/v1/reminders')
        .set(user)
        .send(valid)
        .expect(201);
      expect(Reminder.parse(created.body)).toMatchObject({
        ...valid,
        enabled: true,
        label: null,
      });
      const patched = await http
        .patch(`/v1/reminders/${created.body.id}`)
        .set(user)
        .send({ enabled: false, localTime: '21:05' })
        .expect(200);
      expect(patched.body).toMatchObject({
        enabled: false,
        localTime: '21:05',
      });
      const list = await http.get('/v1/reminders').set(user).expect(200);
      expect(list.body).toHaveLength(1);
      await http
        .delete(`/v1/reminders/${created.body.id}`)
        .set(user)
        .expect(204);
      await http
        .delete(`/v1/reminders/${created.body.id}`)
        .set(user)
        .expect(404);
    });

    it.each([
      { ...valid, localTime: '24:00' },
      { ...valid, localTime: '8:30' },
      { ...valid, recurrence: 'FREQ=HOURLY' },
      { ...valid, recurrence: 'FREQ=WEEKLY;BYDAY=XX' },
      { ...valid, kind: 'ovulation' },
      { ...valid, label: 'x'.repeat(61) },
    ])('rejects %j', async (body) => {
      await http.post('/v1/reminders').set(alice).send(body).expect(400);
    });

    it('caps reminders at 20 per owner (409)', async () => {
      const user = await signUp(app);
      for (let i = 0; i < 20; i++) {
        await http.post('/v1/reminders').set(user).send(valid).expect(201);
      }
      const res = await http.post('/v1/reminders').set(user).send(valid);
      expect(res.status).toBe(409);
    });

    it("cannot touch another person's reminder", async () => {
      const created = await http
        .post('/v1/reminders')
        .set(alice)
        .send(valid)
        .expect(201);
      await http
        .patch(`/v1/reminders/${created.body.id}`)
        .set(bob)
        .send({ enabled: false })
        .expect(404);
      await http
        .delete(`/v1/reminders/${created.body.id}`)
        .set(bob)
        .expect(404);
    });
  });
});
