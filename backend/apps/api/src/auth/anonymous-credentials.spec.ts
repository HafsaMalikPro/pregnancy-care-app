import {
  generateAnonymousSecret,
  hashAnonymousSecret,
  parseAnonymousAuthorization,
} from './anonymous-credentials.js';
import { ownerWhere } from './owner.js';

describe('anonymous credentials', () => {
  it('generates distinct 43-character base64url secrets', () => {
    const a = generateAnonymousSecret();
    const b = generateAnonymousSecret();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it('hashes deterministically to hex without containing the secret', () => {
    const s = generateAnonymousSecret();
    expect(hashAnonymousSecret(s)).toBe(hashAnonymousSecret(s));
    expect(hashAnonymousSecret(s)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAnonymousSecret(s)).not.toContain(s);
  });

  it('parses a well-formed Anonymous header', () => {
    const s = generateAnonymousSecret();
    expect(parseAnonymousAuthorization(`Anonymous ${s}`)).toBe(s);
    expect(parseAnonymousAuthorization(`  Anonymous   ${s} `)).toBe(s);
  });

  it.each([
    undefined,
    '',
    'Anonymous',
    'anonymous ' + 'a'.repeat(43),
    'Bearer ' + 'a'.repeat(43),
    'Anonymous ' + 'a'.repeat(42),
    'Anonymous ' + 'a'.repeat(44),
    'Anonymous ' + 'a'.repeat(42) + '!',
    `Anonymous ${'a'.repeat(43)} extra`,
  ])('rejects %j', (header) => {
    expect(parseAnonymousAuthorization(header)).toBeNull();
  });
});

describe('ownerWhere', () => {
  it('scopes to exactly one owner column', () => {
    expect(
      ownerWhere({ kind: 'anonymous', id: 'a', expiresAt: new Date() }),
    ).toEqual({ anonymousSessionId: 'a' });
    expect(
      ownerWhere({
        kind: 'user',
        id: 'u',
        user: {
          id: 'u',
          email: 'e',
          name: null,
          emailVerified: false,
          staffRole: null,
          twoFactorEnabled: false,
          status: 'active',
        },
      }),
    ).toEqual({ userId: 'u' });
  });
});
