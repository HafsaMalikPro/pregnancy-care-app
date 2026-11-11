import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { BREACHED_PASSWORDS } from './breached-passwords.data.js';

/**
 * Password hashing (scrypt), replacing Better Auth's default.
 *
 * Parameters follow the OWASP Password Storage Cheat Sheet's scrypt options of equal strength:
 * N=2^17,r=8,p=1 | N=2^16,r=8,p=2 | N=2^15,r=8,p=3 | N=2^14,r=8,p=5 | N=2^13,r=8,p=10.
 * We use N=2^15, r=8, p=3: 32 MiB per hash (128·N·r bytes), so four concurrent hashes on the
 * libuv pool stay at 128 MiB, while the CPU cost matches the 128 MiB option.
 *
 * Better Auth 1.7's default is N=2^14, r=16, p=1 (same memory, a third of the work) and
 * compares with `===`. Hashes in that legacy form ("salt:key") still verify, using its
 * parameters and a constant-time comparison, and are upgraded on the next successful
 * sign-in (see better-auth.ts) or password change.
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<salt hex>$<key hex>`.
 */
export const SCRYPT = {
  N: 2 ** 15,
  r: 8,
  p: 3,
  keyLength: 64,
  saltBytes: 16,
} as const;
const LEGACY = { N: 16384, r: 16, p: 1, keyLength: 64 } as const;

/** Owner decision (2026-11-08): 8 characters minimum (was 12). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

function derive(
  password: string,
  salt: string,
  {
    N,
    r,
    p,
    keyLength,
  }: { N: number; r: number; p: number; keyLength: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      keyLength,
      { N, r, p, maxmem: 256 * N * r },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT.saltBytes).toString('hex');
  const key = await derive(password, salt, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt}$${key.toString('hex')}`;
}

/** Parses either format; null for anything else (never verifies). */
function parse(hash: string) {
  const parts = hash.split('$');
  if (parts.length === 6 && parts[0] === 'scrypt') {
    const [, n, r, p, salt, key] = parts;
    const params = { N: Number(n), r: Number(r), p: Number(p) };
    // Refuse absurd parameters from a tampered row rather than burning CPU or memory.
    if (
      !Number.isInteger(params.N) ||
      params.N < 2 ** 10 ||
      params.N > 2 ** 20 ||
      !Number.isInteger(params.r) ||
      params.r < 1 ||
      params.r > 32 ||
      !Number.isInteger(params.p) ||
      params.p < 1 ||
      params.p > 16 ||
      !/^[0-9a-f]+$/.test(salt) ||
      !/^[0-9a-f]{128}$/.test(key)
    ) {
      return null;
    }
    return { ...params, keyLength: 64, salt, key, legacy: false };
  }
  const legacy = /^([0-9a-f]+):([0-9a-f]{128})$/.exec(hash);
  if (legacy)
    return { ...LEGACY, salt: legacy[1], key: legacy[2], legacy: true };
  return null;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const parsed = parse(hash);
  if (!parsed) return false;
  const expected = Buffer.from(parsed.key, 'hex');
  const actual = await derive(password, parsed.salt, parsed);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True when the stored hash uses older or weaker parameters than SCRYPT. */
export function needsRehash(hash: string): boolean {
  const parsed = parse(hash);
  return (
    !parsed ||
    parsed.legacy ||
    parsed.N * parsed.r * parsed.p < SCRYPT.N * SCRYPT.r * SCRYPT.p
  );
}

const BREACHED = new Set(BREACHED_PASSWORDS);

/** In the bundled breached-password list (case-insensitive, NFKC). */
export function isBreachedPassword(password: string): boolean {
  return BREACHED.has(password.normalize('NFKC').toLowerCase());
}
