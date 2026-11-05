import { Injectable } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}

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
}
