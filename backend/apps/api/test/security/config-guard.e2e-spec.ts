import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateEnv } from '../../src/config/env.js';

/**
 * Production boot guard (docs/SECURITY_CHECKLIST.md, D4). The app validates its environment
 * with validateEnv at boot (ConfigModule.forRoot({ validate })) and refuses to start on any
 * error, naming the variable but never its value.
 */
const safe = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:pw@db.internal:5432/app',
  BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
  BETTER_AUTH_URL: 'https://api.example.com',
  APP_URL: 'https://app.example.com',
  CORS_ORIGINS: 'https://app.example.com',
  FIELD_ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
  FIELD_ENCRYPTION_ACTIVE_KEY: 'k1',
};

describe('Security: production configuration guard', () => {
  it('accepts a safe production configuration', () => {
    expect(() => validateEnv(safe)).not.toThrow();
  });

  it.each<[string, Record<string, string | undefined>, string]>([
    [
      'session cookies without Secure',
      { AUTH_COOKIE_SECURE: 'false' },
      'AUTH_COOKIE_SECURE',
    ],
    [
      'staff without required 2FA',
      { ADMIN_REQUIRE_MFA: 'false' },
      'ADMIN_REQUIRE_MFA',
    ],
    [
      'rate limiting off',
      { RATE_LIMIT_ENABLED: 'false' },
      'RATE_LIMIT_ENABLED',
    ],
    ['the log email provider', { EMAIL_PROVIDER: 'log' }, 'EMAIL_PROVIDER'],
    [
      'an http CORS origin',
      { CORS_ORIGINS: 'http://app.example.com' },
      'CORS_ORIGINS',
    ],
    ['no CORS origin', { CORS_ORIGINS: '' }, 'CORS_ORIGINS'],
    ['a wildcard CORS origin', { CORS_ORIGINS: '*' }, 'CORS_ORIGINS'],
    [
      'an http API URL',
      { BETTER_AUTH_URL: 'http://api.example.com' },
      'BETTER_AUTH_URL',
    ],
    ['an http website URL', { APP_URL: 'http://app.example.com' }, 'APP_URL'],
    [
      'a missing auth secret',
      { BETTER_AUTH_SECRET: undefined },
      'BETTER_AUTH_SECRET',
    ],
    [
      'a secret under 32 characters',
      { BETTER_AUTH_SECRET: 'Ab1'.repeat(10) },
      'BETTER_AUTH_SECRET',
    ],
    [
      'a low-variety secret',
      { BETTER_AUTH_SECRET: 'ab'.repeat(20) },
      'BETTER_AUTH_SECRET',
    ],
    [
      'a placeholder secret',
      { BETTER_AUTH_SECRET: 'CHANGE_ME_0123456789abcdefghijklmnop' },
      'BETTER_AUTH_SECRET',
    ],
    [
      'missing field-encryption keys',
      { FIELD_ENCRYPTION_KEYS: undefined },
      'FIELD_ENCRYPTION_KEYS',
    ],
    [
      'an active key that is not configured',
      { FIELD_ENCRYPTION_ACTIVE_KEY: 'k9' },
      'FIELD_ENCRYPTION_ACTIVE_KEY',
    ],
    [
      'a short encryption key',
      { FIELD_ENCRYPTION_KEYS: 'k1:c2hvcnQ=' },
      'FIELD_ENCRYPTION_KEYS',
    ],
    ['trusting every proxy hop', { TRUST_PROXY: 'true' }, 'TRUST_PROXY'],
    [
      'the in-memory test email provider',
      { EMAIL_PROVIDER: 'memory' },
      'EMAIL_PROVIDER',
    ],
  ])('refuses %s', (_, change, variable) => {
    const env = { ...safe, ...change };
    for (const [k, v] of Object.entries(change))
      if (v === undefined) delete (env as Record<string, unknown>)[k];
    let message = '';
    try {
      validateEnv(env);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('Invalid environment configuration');
    expect(message).toContain(variable);
    // Never the value.
    for (const v of Object.values(change))
      if (v && v.length > 3) expect(message).not.toContain(v);
  });

  it('is what the app actually uses at boot', () => {
    // ConfigModule.forRoot({ validate: validateEnv }) runs the guard while the module is
    // built, so a refused environment never starts the app.
    const source = readFileSync(
      new URL('../../src/app.module.ts', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(
      /ConfigModule\.forRoot\(\{[\s\S]*?validate: validateEnv/,
    );
  });
  // Docs and the auth schema are off in production: test/production-mode.e2e-spec.ts.
});
