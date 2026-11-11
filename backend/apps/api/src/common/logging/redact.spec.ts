import { redact, redactValue } from './redact.js';

describe('log redaction', () => {
  it.each([
    ['bearer token', 'auth failed for Bearer abc.def-123', 'Bearer [redacted]'],
    [
      'guest secret',
      'Authorization: Anonymous Zx9_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '[redacted]',
    ],
    [
      'session cookie',
      'cookie __Secure-better-auth.session_token=tok123; x=1',
      '__Secure-better-auth.session_token=[redacted]',
    ],
    [
      'password json',
      '{"email":"a@b.co","password":"hunter2-long-pass"}', // gitleaks:allow (synthetic test value)
      '"password":[redacted]',
    ],
    ['newPassword kv', 'newPassword=correct-horse', 'newPassword=[redacted]'],
    ['email', 'User not found: jane.doe@example.org', '[email]@example.org'],
    [
      'connection string',
      'connect postgresql://admin:pw@db:5432/prod',
      'postgresql://[redacted]@',
    ],
    [
      'opaque token',
      'token sent: AbCdEfGhIjKlMnOpQrStUvWxYz0123456789',
      '[token]',
    ],
  ])('redacts a %s', (_, input, expected) => {
    const out = redact(input);
    expect(out).toContain(expected);
    expect(out).not.toMatch(
      /hunter2|correct-horse|jane\.doe|admin:pw|tok123|AbCdEfGhIjKlMnOp/,
    );
  });

  it('keeps request ids and record ids (UUIDs) for correlation', () => {
    const msg =
      'GET /v1/me failed: TypeError [1e5c0954-2c4e-452d-a205-1ffef5eba984]';
    expect(redact(msg)).toBe(msg);
  });

  it('leaves ordinary messages alone', () => {
    expect(redact('GET /v1/health failed: TypeError [req-1]')).toBe(
      'GET /v1/health failed: TypeError [req-1]',
    );
  });

  it('redacts errors and objects, including stacks', () => {
    const err = new Error('login failed for jane@example.org');
    const out = redactValue(err) as Error;
    expect(out.message).toBe('login failed for [email]@example.org');
    expect(out.stack).not.toContain('jane@');
    expect(
      redactValue({ user: { email: 'jane@example.org', password: 'x' } }),
    ).toEqual({
      user: { email: '[email]@example.org', password: '[redacted]' },
    });
  });
});
