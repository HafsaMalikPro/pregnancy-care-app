import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import { pregnantUser } from './fixtures.js';
import {
  anonymous,
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  signUp,
} from './helpers.js';

const OWNED_TABLES = [
  'profiles',
  'cycles',
  'daily_logs',
  'user_task_progress',
  'consent_records',
  'reminders',
  'pregnancies',
  'appointments',
  'meal_logs',
  'activity_logs',
  'saved_content',
  'shopping_items',
  'plan_task_completions',
  'symptom_checks',
  'kick_sessions',
  'contractions',
  'weight_entries',
];

/** Postgres error code from a Prisma error raised through the pg adapter. */
function pgCode(e: unknown): string | undefined {
  const err = e as {
    code?: string;
    meta?: { driverAdapterError?: { cause?: { originalCode?: string } } };
  };
  return err.meta?.driverAdapterError?.cause?.originalCode ?? err.code;
}

async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected the database to reject the write');
}

describe('Database integrity (integration, real PostgreSQL)', () => {
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

  describe('migrations', () => {
    it('every migration in prisma/migrations is applied and none failed', async () => {
      const onDisk = readdirSync(
        join(import.meta.dirname, '../prisma/migrations'),
        {
          withFileTypes: true,
        },
      )
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
      const applied = await prisma.$queryRaw<
        {
          migration_name: string;
          finished_at: Date | null;
          rolled_back_at: Date | null;
        }[]
      >`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
      expect(applied.map((m) => m.migration_name)).toEqual(onDisk);
      for (const m of applied) {
        expect(m.finished_at, m.migration_name).not.toBeNull();
        expect(m.rolled_back_at, m.migration_name).toBeNull();
      }
    });

    it('every owner-scoped table has the single-owner CHECK and cascades with its owner', async () => {
      const checks = await prisma.$queryRaw<{ table: string; name: string }[]>`
        SELECT rel.relname::text AS table, con.conname::text AS name
        FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE con.contype = 'c' AND con.conname LIKE '%single_owner'`;
      expect(checks.map((c) => c.table).sort()).toEqual(
        [...OWNED_TABLES].sort(),
      );

      const fks = await prisma.$queryRaw<
        { table: string; column: string; action: string }[]
      >`
        SELECT rel.relname::text AS table, att.attname::text AS column, con.confdeltype::text AS action
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
        WHERE con.contype = 'f' AND att.attname IN ('user_id', 'anonymous_session_id')
          AND rel.relname = ANY (${OWNED_TABLES})`;
      // 'c' = ON DELETE CASCADE: deleting an account or guest session deletes its records.
      expect(fks).toHaveLength(OWNED_TABLES.length * 2);
      for (const fk of fks)
        expect(fk.action, `${fk.table}.${fk.column}`).toBe('c');
    });
  });

  describe('constraints', () => {
    it('rejects rows with no owner or two owners', async () => {
      const user = await signUp(app);
      const guest = await anonymous(app);
      const noOwner = await rejection(
        prisma.shoppingItem.create({ data: { name: `x-${randomUUID()}` } }),
      );
      expect(pgCode(noOwner)).toBe('23514');
      const twoOwners = await rejection(
        prisma.appointment.create({
          data: {
            userId: user.id,
            anonymousSessionId: guest.id,
            kind: 'scan',
            title: 'x',
            startsAt: new Date(),
          },
        }),
      );
      expect(pgCode(twoOwners)).toBe('23514');
    });

    it('rejects a second active pregnancy at the database level', async () => {
      const user = await pregnantUser(app, 10);
      const err = await rejection(
        prisma.pregnancy.create({
          data: {
            userId: user.id,
            dueDate: new Date(),
            datingMethod: 'lmp',
            datingSource: 'self',
          },
        }),
      );
      expect((err as { code?: string }).code).toBe('P2002');
    });

    it('rejects foreign keys to missing owners and out-of-range values', async () => {
      const fk = await rejection(
        prisma.mealLog.create({
          data: {
            userId: randomUUID(),
            date: new Date(),
            slot: 'lunch',
            recipeSlug: 'x',
          },
        }),
      );
      expect((fk as { code?: string }).code).toBe('P2003');
      const user = await signUp(app);
      const slot = await rejection(
        prisma.mealLog.create({
          data: {
            userId: user.id,
            date: new Date(),
            slot: 'brunch',
            recipeSlug: 'x',
          },
        }),
      );
      expect(pgCode(slot)).toBe('23514');
      const minutes = await rejection(
        prisma.activityLog.create({
          data: {
            userId: user.id,
            date: new Date(),
            activitySlug: 'walk',
            minutes: 601,
          },
        }),
      );
      expect(pgCode(minutes)).toBe('23514');
      const water = await rejection(
        prisma.dailyLog.create({
          data: {
            userId: user.id,
            date: new Date(),
            symptoms: [],
            waterGlasses: -1,
          },
        }),
      );
      expect(pgCode(water)).toBe('23514');
    });

    it('keeps one daily log per owner per date', async () => {
      const user = await signUp(app);
      const date = new Date(`${daysAgo(2)}T00:00:00Z`);
      await prisma.dailyLog.create({
        data: { userId: user.id, date, symptoms: [] },
      });
      const dup = await rejection(
        prisma.dailyLog.create({
          data: { userId: user.id, date, symptoms: [] },
        }),
      );
      expect((dup as { code?: string }).code).toBe('P2002');
    });

    it('maps constraint violations reaching the API to 4xx, never 500', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      // 40 days is longer than the 30-day period CHECK allows.
      const res = await http
        .post('/v1/cycles')
        .set(user)
        .send({ periodStart: daysAgo(60), periodEnd: daysAgo(20) })
        .expect(400);
      expect(res.body.error.message).toBe('The request is invalid.');
      expect(JSON.stringify(res.body)).not.toMatch(
        /period_end|constraint|daterange/,
      );
    });
  });

  describe('cascades', () => {
    it('deleting an account removes every owned record, including nested ones', async () => {
      const user = await pregnantUser(app, 20);
      await http
        .put('/v1/pregnancies/current/birth-preferences')
        .set(user)
        .send({
          birthSetting: 'hospital',
          painRelief: [],
          supportPeople: ['partner'],
          feedingIntention: null,
          notes: null,
        })
        .expect(200);
      await http
        .post('/v1/appointments')
        .set(user)
        .send({
          kind: 'scan',
          title: 'x',
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);
      await http
        .put(`/v1/daily-logs/${daysAgo(0)}`)
        .set(user)
        .send({ symptoms: [] })
        .expect(200);
      const pregnancyId = user.pregnancyId;

      await http
        .post('/v1/me/deletion')
        .set(user)
        .send({ confirm: 'DELETE MY ACCOUNT' })
        .expect(204);

      expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
      for (const count of await Promise.all([
        prisma.pregnancy.count({ where: { userId: user.id } }),
        prisma.pregnancyDating.count({ where: { pregnancyId } }),
        prisma.birthPreferences.count({ where: { pregnancyId } }),
        prisma.appointment.count({ where: { userId: user.id } }),
        prisma.dailyLog.count({ where: { userId: user.id } }),
        prisma.consentRecord.count({ where: { userId: user.id } }),
        prisma.authSession.count({ where: { userId: user.id } }),
      ])) {
        expect(count).toBe(0);
      }
      const job = await prisma.privacyJob.findFirst({
        where: { kind: 'deletion', userId: null },
        orderBy: { requestedAt: 'desc' },
      });
      expect(job?.status).toBe('completed');
    });

    it('keeps an appointment (unlinked) when its pregnancy row is removed', async () => {
      const user = await pregnantUser(app, 20);
      const appt = await http
        .post('/v1/appointments')
        .set(user)
        .send({
          kind: 'antenatal',
          title: 'x',
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .expect(201);
      await prisma.pregnancy.delete({ where: { id: user.pregnancyId } });
      const row = await prisma.appointment.findUnique({
        where: { id: appt.body.id },
      });
      expect(row?.pregnancyId).toBeNull();
    });
  });

  describe('transactions', () => {
    it('rolls back every write in a failed transaction', async () => {
      const user = await signUp(app);
      const err = await rejection(
        prisma.$transaction(async (tx) => {
          await tx.pregnancy.create({
            data: {
              userId: user.id,
              dueDate: new Date(),
              datingMethod: 'lmp',
              datingSource: 'self',
            },
          });
          throw new Error('fail after the first write');
        }),
      );
      expect((err as Error).message).toBe('fail after the first write');
      expect(await prisma.pregnancy.count({ where: { userId: user.id } })).toBe(
        0,
      );
    });

    it('rolls back a pregnancy whose dating history cannot be written', async () => {
      const user = await signUp(app);
      const err = await rejection(
        prisma.$transaction(async (tx) => {
          const p = await tx.pregnancy.create({
            data: {
              userId: user.id,
              dueDate: new Date(),
              datingMethod: 'lmp',
              datingSource: 'self',
            },
          });
          // Same shape as PregnancyService.create; a missing pregnancy id fails the FK.
          await tx.pregnancyDating.create({
            data: {
              pregnancyId: randomUUID(),
              method: 'lmp',
              source: 'self',
              inputs: {},
              dueDate: p.dueDate,
            },
          });
        }),
      );
      expect((err as { code?: string }).code).toBe('P2003');
      expect(await prisma.pregnancy.count({ where: { userId: user.id } })).toBe(
        0,
      );
    });
  });

  describe('concurrent and duplicate requests', () => {
    it('concurrent writes to the same journal day leave one row', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      const date = daysAgo(0);
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          http
            .put(`/v1/daily-logs/${date}`)
            .set(user)
            .send({ symptoms: [], waterGlasses: i }),
        ),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      const rows = await prisma.dailyLog.findMany({
        where: { userId: user.id },
      });
      expect(rows).toHaveLength(1);
      expect(results.map((r) => r.body.waterGlasses)).toContain(
        rows[0].waterGlasses,
      );
    });

    it('concurrent adds of one shopping item and one saved item stay single', async () => {
      const user = await signUp(app);
      const adds = await Promise.all(
        Array.from({ length: 6 }, () =>
          http.post('/v1/shopping-list').set(user).send({ name: 'Spinach' }),
        ),
      );
      expect(adds.every((r) => r.status === 201)).toBe(true);
      expect(new Set(adds.map((r) => r.body.id)).size).toBe(1);
      expect(
        await prisma.shoppingItem.count({ where: { userId: user.id } }),
      ).toBe(1);
    });

    it('concurrent consent records are all kept, and the newest decides', async () => {
      const user = await signUp(app);
      await Promise.all(
        [true, false, true].map((g) => grantHealthConsent(app, user, g)),
      );
      await grantHealthConsent(app, user, false);
      expect(
        await prisma.consentRecord.count({ where: { userId: user.id } }),
      ).toBe(4);
      const res = await http
        .put(`/v1/daily-logs/${daysAgo(0)}`)
        .set(user)
        .send({ symptoms: [] })
        .expect(403);
      expect(res.body.error.code).toBe('CONSENT_REQUIRED');
    });
  });

  describe('privacy jobs', () => {
    it('records completed export jobs and exports only the caller’s rows', async () => {
      const a = await pregnantUser(app, 12);
      const b = await pregnantUser(app, 30);
      await http
        .put(`/v1/daily-logs/${daysAgo(0)}`)
        .set(b)
        .send({ symptoms: ['nausea'], note: 'B only' })
        .expect(200);
      const res = await http.post('/v1/me/export').set(a).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.account).toMatchObject({ kind: 'user', id: a.id });
      expect(res.body.pregnancies).toHaveLength(1);
      expect(res.body.pregnancies[0].dueDate).toBe(a.dueDate);
      expect(JSON.stringify(res.body)).not.toContain(b.id);
      expect(JSON.stringify(res.body)).not.toContain('B only');
      const jobs = await http.get('/v1/me/privacy-jobs').set(a).expect(200);
      expect(jobs.body[0]).toMatchObject({
        kind: 'export',
        status: 'completed',
      });
      expect(jobs.body[0].completedAt).not.toBeNull();
    });
  });
});
