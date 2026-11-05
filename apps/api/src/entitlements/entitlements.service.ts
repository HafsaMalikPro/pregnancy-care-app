import { Injectable } from '@nestjs/common';
import type { Entitlement } from '@preconception/contracts';
import type { Owner } from '../auth/owner.js';
import { PrismaService } from '../database/prisma.service.js';

const NONE: Entitlement = { premium: false, status: 'none', expiresAt: null };

/**
 * Premium status comes only from verified `subscriptions` rows, never from the client.
 * Anonymous sessions cannot hold subscriptions.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async forOwner(owner: Owner, now = new Date()): Promise<Entitlement> {
    if (owner.kind !== 'user') return NONE;
    const subs = await this.prisma.subscription.findMany({
      where: { userId: owner.id },
      orderBy: [{ currentPeriodEnd: { sort: 'desc', nulls: 'first' } }],
    });
    const live = subs.find(
      (s) =>
        (s.state === 'active' || s.state === 'grace_period') &&
        (!s.currentPeriodEnd || s.currentPeriodEnd > now),
    );
    if (live) {
      return {
        premium: true,
        status: live.state,
        expiresAt: live.currentPeriodEnd?.toISOString() ?? null,
      };
    }
    const latest = subs[0];
    if (!latest) return NONE;
    // An active row whose period has passed without renewal reads as expired.
    const status =
      latest.state === 'active' || latest.state === 'grace_period'
        ? 'expired'
        : latest.state;
    return {
      premium: false,
      status,
      expiresAt: latest.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  async isPremium(owner: Owner): Promise<boolean> {
    return (await this.forOwner(owner)).premium;
  }
}
