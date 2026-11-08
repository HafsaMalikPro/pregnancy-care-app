import type { ConfigService } from '@nestjs/config';
import type { Owner } from '../auth/owner.js';
import type { Env } from '../config/env.js';
import type { PrismaService } from '../database/prisma.service.js';
import { EntitlementsService } from './entitlements.service.js';

const NOW = new Date('2026-10-18T12:00:00Z');
const later = new Date('2026-11-18T12:00:00Z');
const earlier = new Date('2026-09-18T12:00:00Z');

const userOwner = { kind: 'user', id: 'u1', user: {} } as Owner;

function service(subs: object[], locks = true) {
  const findMany = vi.fn().mockResolvedValue(subs);
  const config = { get: () => locks } as unknown as ConfigService<Env, true>;
  return {
    svc: new EntitlementsService(
      { subscription: { findMany } } as unknown as PrismaService,
      config,
    ),
    findMany,
  };
}

describe('EntitlementsService', () => {
  it('gives anonymous sessions nothing without querying', async () => {
    const { svc, findMany } = service([]);
    const anon = { kind: 'anonymous', id: 'a', expiresAt: NOW } as Owner;
    await expect(svc.forOwner(anon, NOW)).resolves.toEqual({
      premium: false,
      status: 'none',
      expiresAt: null,
      locksEnabled: true,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('is none without subscriptions', async () => {
    await expect(
      service([]).svc.forOwner(userOwner, NOW),
    ).resolves.toMatchObject({ status: 'none' });
  });

  it.each([
    ['active', later, true, 'active'],
    ['grace_period', later, true, 'grace_period'],
    ['active', null, true, 'active'],
    ['active', earlier, false, 'expired'],
    ['expired', earlier, false, 'expired'],
    ['revoked', later, false, 'revoked'],
  ])('%s ending %s → premium=%s (%s)', async (state, end, premium, status) => {
    const { svc } = service([{ state, currentPeriodEnd: end }]);
    await expect(svc.forOwner(userOwner, NOW)).resolves.toMatchObject({
      premium,
      status,
    });
  });

  it('prefers any live subscription over a newer revoked one', async () => {
    const { svc } = service([
      { state: 'revoked', currentPeriodEnd: later },
      { state: 'active', currentPeriodEnd: later },
    ]);
    await expect(svc.isPremium(userOwner)).resolves.toBe(true);
  });

  describe('FEATURE_PREMIUM_LOCKS', () => {
    it('unlocks everything for everyone while off (the default)', async () => {
      const { svc, findMany } = service([], false);
      expect(svc.locksEnabled).toBe(false);
      await expect(svc.canAccessPremium(userOwner)).resolves.toBe(true);
      await expect(svc.canAccessPremium(undefined)).resolves.toBe(true);
      expect(findMany).not.toHaveBeenCalled();
      await expect(svc.forOwner(userOwner, NOW)).resolves.toMatchObject({
        premium: false,
        locksEnabled: false,
      });
    });

    it('requires a live entitlement while on', async () => {
      const { svc } = service([], true);
      await expect(svc.canAccessPremium(userOwner)).resolves.toBe(false);
      await expect(svc.canAccessPremium(undefined)).resolves.toBe(false);
      const live = service(
        [
          {
            state: 'active',
            currentPeriodEnd: new Date(Date.now() + 86_400_000),
          },
        ],
        true,
      );
      await expect(live.svc.canAccessPremium(userOwner)).resolves.toBe(true);
    });
  });
});
