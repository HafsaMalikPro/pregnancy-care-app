import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';

const DAY = 86_400_000;

/**
 * Retention periods (docs/DEPLOYMENT_SECURITY.md, "Retention"). Audit events are not purged:
 * the table is append-only, and its legal retention period is a decision for the data
 * controller (see docs/SECURITY_CHECKLIST.md, open items).
 */
export const RETENTION = {
  /** Finished reminder deliveries (sent, failed, skipped, cancelled). */
  reminderDeliveriesDays: 90,
  /** Completed or failed privacy jobs (export/deletion receipts). */
  privacyJobsDays: 3 * 365,
  /** Sign-in lockout counters with no lock running. */
  authThrottlesDays: 1,
} as const;

export interface PurgeResult {
  anonymousSessions: number;
  reminderDeliveries: number;
  authSessions: number;
  authVerifications: number;
  authThrottles: number;
  privacyJobs: number;
}

/** Deletes data past its retention period. Runs every RETENTION_PURGE_INTERVAL_MS (0 = off). */
@Injectable()
export class RetentionService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('Retention');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap() {
    const interval = this.config.get('RETENTION_PURGE_INTERVAL_MS', {
      infer: true,
    });
    if (!interval) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = this.purge()
        .then((r) => this.logger.log(`purge ${JSON.stringify(r)}`))
        .catch((err: unknown) =>
          this.logger.error(`purge failed: ${(err as Error).name}`),
        )
        .finally(() => {
          this.running = null;
        });
    }, interval);
    this.timer.unref();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }

  async purge(now = new Date()): Promise<PurgeResult> {
    const before = (days: number) => new Date(now.getTime() - days * DAY);
    const [
      anonymousSessions,
      reminderDeliveries,
      authSessions,
      authVerifications,
      authThrottles,
      privacyJobs,
    ] = await Promise.all([
      // Cascades to the guest's records (single-owner foreign keys).
      this.prisma.anonymousSession.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.reminderDelivery.deleteMany({
        where: {
          status: { in: ['sent', 'failed', 'skipped', 'cancelled'] },
          scheduledFor: { lt: before(RETENTION.reminderDeliveriesDays) },
        },
      }),
      this.prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } }),
      this.prisma.authVerification.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.authThrottle.deleteMany({
        where: {
          updatedAt: { lt: before(RETENTION.authThrottlesDays) },
          OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
        },
      }),
      this.prisma.privacyJob.deleteMany({
        where: {
          status: { in: ['completed', 'failed', 'cancelled'] },
          requestedAt: { lt: before(RETENTION.privacyJobsDays) },
        },
      }),
    ]);
    return {
      anonymousSessions: anonymousSessions.count,
      reminderDeliveries: reminderDeliveries.count,
      authSessions: authSessions.count,
      authVerifications: authVerifications.count,
      authThrottles: authThrottles.count,
      privacyJobs: privacyJobs.count,
    };
  }
}
