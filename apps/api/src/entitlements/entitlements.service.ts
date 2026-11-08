import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Entitlement } from '@preconception/contracts';
import type { Owner } from '../auth/owner.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';

type Status = Omit<Entitlement, 'locksEnabled'>;
const NONE: Status = { premium: false, status: 'none', expiresAt: null };

/**
 * Premium status comes only from verified `subscriptions` rows, never from the client.
 * Anonymous sessions cannot hold subscriptions.
 */
@Injectable()
export class EntitlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** FEATURE_PREMIUM_LOCKS. Off (the default): nothing is ever locked. */
  get locksEnabled(): boolean {
    return this.config.get('FEATURE_PREMIUM_LOCKS', { infer: true });
  }

  async forOwner(owner: Owner, now = new Date()): Promise<Entitlement> {
    return {
      ...(await this.subscriptionStatus(owner, now)),
      locksEnabled: this.locksEnabled,
    };
  }

  private async subscriptionStatus(owner: Owner, now: Date): Promise<Status> {
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

  /**
   * Whether premium-marked content is unlocked for this caller: always while locks are off,
   * otherwise only with an active entitlement. Use this for every gate.
   */
  async canAccessPremium(owner: Owner | undefined): Promise<boolean> {
    if (!this.locksEnabled) return true;
    return owner ? this.isPremium(owner) : false;
  }
}
