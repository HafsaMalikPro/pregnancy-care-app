import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { EMAIL_SENDER, type EmailSender } from '../email/email-sender.js';
import type { Prisma } from '../generated/prisma/client.js';
import { nextOccurrence } from './schedule.js';

type Db = PrismaService | Prisma.TransactionClient;

interface Schedulable {
  enabled: boolean;
  channel: 'none' | 'email';
  localTime: string;
  recurrence: string;
}

/** Keeps `reminders.next_run_at` in step with each reminder's settings and owner time zone. */
@Injectable()
export class ReminderScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
  ) {}

  /** Email delivery is switched on for this deployment and has a working provider. */
  get emailDeliveryAvailable(): boolean {
    return (
      this.config.get('REMINDER_DELIVERY_ENABLED', { infer: true }) &&
      this.email.enabled
    );
  }

  async timeZoneFor(userId: string, db: Db = this.prisma): Promise<string> {
    const profile = await db.profile.findUnique({
      where: { userId },
      select: { timeZone: true },
    });
    return profile?.timeZone ?? 'UTC';
  }

  /** Next send time, or null when nothing should be sent. */
  nextRunAt(r: Schedulable, timeZone: string, after = new Date()): Date | null {
    if (!r.enabled || r.channel !== 'email') return null;
    return nextOccurrence(after, r.localTime, r.recurrence, timeZone);
  }

  /**
   * Recomputes every email reminder of a user (after a time-zone change) and cancels queued
   * sends, so nothing goes out at the old time.
   */
  async rescheduleUser(userId: string, db: Db = this.prisma): Promise<void> {
    const timeZone = await this.timeZoneFor(userId, db);
    const reminders = await db.reminder.findMany({
      where: { userId, channel: 'email' },
    });
    for (const r of reminders) {
      await db.reminder.update({
        where: { id: r.id },
        data: { nextRunAt: this.nextRunAt(r, timeZone) },
      });
    }
    await this.cancelQueued(
      reminders.map((r) => r.id),
      'REMINDER_CHANGED',
      db,
    );
  }

  /** Marks queued (not yet sending) deliveries as cancelled. */
  cancelQueued(reminderIds: string[], code: string, db: Db = this.prisma) {
    if (reminderIds.length === 0) return Promise.resolve({ count: 0 });
    return db.reminderDelivery.updateMany({
      where: { reminderId: { in: reminderIds }, status: 'pending' },
      data: { status: 'cancelled', lastErrorCode: code },
    });
  }
}
