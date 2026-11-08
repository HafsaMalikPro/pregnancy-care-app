import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Public } from '../../src/auth/auth.decorators.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import { pregnantUser } from '../fixtures.js';
import {
  createTestApp,
  daysAgo,
  getPrisma,
  grantHealthConsent,
  signUp,
  staffUser,
  TEST_FIELD_KEYS,
} from '../helpers.js';

/** Throws with health-looking and secret-looking text, to prove neither reaches logs or clients. */
@Public('test-only probe controller')
@Controller('protection-probe')
class ProtectionProbeController {
  @Get()
  fail(): never {
    throw new Error(
      'note="Bleeding since Tuesday" token=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 jane.probe@example.org',
    );
  }
}

/** Captures everything written to stdout and stderr while `fn` runs. */
async function captureOutput(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  const grab = (chunk: unknown) => {
    chunks.push(
      typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk as Uint8Array).toString(),
    );
    return true;
  };
  process.stdout.write = grab as typeof process.stdout.write;
  process.stderr.write = grab as typeof process.stderr.write;
  try {
    await fn();
    // Background log writes (e.g. Better Auth) land on the next ticks.
    await new Promise((r) => setTimeout(r, 50));
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
  return chunks.join('');
}

describe('Security: data protection (e2e)', () => {
  let app: INestApplication<App>;
  let http: ReturnType<typeof request>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({}, [ProtectionProbeController]);
    http = request(app.getHttpServer());
    prisma = await getPrisma(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('field encryption at rest', () => {
    it('stores ciphertext in every sensitive column and returns plaintext to the owner', async () => {
      const user = await pregnantUser(app, 32);
      const secretText = `Ask about the bleeding ${randomUUID()}`;
      const date = daysAgo(1);
      await http
        .put(`/v1/daily-logs/${date}`)
        .set(user)
        .send({ symptoms: [], note: secretText, questions: secretText })
        .expect(200);
      const appt = await http
        .post('/v1/appointments')
        .set(user)
        .send({
          kind: 'antenatal',
          title: 'Check-up',
          startsAt: new Date(Date.now() + 86_400_000).toISOString(),
          notes: secretText,
          questions: [secretText],
        })
        .expect(201);
      await http
        .put('/v1/pregnancies/current/birth-preferences')
        .set(user)
        .send({
          birthSetting: 'hospital',
          painRelief: [],
          supportPeople: [],
          feedingIntention: 'undecided',
          notes: secretText,
        })
        .expect(200);

      const [log] = await prisma.$queryRaw<
        { note: string; questions: string }[]
      >`
        SELECT note, questions FROM daily_logs WHERE user_id = ${user.id}::uuid`;
      const [row] = await prisma.$queryRaw<
        { notes: string; questions: string[] }[]
      >`
        SELECT notes, questions FROM appointments WHERE id = ${appt.body.id}::uuid`;
      const [birth] = await prisma.$queryRaw<{ notes: string }[]>`
        SELECT b.notes FROM birth_preferences b JOIN pregnancies p ON p.id = b.pregnancy_id WHERE p.user_id = ${user.id}::uuid`;
      for (const raw of [
        log.note,
        log.questions,
        row.notes,
        row.questions[0],
        birth.notes,
      ]) {
        expect(raw).toMatch(/^enc1\.t1\./);
        expect(raw).not.toContain('bleeding');
      }

      expect(
        (await http.get(`/v1/daily-logs/${date}`).set(user).expect(200)).body,
      ).toMatchObject({ note: secretText, questions: secretText });
      expect(
        (
          await http
            .get(`/v1/appointments/${appt.body.id}`)
            .set(user)
            .expect(200)
        ).body,
      ).toMatchObject({ notes: secretText, questions: [secretText] });
      expect(
        (
          await http
            .get('/v1/pregnancies/current/birth-preferences')
            .set(user)
            .expect(200)
        ).body.notes,
      ).toBe(secretText);
      const exported = await http.post('/v1/me/export').set(user).expect(200);
      expect(JSON.stringify(exported.body)).toContain(secretText);
      expect(JSON.stringify(exported.body)).not.toContain('enc1.');
    });

    it('encrypts checklist notes', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      const task = await prisma.readinessTask.findFirst({
        where: { status: 'published', premium: false },
      });
      if (!task) return; // No published task in this database: covered by the other columns.
      await http
        .put(`/v1/readiness/tasks/${task.id}/progress`)
        .set(user)
        .send({ completed: true, note: 'private checklist note' })
        .expect(200);
      const row = await prisma.userTaskProgress.findFirstOrThrow({
        where: { userId: user.id, taskId: task.id },
      });
      expect(row.note).toMatch(/^enc1\.t1\./);
    });

    it('reads values under an older key and plaintext, and the re-encryption job moves them to the active key', async () => {
      const { FieldCipher, parseKeys, ENCRYPTED_COLUMNS } =
        await import('../../src/database/field-cipher.js');
      const { FieldCipherService } =
        await import('../../src/database/field-cipher.js');
      const { reencryptAll } =
        await import('../../src/database/field-reencrypt.js');
      const oldCipher = new FieldCipher(parseKeys(TEST_FIELD_KEYS), 't0');
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      const [d1, d2] = [daysAgo(3), daysAgo(4)];
      await http
        .put(`/v1/daily-logs/${d1}`)
        .set(user)
        .send({ symptoms: [] })
        .expect(200);
      await http
        .put(`/v1/daily-logs/${d2}`)
        .set(user)
        .send({ symptoms: [] })
        .expect(200);
      await prisma.dailyLog.updateMany({
        where: { userId: user.id, date: new Date(`${d1}T00:00:00Z`) },
        data: {
          note: oldCipher.encrypt(
            'under the old key',
            ENCRYPTED_COLUMNS.dailyLogNote,
          ),
        },
      });
      await prisma.dailyLog.updateMany({
        where: { userId: user.id, date: new Date(`${d2}T00:00:00Z`) },
        data: { note: 'legacy plaintext' },
      });
      expect(
        (await http.get(`/v1/daily-logs/${d1}`).set(user).expect(200)).body
          .note,
      ).toBe('under the old key');
      expect(
        (await http.get(`/v1/daily-logs/${d2}`).set(user).expect(200)).body
          .note,
      ).toBe('legacy plaintext');

      const result = await reencryptAll(prisma, app.get(FieldCipherService));
      expect(result.dailyLogs).toBeGreaterThanOrEqual(2);
      const rows = await prisma.dailyLog.findMany({
        where: { userId: user.id },
      });
      for (const r of rows.filter((x) => x.note))
        expect(r.note).toMatch(/^enc1\.t1\./);
      expect(
        (await http.get(`/v1/daily-logs/${d1}`).set(user).expect(200)).body
          .note,
      ).toBe('under the old key');
      expect(
        (await http.get(`/v1/daily-logs/${d2}`).set(user).expect(200)).body
          .note,
      ).toBe('legacy plaintext');
      // Idempotent.
      const again = await reencryptAll(prisma, app.get(FieldCipherService));
      expect(again.dailyLogs).toBe(0);
    });

    it('a tampered ciphertext is a generic 500, never the stored value', async () => {
      const user = await signUp(app);
      await grantHealthConsent(app, user);
      const date = daysAgo(5);
      await http
        .put(`/v1/daily-logs/${date}`)
        .set(user)
        .send({ symptoms: [], note: 'x' })
        .expect(200);
      await prisma.dailyLog.updateMany({
        where: { userId: user.id },
        data: { note: 'enc1.t1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBB' },
      });
      const res = await http
        .get(`/v1/daily-logs/${date}`)
        .set(user)
        .expect(500);
      expect(res.body.error).toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      });
      expect(JSON.stringify(res.body)).not.toContain('enc1');
    });
  });

  describe('logs and errors', () => {
    it('a failed sign-in logs neither the email nor the password', async () => {
      const email = `probe-${randomUUID()}@example.org`;
      const output = await captureOutput(() =>
        http
          .post('/v1/auth/sign-in/email')
          .send({ email, password: 'wrong-but-secret-password-123' }),
      );
      expect(output).not.toContain(email);
      expect(output).not.toContain('wrong-but-secret-password-123');
    });

    it('a 500 logs only the route, error class and request id, and answers generically', async () => {
      let res!: request.Response;
      const output = await captureOutput(async () => {
        res = await http
          .get('/v1/protection-probe')
          .set('Authorization', 'Bearer this-bearer-value-must-not-be-logged');
      });
      expect(res.status).toBe(500);
      expect(res.body.error).toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      });
      for (const text of [output, JSON.stringify(res.body)]) {
        expect(text).not.toMatch(
          /Bleeding|AbCdEfGhIjKlMnOp|jane\.probe|this-bearer-value/,
        );
      }
      expect(output).toContain(res.body.error.requestId);
      expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|\.ts:\d+/);
    });

    it('a constraint violation answers without SQL, Prisma codes or table names', async () => {
      const editor = await staffUser(app, prisma, 'content_editor');
      const draft = {
        slug: `dup-${Date.now()}`,
        locale: 'en',
        title: 'T',
        summary: 'S',
        body: 'B',
        references: [{ title: 'NICE', url: 'https://www.nice.org.uk/' }],
        premium: false,
      };
      await http.post('/v1/admin/articles').set(editor).send(draft).expect(201);
      const dup = await http.post('/v1/admin/articles').set(editor).send(draft);
      expect(dup.status).toBe(409);
      expect(JSON.stringify(dup.body)).not.toMatch(
        /P20\d\d|Unique constraint|articles_|INSERT|SELECT|prisma/i,
      );
    });
  });

  describe('deletion', () => {
    it('leaves no row that references the deleted person', async () => {
      const user = await pregnantUser(app, 30);
      await http
        .put(`/v1/daily-logs/${daysAgo(1)}`)
        .set(user)
        .send({ symptoms: ['headache'] })
        .expect(200);
      await http.post('/v1/kick-counts/sessions').set(user).expect(201);
      await http
        .post('/v1/reminders')
        .set(user)
        .send({
          kind: 'daily_log',
          localTime: '20:00',
          recurrence: 'FREQ=DAILY',
          channel: 'none',
        })
        .expect(201);
      await http
        .post('/v1/symptom-checks')
        .set(user)
        .send({ symptoms: ['headache'] })
        .expect(200);
      await http.post('/v1/me/export').set(user).expect(200);
      await http
        .post('/v1/me/deletion')
        .set(user)
        .send({ confirm: 'DELETE MY ACCOUNT' })
        .expect(204);

      // One query: Postgres builds each count with format('%I'), which quotes identifiers,
      // and the user id is a bind parameter. No string-built SQL on the client.
      const rows = await prisma.$queryRaw<
        { table_name: string; column_name: string; n: number }[]
      >`
        SELECT c.table_name, c.column_name,
          (xpath('/row/n/text()', query_to_xml(
            format('SELECT count(*) AS n FROM %I WHERE %I::text = %L', c.table_name, c.column_name, ${user.id}::text),
            false, true, '')))[1]::text::int AS n
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = 'public'
          AND c.column_name IN ('user_id', 'actor_user_id', 'target_id', 'linked_user_id', 'id')
          AND c.data_type IN ('uuid', 'text')
          AND c.table_name NOT LIKE '\_prisma%'`;
      expect(rows.length).toBeGreaterThan(20);
      const remaining = rows
        .filter((r) => r.n > 0)
        .map((r) => `${r.table_name}.${r.column_name}`);
      expect(remaining).toEqual([]);
      // A deletion receipt survives without a link.
      expect(
        await prisma.privacyJob.count({
          where: { kind: 'deletion', userId: null, status: 'completed' },
        }),
      ).toBeGreaterThan(0);
    });
  });

  describe('retention', () => {
    it('purges expired guests (with their data), old deliveries, expired tokens and stale counters only', async () => {
      const { RetentionService } =
        await import('../../src/privacy/retention.service.js');
      const retention = app.get(RetentionService);
      const expired = await prisma.anonymousSession.create({
        data: {
          credentialHash: randomUUID(),
          platform: 'web',
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      await prisma.dailyLog.create({
        data: {
          anonymousSessionId: expired.id,
          date: new Date('2026-01-01'),
          symptoms: [],
        },
      });
      const live = await prisma.anonymousSession.create({
        data: {
          credentialHash: randomUUID(),
          platform: 'web',
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      const staleKey = `ip:retention-${randomUUID()}`;
      const lockedKey = `ip:retention-locked-${randomUUID()}`;
      await prisma.authThrottle.create({
        data: {
          key: staleKey,
          failures: 1,
          updatedAt: new Date(Date.now() - 2 * 86_400_000),
        },
      });
      await prisma.authThrottle.create({
        data: {
          key: lockedKey,
          failures: 9,
          updatedAt: new Date(Date.now() - 2 * 86_400_000),
          lockedUntil: new Date(Date.now() + 3_600_000),
        },
      });
      const token = await prisma.authVerification.create({
        data: {
          identifier: `retention-${randomUUID()}`,
          value: 'x',
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const result = await retention.purge();
      expect(result.anonymousSessions).toBeGreaterThanOrEqual(1);
      expect(
        await prisma.anonymousSession.findUnique({ where: { id: expired.id } }),
      ).toBeNull();
      expect(
        await prisma.dailyLog.count({
          where: { anonymousSessionId: expired.id },
        }),
      ).toBe(0);
      expect(
        await prisma.anonymousSession.findUnique({ where: { id: live.id } }),
      ).not.toBeNull();
      expect(
        await prisma.authThrottle.findUnique({ where: { key: staleKey } }),
      ).toBeNull();
      expect(
        await prisma.authThrottle.findUnique({ where: { key: lockedKey } }),
      ).not.toBeNull();
      expect(
        await prisma.authVerification.findUnique({ where: { id: token.id } }),
      ).toBeNull();
    });
  });
});
