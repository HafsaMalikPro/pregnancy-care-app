// owner-scope-file: maintenance job. It rewrites every owner's encrypted columns in place
// (same row, same owner) and never returns data to a caller.
import { ENCRYPTED_COLUMNS as C, type FieldCipher } from './field-cipher.js';
import type { PrismaService } from './prisma.service.js';

export interface ReencryptResult {
  dailyLogs: number;
  taskProgress: number;
  appointments: number;
  birthPreferences: number;
}

const BATCH = 200;

/**
 * Brings every encrypted column to the active key: encrypts legacy plaintext and re-encrypts
 * values under older keys. Idempotent and resumable (rows already under the active key are
 * skipped). Used by `scripts/reencrypt-fields.mjs` after enabling encryption or rotating keys.
 */
export async function reencryptAll(
  prisma: PrismaService,
  cipher: FieldCipher,
): Promise<ReencryptResult> {
  if (!cipher.enabled)
    throw new Error('Field encryption is off: set FIELD_ENCRYPTION_ACTIVE_KEY');
  const rewrite = (
    v: string | null,
    column: Parameters<FieldCipher['decrypt']>[1],
  ) =>
    cipher.needsRewrite(v)
      ? cipher.encrypt(cipher.decrypt(v, column), column)
      : v;
  const result: ReencryptResult = {
    dailyLogs: 0,
    taskProgress: 0,
    appointments: 0,
    birthPreferences: 0,
  };

  for (let cursor: string | undefined; ;) {
    const rows = await prisma.dailyLog.findMany({
      select: { id: true, note: true, questions: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    for (const r of rows) {
      if (cipher.needsRewrite(r.note) || cipher.needsRewrite(r.questions)) {
        await prisma.dailyLog.update({
          where: { id: r.id },
          data: {
            note: rewrite(r.note, C.dailyLogNote),
            questions: rewrite(r.questions, C.dailyLogQuestions),
          },
        });
        result.dailyLogs++;
      }
    }
    if (rows.length < BATCH) break;
    cursor = rows.at(-1)!.id;
  }

  for (let cursor: string | undefined; ;) {
    const rows = await prisma.userTaskProgress.findMany({
      select: { id: true, note: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    for (const r of rows) {
      if (cipher.needsRewrite(r.note)) {
        await prisma.userTaskProgress.update({
          where: { id: r.id },
          data: { note: rewrite(r.note, C.taskNote) },
        });
        result.taskProgress++;
      }
    }
    if (rows.length < BATCH) break;
    cursor = rows.at(-1)!.id;
  }

  for (let cursor: string | undefined; ;) {
    const rows = await prisma.appointment.findMany({
      select: { id: true, notes: true, questions: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    for (const r of rows) {
      if (
        cipher.needsRewrite(r.notes) ||
        r.questions.some((q) => cipher.needsRewrite(q))
      ) {
        await prisma.appointment.update({
          where: { id: r.id },
          data: {
            notes: rewrite(r.notes, C.appointmentNotes),
            questions: r.questions.map((q) =>
              rewrite(q, C.appointmentQuestions)!,
            ),
          },
        });
        result.appointments++;
      }
    }
    if (rows.length < BATCH) break;
    cursor = rows.at(-1)!.id;
  }

  for (let cursor: string | undefined; ;) {
    const rows = await prisma.birthPreferences.findMany({
      select: { id: true, notes: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    for (const r of rows) {
      if (cipher.needsRewrite(r.notes)) {
        await prisma.birthPreferences.update({
          where: { id: r.id },
          data: { notes: rewrite(r.notes, C.birthNotes) },
        });
        result.birthPreferences++;
      }
    }
    if (rows.length < BATCH) break;
    cursor = rows.at(-1)!.id;
  }
  return result;
}
