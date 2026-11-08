import { randomBytes, scryptSync } from 'node:crypto';
import {
  hashPassword,
  isBreachedPassword,
  needsRehash,
  SCRYPT,
  verifyPassword,
} from './password.js';

describe('password hashing', () => {
  it('uses OWASP-equivalent scrypt parameters', () => {
    // OWASP: N=2^15, r=8, p=3 is one of the equal-strength minimums.
    expect(SCRYPT).toMatchObject({ N: 32768, r: 8, p: 3 });
    expect(SCRYPT.N * SCRYPT.r * SCRYPT.p).toBeGreaterThanOrEqual(
      2 ** 17 * 8 * 1 * 0.75,
    );
  });

  it('verifies the right password only, with fresh salts', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).not.toBe(b);
    expect(
      await verifyPassword({ hash: a, password: 'correct horse battery' }),
    ).toBe(true);
    expect(
      await verifyPassword({ hash: a, password: 'correct horse batterY' }),
    ).toBe(false);
    expect(needsRehash(a)).toBe(false);
  });

  it('verifies legacy Better Auth hashes and flags them for rehashing', async () => {
    const salt = randomBytes(16).toString('hex');
    const key = scryptSync('legacy password!', salt, 64, {
      N: 16384,
      r: 16,
      p: 1,
      maxmem: 128 * 16384 * 16 * 2,
    }).toString('hex');
    const legacy = `${salt}:${key}`;
    expect(
      await verifyPassword({ hash: legacy, password: 'legacy password!' }),
    ).toBe(true);
    expect(
      await verifyPassword({ hash: legacy, password: 'legacy password?' }),
    ).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it('never verifies malformed or tampered hashes', async () => {
    const good = await hashPassword('some long password');
    for (const hash of [
      '',
      'plaintext',
      good.replace('scrypt$32768', 'scrypt$1073741824'),
      good.replace('$8$3$', '$999$3$'),
      good.slice(0, -2),
    ]) {
      expect(
        await verifyPassword({ hash, password: 'some long password' }),
      ).toBe(false);
    }
    expect(needsRehash('garbage')).toBe(true);
  });

  it('rejects breached passwords case-insensitively', () => {
    expect(isBreachedPassword('qwerty123456')).toBe(true);
    expect(isBreachedPassword('QWERTY123456')).toBe(true);
    expect(isBreachedPassword('a much rarer passphrase 2026')).toBe(false);
  });
});
