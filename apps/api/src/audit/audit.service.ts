import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';

export interface AuditEntry {
  action: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  /** Identifiers and flags only. Never cycle dates, symptoms, notes or other health values. */
  metadata?: Record<string, string | number | boolean | null>;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * A keyed pseudonym for a personal value (an email, an IP, a deleted user's id), so audit and
   * security rows can be correlated without storing the value. Keyed with the server secret:
   * someone holding it can check whether a known value matches, nobody can reverse it.
   */
  ref(kind: string, value: string): string {
    const key = this.config.get('BETTER_AUTH_SECRET', { infer: true });
    return `${kind}_${createHmac('sha256', key).update(`audit-${kind}:${value}`).digest('hex').slice(0, 32)}`;
  }

  /** The pseudonym recorded for a deleted account (see PrivacyService.deleteAccount). */
  subjectRef(userId: string): string {
    return this.ref('sub', userId);
  }

  record(entry: AuditEntry, tx: Prisma.TransactionClient = this.prisma) {
    return tx.auditEvent.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        actorRole: entry.actorRole ?? null,
        targetType: entry.targetType,
        targetId: entry.targetId,
        requestId: entry.requestId,
        metadata: entry.metadata ?? {},
      },
    });
  }

  /**
   * Whether `actorUserId` performed any of `actions` on the target (after `since`, if given).
   * Backs separation-of-duties checks: the audit row is written in the same transaction as
   * the change it records, so it is a reliable record of who authored or edited content.
   */
  async touched(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    targetType: string,
    targetId: string,
    actions: string[],
    since?: Date,
  ): Promise<boolean> {
    const found = await tx.auditEvent.findFirst({
      where: {
        actorUserId,
        targetType,
        targetId,
        action: { in: actions },
        ...(since && { createdAt: { gt: since } }),
      },
      select: { id: true },
    });
    return found !== null;
  }
}
