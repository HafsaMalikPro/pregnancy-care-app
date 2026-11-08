import { accountKey, LOCKOUT, lockSeconds } from './sign-in-throttle.js';

describe('sign-in lockout policy', () => {
  it('does not lock below the threshold, then doubles up to the maximum', () => {
    const p = LOCKOUT.account;
    expect(lockSeconds(4, p)).toBe(0);
    expect(lockSeconds(5, p)).toBe(60);
    expect(lockSeconds(6, p)).toBe(120);
    expect(lockSeconds(7, p)).toBe(240);
    expect(lockSeconds(50, p)).toBe(p.maxSeconds);
    expect(lockSeconds(10_000, p)).toBe(p.maxSeconds);
  });

  it('keys accounts by a digest of the normalised email, never the email itself', () => {
    const key = accountKey(' Person@Example.TEST ');
    expect(key).toBe(accountKey('person@example.test'));
    expect(key).toMatch(/^acct:[0-9a-f]{64}$/);
    expect(key).not.toContain('example');
  });
});
