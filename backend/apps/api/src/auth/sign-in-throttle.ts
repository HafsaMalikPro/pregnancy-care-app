import { createHash } from 'node:crypto';
import type { PrismaService } from '../database/prisma.service.js';

/**
 * Lockout after repeated failed sign-ins, per account and per IP, on top of Better Auth's
 * per-IP request limits. Keys are digests: the raw email is never stored.
 *
 * - Account: 5 failures within 15 minutes lock that email for 1 minute, doubling with each
 *   further failure up to 30 minutes. Applied to every submitted email, registered or not,
 *   so a lockout doesn't reveal whether an account exists.
 * - IP: 50 failures within 15 minutes (many accounts, e.g. credential stuffing) lock that IP
 *   for 15 minutes, doubling up to 2 hours. Off with RATE_LIMIT_ENABLED=false (tests).
 *
 * A successful sign-in clears the account counter (not the IP counter).
 */
export const LOCKOUT = {
  windowSeconds: 15 * 60,
  account: { threshold: 5, baseSeconds: 60, maxSeconds: 30 * 60 },
  ip: { threshold: 50, baseSeconds: 15 * 60, maxSeconds: 2 * 3600 },
} as const;

type Policy = { threshold: number; baseSeconds: number; maxSeconds: number };

export const accountKey = (email: string) =>
  `acct:${createHash('sha256').update(email.trim().toLowerCase()).digest('hex')}`;
export const ipKey = (ip: string) => `ip:${ip}`;

/** Lock length after `failures` failures: 0 below the threshold, then doubling to the max. */
export function lockSeconds(failures: number, policy: Policy): number {
  if (failures < policy.threshold) return 0;
  const doublings = Math.min(failures - policy.threshold, 20);
  return Math.min(policy.baseSeconds * 2 ** doublings, policy.maxSeconds);
}

export class SignInThrottle {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ipLimits: boolean,
  ) {}

  private keys(email: string, ip: string | null) {
    const keys: { key: string; policy: Policy }[] = [
      { key: accountKey(email), policy: LOCKOUT.account },
    ];
    if (this.ipLimits && ip) keys.push({ key: ipKey(ip), policy: LOCKOUT.ip });
    return keys;
  }

  /** The latest lock expiry for this email or IP, or null when sign-in may proceed. */
  async lockedUntil(email: string, ip: string | null, now = new Date()) {
    const rows = await this.prisma.authThrottle.findMany({
      where: {
        key: { in: this.keys(email, ip).map((k) => k.key) },
        lockedUntil: { gt: now },
      },
      select: { lockedUntil: true },
    });
    const times = rows.map((r) => r.lockedUntil!.getTime());
    return times.length ? new Date(Math.max(...times)) : null;
  }

  /** Records a failure; returns the longest lock it started (seconds), or 0. */
  async recordFailure(email: string, ip: string | null): Promise<number> {
    let locked = 0;
    for (const { key, policy } of this.keys(email, ip)) {
      // Atomic: concurrent failures each count. The window restarts once it has passed and
      // no lock is running.
      const [row] = await this.prisma.$queryRaw<{ failures: number }[]>`
        INSERT INTO auth_throttles (key, failures, window_started_at, updated_at)
        VALUES (${key}, 1, now(), now())
        ON CONFLICT (key) DO UPDATE SET
          failures = CASE
            WHEN auth_throttles.window_started_at < now() - make_interval(secs => ${LOCKOUT.windowSeconds})
             AND (auth_throttles.locked_until IS NULL OR auth_throttles.locked_until <= now())
            THEN 1 ELSE auth_throttles.failures + 1 END,
          window_started_at = CASE
            WHEN auth_throttles.window_started_at < now() - make_interval(secs => ${LOCKOUT.windowSeconds})
             AND (auth_throttles.locked_until IS NULL OR auth_throttles.locked_until <= now())
            THEN now() ELSE auth_throttles.window_started_at END,
          updated_at = now()
        RETURNING failures`;
      const seconds = lockSeconds(row.failures, policy);
      if (seconds > 0) {
        locked = Math.max(locked, seconds);
        await this.prisma.$executeRaw`
          UPDATE auth_throttles
          SET locked_until = now() + make_interval(secs => ${seconds})
          WHERE key = ${key}`;
      }
    }
    return locked;
  }

  async recordSuccess(email: string): Promise<void> {
    await this.prisma.authThrottle.deleteMany({
      where: { key: accountKey(email) },
    });
  }
}
