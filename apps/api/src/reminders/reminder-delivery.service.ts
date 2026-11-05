import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  EMAIL_SENDER,
  EmailSendError,
  type EmailSender,
} from '../email/email-sender.js';
import { reminderEmail } from '../email/templates.js';
import { ReminderScheduleService } from './reminder-schedule.service.js';

/** Occurrences more than this late (e.g. after an outage) are skipped, not sent. */
export const MAX_LATENESS_MS = 60 * 60_000;
export const MAX_ATTEMPTS = 5;
/** Wait before attempt n+1 after a retryable failure on attempt n. */
export const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
/** A send claimed this long ago without finishing is assumed lost (process crash). */
export const STUCK_AFTER_MS = 10 * 60_000;
const BATCH = 50;

export interface TickResult {
  queued: number;
  skipped: number;
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
  recovered: number;
}

/**
 * Postgres-backed reminder delivery, run inside the API process:
 *
 * 1. schedule: due reminders (next_run_at <= now) are locked with SKIP LOCKED, a delivery row
 *    is inserted for that occurrence (unique per reminder + time, so it is never queued
 *    twice) and next_run_at moves to the following occurrence;
 * 2. dispatch: pending deliveries are claimed with SKIP LOCKED, re-checked against the
 *    current reminder and account, and sent; retryable failures back off and retry.
 *
 * Several API instances can run it at once. Delivery is at-least-once: a crash between the
 * provider accepting a message and the row being marked sent can repeat that one email.
 */
@Injectable()
export class ReminderDeliveryService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('ReminderDelivery');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: ReminderScheduleService,
    private readonly config: ConfigService<Env, true>,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  onApplicationBootstrap() {
    if (!this.schedule.emailDeliveryAvailable) return;
    const interval = this.config.get('REMINDER_POLL_INTERVAL_MS', {
      infer: true,
    });
    this.timer = setInterval(() => void this.runOnce(), interval);
    this.timer.unref();
    this.logger.log(`Reminder delivery running every ${interval} ms`);
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    // Let an in-flight tick finish so claimed rows are not left in `sending`.
    await this.running;
  }

  private async runOnce() {
    if (this.running) return;
    this.running = this.tick()
      .then((r) => {
        if (
          r.queued + r.sent + r.retried + r.failed + r.skipped + r.recovered >
          0
        ) {
          this.logger.log(`tick ${JSON.stringify(r)}`);
        }
      })
      .catch((err: unknown) => {
        this.logger.error(`tick failed: ${(err as Error).name}`);
      })
      .finally(() => {
        this.running = null;
      });
    await this.running;
  }

  /** One scheduling and sending pass. Public so tests and operators can drive it. */
  async tick(now = new Date()): Promise<TickResult> {
    const result: TickResult = {
      queued: 0,
      skipped: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      cancelled: 0,
      recovered: 0,
    };
    result.recovered = await this.recoverStuck(now);
    await this.scheduleDue(now, result);
    await this.dispatch(now, result);
    return result;
  }

  private async recoverStuck(now: Date): Promise<number> {
    const { count } = await this.prisma.reminderDelivery.updateMany({
      where: {
        status: 'sending',
        updatedAt: { lt: new Date(now.getTime() - STUCK_AFTER_MS) },
      },
      data: {
        status: 'pending',
        nextAttemptAt: now,
        lastErrorCode: 'RECOVERED',
      },
    });
    return count;
  }

  private async scheduleDue(now: Date, result: TickResult) {
    await this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM reminders
        WHERE channel = 'email' AND enabled AND next_run_at <= ${now}
        ORDER BY next_run_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`;
      if (due.length === 0) return;
      const reminders = await tx.reminder.findMany({
        where: { id: { in: due.map((d) => d.id) } },
      });
      const zones = new Map<string, string>();
      for (const r of reminders) {
        if (!r.userId || !r.nextRunAt) continue;
        const late = now.getTime() - r.nextRunAt.getTime() > MAX_LATENESS_MS;
        const created = await tx.reminderDelivery.createMany({
          data: [
            {
              reminderId: r.id,
              scheduledFor: r.nextRunAt,
              channel: r.channel,
              status: late ? 'skipped' : 'pending',
              lastErrorCode: late ? 'TOO_LATE' : null,
              nextAttemptAt: now,
            },
          ],
          skipDuplicates: true,
        });
        if (created.count > 0) {
          if (late) result.skipped++;
          else result.queued++;
        }
        let zone = zones.get(r.userId);
        if (!zone) {
          zone = await this.schedule.timeZoneFor(r.userId, tx);
          zones.set(r.userId, zone);
        }
        await tx.reminder.update({
          where: { id: r.id },
          data: { nextRunAt: this.schedule.nextRunAt(r, zone, now) },
        });
      }
    });
  }

  private async dispatch(now: Date, result: TickResult) {
    const claimed = await this.prisma.$queryRaw<
      { id: string; reminder_id: string; attempts: number }[]
    >`
      UPDATE reminder_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = ${now}
      WHERE id IN (
        SELECT id FROM reminder_deliveries
        WHERE status = 'pending' AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, reminder_id, attempts`;

    for (const d of claimed) {
      await this.deliver(d.id, d.reminder_id, d.attempts, now, result);
    }
  }

  private async deliver(
    id: string,
    reminderId: string,
    attempts: number,
    now: Date,
    result: TickResult,
  ) {
    const reminder = await this.prisma.reminder.findUnique({
      where: { id: reminderId },
      include: {
        user: { select: { email: true, emailVerified: true, status: true } },
      },
    });
    const finish = (data: {
      status: 'sent' | 'failed' | 'skipped' | 'cancelled' | 'pending';
      lastErrorCode?: string | null;
      nextAttemptAt?: Date;
      providerMessageId?: string | null;
      sentAt?: Date;
    }) => this.prisma.reminderDelivery.updateMany({ where: { id }, data });

    // Paused, switched to in-app or deleted since it was queued.
    if (!reminder || !reminder.enabled || reminder.channel !== 'email') {
      await finish({ status: 'cancelled', lastErrorCode: 'REMINDER_CHANGED' });
      result.cancelled++;
      return;
    }
    const user = reminder.user;
    if (!user || user.status !== 'active' || !user.emailVerified) {
      await finish({ status: 'skipped', lastErrorCode: 'EMAIL_UNVERIFIED' });
      result.skipped++;
      return;
    }

    try {
      const sent = await this.email.send(
        reminderEmail(
          user.email,
          reminder.kind,
          reminder.label,
          this.config.get('APP_URL', { infer: true }).replace(/\/$/, ''),
        ),
      );
      await finish({
        status: 'sent',
        sentAt: new Date(),
        providerMessageId: sent.id,
        lastErrorCode: null,
      });
      result.sent++;
    } catch (err) {
      const code = err instanceof EmailSendError ? err.code : 'UNEXPECTED';
      const retryable = err instanceof EmailSendError && err.retryable;
      if (retryable && attempts < MAX_ATTEMPTS) {
        const wait = BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];
        await finish({
          status: 'pending',
          lastErrorCode: code,
          nextAttemptAt: new Date(now.getTime() + wait),
        });
        result.retried++;
      } else {
        await finish({ status: 'failed', lastErrorCode: code });
        result.failed++;
        this.logger.warn(
          `delivery ${id} failed after ${attempts} attempt(s): ${code}`,
        );
      }
    }
  }

  /** Counts by status for the last day, for operators. No content or addresses. */
  async stats(now = new Date()) {
    const since = new Date(now.getTime() - 24 * 60 * 60_000);
    const grouped = await this.prisma.reminderDelivery.groupBy({
      by: ['status'],
      where: { scheduledFor: { gte: since } },
      _count: { _all: true },
    });
    const oldestPending = await this.prisma.reminderDelivery.findFirst({
      where: { status: 'pending' },
      orderBy: { nextAttemptAt: 'asc' },
      select: { nextAttemptAt: true },
    });
    return {
      enabled: this.schedule.emailDeliveryAvailable,
      since: since.toISOString(),
      byStatus: Object.fromEntries(
        grouped.map((g) => [g.status, g._count._all]),
      ),
      oldestPendingAt: oldestPending?.nextAttemptAt.toISOString() ?? null,
    };
  }
}
