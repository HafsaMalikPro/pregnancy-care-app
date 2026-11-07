import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AnonymousSessionCreated,
  Platform,
} from '@preconception/contracts';
import { AuditService } from '../audit/audit.service.js';
import { CodedConflictException } from '../common/errors.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import {
  generateAnonymousSecret,
  hashAnonymousSecret,
} from './anonymous-credentials.js';

export interface LinkResult {
  pregnancies: number;
  cycles: number;
  dailyLogs: number;
  taskProgress: number;
  consentRecords: number;
  reminders: number;
  profile: boolean;
}

@Injectable()
export class AnonymousSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(platform: Platform): Promise<AnonymousSessionCreated> {
    const secret = generateAnonymousSecret();
    const ttlDays = this.config.get('ANONYMOUS_SESSION_TTL_DAYS', {
      infer: true,
    });
    const session = await this.prisma.anonymousSession.create({
      data: {
        credentialHash: hashAnonymousSecret(secret),
        platform,
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
    });
    return {
      id: session.id,
      secret,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /** Deletes the session and, by cascade, every record it owns. */
  async delete(id: string, requestId?: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.anonymousSession.delete({ where: { id } });
      await this.audit.record(
        {
          action: 'anonymous_session.deleted',
          targetType: 'anonymous_session',
          targetId: id,
          requestId,
        },
        tx,
      );
    });
  }

  /**
   * Moves an anonymous session's records into a registered account. Refuses when the account
   * already holds health data: silently merging two cycle histories could corrupt both.
   */
  async link(
    userId: string,
    secret: string,
    requestId?: string,
  ): Promise<LinkResult> {
    return this.prisma.$transaction(async (tx) => {
      // Serialise links into the same account, so two guest sessions linked at once can't
      // both pass the "no health data yet" check below.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const anon = await tx.anonymousSession.findUnique({
        where: { credentialHash: hashAnonymousSecret(secret) },
      });
      // Claim the session atomically: a concurrent link of the same session blocks on the row
      // lock, then matches nothing because linkedUserId is already set.
      const claimed = anon
        ? await tx.anonymousSession.updateMany({
            where: {
              id: anon.id,
              linkedUserId: null,
              expiresAt: { gt: new Date() },
            },
            data: { linkedUserId: userId, linkedAt: new Date() },
          })
        : { count: 0 };
      if (!anon || claimed.count !== 1) {
        throw new NotFoundException('Anonymous session not found.');
      }

      const owned = { userId };
      const counts = await Promise.all([
        tx.pregnancy.count({ where: owned }),
        tx.cycle.count({ where: owned }),
        tx.dailyLog.count({ where: owned }),
        tx.userTaskProgress.count({ where: owned }),
        tx.appointment.count({ where: owned }),
        tx.mealLog.count({ where: owned }),
        tx.activityLog.count({ where: owned }),
        tx.planTaskCompletion.count({ where: owned }),
      ]);
      if (counts.some((n) => n > 0)) {
        // Thrown inside the transaction, so the claim above rolls back: the guest secret
        // keeps working and the client can offer "keep guest data" or "export".
        throw new CodedConflictException(
          'ACCOUNT_HAS_HEALTH_DATA',
          'This account already has health data; merging an anonymous history is not supported.',
        );
      }

      const from = { anonymousSessionId: anon.id };
      const to = { userId, anonymousSessionId: null };
      const result: LinkResult = {
        pregnancies: (await tx.pregnancy.updateMany({ where: from, data: to }))
          .count,
        cycles: (await tx.cycle.updateMany({ where: from, data: to })).count,
        dailyLogs: (await tx.dailyLog.updateMany({ where: from, data: to }))
          .count,
        taskProgress: (
          await tx.userTaskProgress.updateMany({ where: from, data: to })
        ).count,
        consentRecords: (
          await tx.consentRecord.updateMany({ where: from, data: to })
        ).count,
        reminders: (await tx.reminder.updateMany({ where: from, data: to }))
          .count,
        profile: false,
      };
      // Planning data moves with the health data. Saved items and shopping-list entries the
      // account already has win over the guest's duplicates (both are per-owner unique).
      await tx.appointment.updateMany({ where: from, data: to });
      await tx.mealLog.updateMany({ where: from, data: to });
      await tx.activityLog.updateMany({ where: from, data: to });
      await tx.planTaskCompletion.updateMany({ where: from, data: to });
      const [savedSlugs, shoppingNames] = await Promise.all([
        tx.savedContent.findMany({
          where: owned,
          select: { kind: true, slug: true },
        }),
        tx.shoppingItem.findMany({ where: owned, select: { name: true } }),
      ]);
      if (savedSlugs.length) {
        await tx.savedContent.deleteMany({
          where: {
            ...from,
            OR: savedSlugs.map((x) => ({ kind: x.kind, slug: x.slug })),
          },
        });
      }
      if (shoppingNames.length) {
        await tx.shoppingItem.deleteMany({
          where: { ...from, name: { in: shoppingNames.map((x) => x.name) } },
        });
      }
      await tx.savedContent.updateMany({ where: from, data: to });
      await tx.shoppingItem.updateMany({ where: from, data: to });

      const userProfile = await tx.profile.findUnique({ where: { userId } });
      if (userProfile) {
        await tx.profile.deleteMany({ where: from });
      } else {
        result.profile =
          (await tx.profile.updateMany({ where: from, data: to })).count > 0;
      }

      await this.audit.record(
        {
          action: 'anonymous_session.linked',
          actorUserId: userId,
          targetType: 'anonymous_session',
          targetId: anon.id,
          requestId,
        },
        tx,
      );
      return result;
    });
  }
}
