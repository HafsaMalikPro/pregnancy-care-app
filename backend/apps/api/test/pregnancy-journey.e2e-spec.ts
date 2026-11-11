import type { INestApplication } from '@nestjs/common';
import { Pregnancy } from '@preconception/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { daysFromNow, pregnantUser } from './fixtures.js';
import {
  anonymous,
  type Auth,
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  signUp,
} from './helpers.js';

/**
 * Pregnancy dating through the API. Expected values are worked out by hand from the ACOG rules
 * (280 days from LMP; trimesters at 14w0d and 28w0d; term at 37/39/41/42 weeks), not from the
 * implementation, so these tests check the arithmetic independently.
 */
describe('Pregnancy journey (integration)', () => {
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

  async function consenting(): Promise<Auth & { id: string }> {
    const user = await signUp(app);
    await grantHealthConsent(app, user);
    return user;
  }

  function create(user: Auth, dating: object, extra: object = {}) {
    return http
      .post('/v1/pregnancies')
      .set(user)
      .send({ dating, ...extra });
  }

  describe('every dating method', () => {
    it('LMP: due 280 days after the last period', async () => {
      const user = await consenting();
      const res = await create(user, {
        method: 'lmp',
        lmpDate: daysAgo(70),
      }).expect(201);
      const p = Pregnancy.parse(res.body);
      expect(p).toMatchObject({
        dueDate: daysFromNow(210),
        gestationalAge: { weeks: 10, days: 0 },
        week: 10,
        trimester: 1,
        termStatus: 'preterm',
        daysUntilDue: 210,
        datingMethod: 'lmp',
        datingSource: 'self',
        status: 'active',
      });
    });

    it('LMP with a 35-day cycle moves the due date 7 days later', async () => {
      const user = await consenting();
      const res = await create(user, {
        method: 'lmp',
        lmpDate: daysAgo(70),
        cycleLengthDays: 35,
      }).expect(201);
      expect(res.body.dueDate).toBe(daysFromNow(217));
      expect(res.body.gestationalAge).toEqual({ weeks: 9, days: 0 });
    });

    it('ultrasound: scan date plus the days left from the measured gestational age', async () => {
      const user = await consenting();
      // 12w3d (87 days) a week ago -> 94 days today = 13w3d; due in 280 - 94 = 186 days.
      const res = await create(
        user,
        {
          method: 'ultrasound',
          scanDate: daysAgo(7),
          gestationalWeeks: 12,
          gestationalDays: 3,
        },
        { source: 'clinician' },
      ).expect(201);
      expect(res.body).toMatchObject({
        dueDate: daysFromNow(186),
        gestationalAge: { weeks: 13, days: 3 },
        trimester: 1,
        datingMethod: 'ultrasound',
        datingSource: 'clinician',
      });
    });

    it('IVF: transfer date plus 266 days minus embryo age', async () => {
      const user = await consenting();
      // Day-5 transfer 14 days ago: due in 266 - 5 - 14 = 247 days; 33 days = 4w5d today.
      const res = await create(user, {
        method: 'ivf',
        transferDate: daysAgo(14),
        embryoAgeDays: 5,
      }).expect(201);
      expect(res.body).toMatchObject({
        dueDate: daysFromNow(247),
        gestationalAge: { weeks: 4, days: 5 },
        week: 4,
      });
    });

    it('due date: taken as given', async () => {
      const user = await consenting();
      const res = await create(user, {
        method: 'due_date',
        dueDate: daysFromNow(100),
      }).expect(201);
      expect(res.body).toMatchObject({
        dueDate: daysFromNow(100),
        gestationalAge: { weeks: 25, days: 5 },
        trimester: 2,
      });
    });
  });

  describe('boundaries', () => {
    it.each([
      [97, 1, 'preterm'], // 13w6d
      [98, 2, 'preterm'], // 14w0d
      [195, 2, 'preterm'], // 27w6d
      [196, 3, 'preterm'], // 28w0d
      [258, 3, 'preterm'], // 36w6d
      [259, 3, 'early_term'], // 37w0d
      [273, 3, 'full_term'], // 39w0d
      [287, 3, 'late_term'], // 41w0d
      [294, 3, 'postterm'], // 42w0d
    ])(
      '%i days from LMP: trimester %i, %s',
      async (days, trimester, termStatus) => {
        const user = await consenting();
        const res = await create(user, {
          method: 'lmp',
          lmpDate: daysAgo(days),
        }).expect(201);
        expect(res.body.trimester).toBe(trimester);
        expect(res.body.termStatus).toBe(termStatus);
        expect(res.body.week).toBe(Math.min(42, Math.floor(days / 7)));
      },
    );

    it('accepts exactly 0 and 44 weeks; rejects anything outside', async () => {
      const user = await consenting();
      const zero = await create(user, {
        method: 'due_date',
        dueDate: daysFromNow(280),
      }).expect(201);
      expect(zero.body).toMatchObject({
        gestationalAge: { weeks: 0, days: 0 },
        week: 1,
      });
      await prisma.pregnancy.deleteMany({ where: { userId: user.id } });

      const res = await create(user, {
        method: 'due_date',
        dueDate: daysFromNow(281),
      }).expect(400);
      expect(res.body.error.details[0]).toMatchObject({ path: 'dueDate' });
      await create(user, { method: 'lmp', lmpDate: daysAgo(309) }).expect(400);
      await create(user, { method: 'lmp', lmpDate: daysAgo(308) }).expect(201);
    });

    it('rejects input dates in the future', async () => {
      const user = await consenting();
      for (const dating of [
        { method: 'lmp', lmpDate: daysFromNow(1) },
        {
          method: 'ultrasound',
          scanDate: daysFromNow(1),
          gestationalWeeks: 8,
          gestationalDays: 0,
        },
        { method: 'ivf', transferDate: daysFromNow(1), embryoAgeDays: 5 },
      ]) {
        const res = await create(user, dating).expect(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('validates the shape of each method', async () => {
      const user = await consenting();
      const invalid = [
        {},
        { method: 'guess' },
        { method: 'lmp' },
        { method: 'lmp', lmpDate: '2026-02-30' },
        { method: 'lmp', lmpDate: daysAgo(10), cycleLengthDays: 19 },
        { method: 'lmp', lmpDate: daysAgo(10), cycleLengthDays: 46 },
        {
          method: 'ultrasound',
          scanDate: daysAgo(1),
          gestationalWeeks: 41,
          gestationalDays: 0,
        },
        {
          method: 'ultrasound',
          scanDate: daysAgo(1),
          gestationalWeeks: 10,
          gestationalDays: 7,
        },
        { method: 'ivf', transferDate: daysAgo(1), embryoAgeDays: 8 },
        { method: 'due_date' },
      ];
      for (const dating of invalid) {
        await create(user, dating).expect(400);
      }
      await create(
        user,
        { method: 'lmp', lmpDate: daysAgo(10) },
        { source: 'friend' },
      ).expect(400);
      await create(
        user,
        { method: 'lmp', lmpDate: daysAgo(10) },
        { status: 'ended' },
      ).expect(400);
      expect(await prisma.pregnancy.count({ where: { userId: user.id } })).toBe(
        0,
      );
    });

    it("uses 'today' in the owner's time zone", async () => {
      const user = await consenting();
      const zone = 'Pacific/Kiritimati'; // UTC+14
      await http
        .put('/v1/me/profile')
        .set(user)
        .send({ timeZone: zone, locale: 'en' })
        .expect(200);
      const localToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
      }).format(new Date());
      const res = await create(user, {
        method: 'lmp',
        lmpDate: daysAgo(70),
      }).expect(201);
      expect(res.body.today).toBe(localToday);
    });
  });

  describe('re-dating and history', () => {
    it('records every estimate newest first and reports the shift', async () => {
      const user = await consenting();
      await create(user, { method: 'lmp', lmpDate: daysAgo(84) }).expect(201);
      const scan = await http
        .put('/v1/pregnancies/current/dating')
        .set(user)
        .send({
          dating: {
            method: 'ultrasound',
            scanDate: daysAgo(0),
            gestationalWeeks: 11,
            gestationalDays: 5,
          },
          source: 'clinician',
        })
        .expect(200);
      // 12w0d by LMP vs 11w5d by scan: the due date moves 2 days later.
      expect(scan.body.change).toEqual({
        previousDueDate: daysFromNow(196),
        newDueDate: daysFromNow(198),
        shiftDays: 2,
      });
      expect(scan.body.pregnancy).toMatchObject({
        datingMethod: 'ultrasound',
        datingSource: 'clinician',
        dueDate: daysFromNow(198),
      });
      await http
        .put('/v1/pregnancies/current/dating')
        .set(user)
        .send({ dating: { method: 'due_date', dueDate: daysFromNow(190) } })
        .expect(200);

      const history = await http
        .get('/v1/pregnancies/current/dating-history')
        .set(user)
        .expect(200);
      expect(history.body.map((h: { method: string }) => h.method)).toEqual([
        'due_date',
        'ultrasound',
        'lmp',
      ]);
      expect(history.body[2].inputs).toEqual({
        method: 'lmp',
        lmpDate: daysAgo(84),
      });
      const current = await http
        .get('/v1/pregnancies/current')
        .set(user)
        .expect(200);
      expect(current.body.dueDate).toBe(daysFromNow(190));
    });

    it('rejects an implausible re-date and leaves the pregnancy unchanged', async () => {
      const user = await consenting();
      const created = await create(user, {
        method: 'lmp',
        lmpDate: daysAgo(70),
      }).expect(201);
      await http
        .put('/v1/pregnancies/current/dating')
        .set(user)
        .send({ dating: { method: 'due_date', dueDate: daysFromNow(400) } })
        .expect(400);
      const history = await http
        .get('/v1/pregnancies/current/dating-history')
        .set(user)
        .expect(200);
      expect(history.body).toHaveLength(1);
      expect(
        (await http.get('/v1/pregnancies/current').set(user)).body.dueDate,
      ).toBe(created.body.dueDate);
    });
  });

  describe('status transitions', () => {
    it('active -> ended; ended pregnancies are read-only and a new one can start', async () => {
      const user = await pregnantUser(app, 30);
      const ended = await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'birth', endedOn: daysAgo(1) })
        .expect(200);
      expect(ended.body).toMatchObject({
        status: 'ended',
        outcome: 'birth',
        endedOn: daysAgo(1),
        today: daysAgo(1),
        gestationalAge: { weeks: 29, days: 6 },
      });

      await http.get('/v1/pregnancies/current').set(user).expect(404);
      await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'birth', endedOn: daysAgo(0) })
        .expect(404);
      await http
        .put('/v1/pregnancies/current/dating')
        .set(user)
        .send({ dating: { method: 'lmp', lmpDate: daysAgo(10) } })
        .expect(404);
      await http
        .patch('/v1/pregnancies/current')
        .set(user)
        .send({ firstPregnancy: true })
        .expect(404);
      await http.get('/v1/pregnancies/current/timeline').set(user).expect(404);

      await create(user, { method: 'lmp', lmpDate: daysAgo(14) }).expect(201);
      const list = await http
        .get('/v1/pregnancies')
        .query({ limit: 1 })
        .set(user)
        .expect(200);
      expect(list.body.page).toEqual({ limit: 1, offset: 0, total: 2 });
      expect(list.body.items[0].status).toBe('active');
      const second = await http
        .get('/v1/pregnancies')
        .query({ limit: 1, offset: 1 })
        .set(user)
        .expect(200);
      expect(second.body.items[0]).toMatchObject({
        status: 'ended',
        outcome: 'birth',
      });
    });

    it('rejects an end date before the pregnancy began (regression) or in the future', async () => {
      const user = await pregnantUser(app, 10);
      const before = await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'loss', endedOn: daysAgo(71) })
        .expect(400);
      expect(before.body.error.details[0]).toMatchObject({ path: 'endedOn' });
      await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'loss', endedOn: daysFromNow(1) })
        .expect(400);
      // The first day of the pregnancy itself is allowed.
      await http
        .post('/v1/pregnancies/current/end')
        .set(user)
        .send({ outcome: 'loss', endedOn: daysAgo(70) })
        .expect(200);
    });

    it('allows only one active pregnancy even under concurrent requests', async () => {
      const user = await consenting();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          create(user, { method: 'lmp', lmpDate: daysAgo(50) }),
        ),
      );
      const statuses = results.map((r) => r.status).sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      for (const r of results.filter((x) => x.status === 409)) {
        expect(r.body.error.code).toBe('CONFLICT');
      }
      expect(
        await prisma.pregnancy.count({
          where: { userId: user.id, status: 'active' },
        }),
      ).toBe(1);
      // No orphaned dating rows from the requests that lost.
      expect(
        await prisma.pregnancyDating.count({
          where: { pregnancy: { userId: user.id } },
        }),
      ).toBe(1);
    });
  });

  describe('weeks and guides', () => {
    it('describes past, current and upcoming weeks and validates the week', async () => {
      const user = await pregnantUser(app, 12);
      const current = await http
        .get('/v1/pregnancies/current/weeks/12')
        .set(user)
        .expect(200);
      expect(current.body).toMatchObject({
        week: 12,
        trimester: 1,
        status: 'current',
        startDate: daysAgo(0),
        endDate: daysFromNow(6),
      });
      expect(
        (await http.get('/v1/pregnancies/current/weeks/11').set(user)).body
          .status,
      ).toBe('past');
      expect(
        (await http.get('/v1/pregnancies/current/weeks/30').set(user)).body,
      ).toMatchObject({
        status: 'upcoming',
        trimester: 3,
      });
      for (const w of ['0', '43', 'abc']) {
        await http
          .get(`/v1/pregnancies/current/weeks/${w}`)
          .set(user)
          .expect(400);
      }
      const thisWeek = await http
        .get('/v1/pregnancies/current/week')
        .set(user)
        .expect(200);
      expect(thisWeek.body.pregnancy.week).toBe(12);
      expect(thisWeek.body).toHaveProperty('guide');
    });

    it('serves published week guides publicly and validates the range', async () => {
      const res = await http
        .get('/v1/week-guides')
        .query({ from: 1, to: 42 })
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      await http.get('/v1/week-guides').query({ from: 10, to: 5 }).expect(400);
      await http.get('/v1/week-guides/43').expect(400);
      await http
        .get('/v1/week-guides/41')
        .expect((r) => expect([200, 404]).toContain(r.status));
    });
  });

  describe('guest pregnancies', () => {
    it('keeps an anonymous pregnancy invisible to registered users and other guests', async () => {
      const guest = await anonymous(app);
      await grantHealthConsent(app, guest);
      await create(guest, { method: 'lmp', lmpDate: daysAgo(40) }).expect(201);
      const other = await anonymous(app);
      await http.get('/v1/pregnancies/current').set(other).expect(404);
      const user = await signUp(app);
      await http.get('/v1/pregnancies/current').set(user).expect(404);
      expect(
        (await http.get('/v1/pregnancies').set(user)).body.page.total,
      ).toBe(0);
    });
  });
});
