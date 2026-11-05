import type { Owner } from '../auth/owner.js';
import type { PrismaService } from '../database/prisma.service.js';
import { EntitlementsService } from './entitlements.service.js';

const NOW = new Date('2026-10-18T12:00:00Z');
const later = new Date('2026-11-18T12:00:00Z');
const earlier = new Date('2026-09-18T12:00:00Z');

const userOwner = { kind: 'user', id: 'u1', user: {} } as Owner;

function service(subs: object[]) {
  const findMany = vi.fn().mockResolvedValue(subs);
  return {
    svc: new EntitlementsService({
      subscription: { findMany },
    } as unknown as PrismaService),
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
});
