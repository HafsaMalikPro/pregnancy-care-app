import { createHmac } from 'node:crypto';
import type { PrismaService } from '../database/prisma.service.js';

/**
 * TOTP replay protection (security finding F-01). Better Auth 1.7 accepts a valid code again
 * within its window (±1 30-second step), so a code seen by an attacker who also has the password
 * could sign in a second time.
 *
 * Before Better Auth checks a code, the (user, code) pair is reserved in
 * `two_factor_used_codes`. The primary key makes the reservation atomic: of two concurrent
 * requests with the same code, only one proceeds. A reservation for a code that turns out to be
 * wrong is released, so a typo never blocks the right code. Accepted codes stay reserved for
 * TOTP_REPLAY_TTL_SECONDS, longer than any code stays valid (about 90 s).
 */
export const TOTP_REPLAY_TTL_SECONDS = 180;

export class TotpReplayGuard {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secret: string,
  ) {}

  /** Keyed digest: the table never holds a user id next to a code. */
  key(userId: string, code: string): string {
    return createHmac('sha256', this.secret)
      .update(`totp-used:${userId}:${code.replace(/\s/g, '')}`)
      .digest('hex');
  }

  /** True when this request now holds the reservation; false when the code was already used. */
  async reserve(userId: string, code: string): Promise<boolean> {
    const key = this.key(userId, code);
    // An expired reservation is taken over; an active one is not.
    const rows = await this.prisma.$queryRaw<{ code_hash: string }[]>`
      INSERT INTO two_factor_used_codes (code_hash, expires_at)
      VALUES (${key}, now() + make_interval(secs => ${TOTP_REPLAY_TTL_SECONDS}))
      ON CONFLICT (code_hash) DO UPDATE
        SET expires_at = EXCLUDED.expires_at, created_at = now()
        WHERE two_factor_used_codes.expires_at <= now()
      RETURNING code_hash`;
    return rows.length === 1;
  }

  /** Releases a reservation whose code Better Auth rejected. */
  async release(userId: string, code: string): Promise<void> {
    await this.prisma.twoFactorUsedCode.deleteMany({
      where: { codeHash: this.key(userId, code) },
    });
  }
}
