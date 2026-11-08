import { randomBytes } from 'node:crypto';
import {
  isExactOrigin,
  isProxyAddress,
  secureCookies,
  validateEnv,
} from './env.js';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:secret@localhost:5432/db',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
  };

  it('applies defaults and splits CORS origins', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: 'http://a.test, http://b.test',
    });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.DATABASE_POOL_TIMEOUT_MS).toBe(5000);
    expect(env.ADMIN_REQUIRE_MFA).toBe(true);
    expect(env.RATE_LIMIT_ENABLED).toBe(true);
    expect(env.ANONYMOUS_SESSION_TTL_DAYS).toBe(180);
  });

  it('parses boolean flags', () => {
    const env = validateEnv({
      ...base,
      ADMIN_REQUIRE_MFA: 'false',
      RATE_LIMIT_ENABLED: 'false',
    });
    expect(env.ADMIN_REQUIRE_MFA).toBe(false);
    expect(env.RATE_LIMIT_ENABLED).toBe(false);
  });

  it('coerces numeric variables from strings', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      DATABASE_POOL_MAX: '25',
      DATABASE_POOL_TIMEOUT_MS: '0',
    });
    expect(env.PORT).toBe(8080);
    expect(env.DATABASE_POOL_MAX).toBe(25);
    expect(env.DATABASE_POOL_TIMEOUT_MS).toBe(0);
  });

  it('accepts the postgres:// scheme and empty CORS origins', () => {
    const env = validateEnv({
      ...base,
      DATABASE_URL: 'postgres://u:p@h:5432/db',
    });
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it.each([
    ['DATABASE_URL', {}],
    ['NODE_ENV', { NODE_ENV: 'prod' }],
    ['PORT', { PORT: '-1' }],
    ['PORT', { PORT: 'abc' }],
    ['DATABASE_POOL_MAX', { DATABASE_POOL_MAX: '0' }],
    ['DATABASE_POOL_TIMEOUT_MS', { DATABASE_POOL_TIMEOUT_MS: '-5' }],
    ['BETTER_AUTH_SECRET', { BETTER_AUTH_SECRET: 'too-short' }],
    ['ADMIN_REQUIRE_MFA', { ADMIN_REQUIRE_MFA: 'yes' }],
  ])('rejects an invalid %s', (name, overrides) => {
    const raw =
      name === 'DATABASE_URL'
        ? { BETTER_AUTH_SECRET: base.BETTER_AUTH_SECRET }
        : { ...base, ...overrides };
    expect(() => validateEnv(raw)).toThrow(new RegExp(name));
  });

  it('names invalid variables without echoing their values', () => {
    const bad = { ...base, DATABASE_URL: 'mysql://u:secret@h/db' };
    expect(() => validateEnv(bad)).toThrow(/DATABASE_URL/);
    expect(() => validateEnv(bad)).not.toThrow(/secret@/);
    expect(() =>
      validateEnv({ ...base, BETTER_AUTH_SECRET: 'short-secret-value' }),
    ).not.toThrow(/short-secret-value/);
  });

  describe('production', () => {
    const prod = {
      ...base,
      // Production also checks secret quality (see "production secret quality").
      BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
      NODE_ENV: 'production',
      FIELD_ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
      FIELD_ENCRYPTION_ACTIVE_KEY: 'k1',
      BETTER_AUTH_URL: 'https://api.example.com',
      APP_URL: 'https://app.example.com',
      CORS_ORIGINS: 'https://app.example.com',
    };

    it('accepts a safe configuration', () => {
      expect(validateEnv(prod).NODE_ENV).toBe('production');
    });

    it('refuses development-only settings, naming them but not their values', () => {
      expect(() =>
        validateEnv({
          ...prod,
          RATE_LIMIT_ENABLED: 'false',
          ADMIN_REQUIRE_MFA: 'false',
          AUTH_COOKIE_SECURE: 'false',
          EMAIL_PROVIDER: 'log',
          CORS_ORIGINS: 'http://app.example.com',
          BETTER_AUTH_URL: 'http://api.example.com',
        }),
      ).toThrow(
        'Invalid environment configuration: RATE_LIMIT_ENABLED, ADMIN_REQUIRE_MFA, AUTH_COOKIE_SECURE, EMAIL_PROVIDER, BETTER_AUTH_URL, CORS_ORIGINS',
      );
      expect(() => validateEnv({ ...prod, CORS_ORIGINS: '' })).toThrow(
        'CORS_ORIGINS',
      );
    });
  });

  describe('secure cookies', () => {
    it('default on in production and staging, off in development and test', () => {
      expect(secureCookies({ NODE_ENV: 'production' })).toBe(true);
      expect(secureCookies({ NODE_ENV: 'staging' })).toBe(true);
      expect(secureCookies({ NODE_ENV: 'development' })).toBe(false);
      expect(secureCookies({ NODE_ENV: 'test' })).toBe(false);
    });

    it('can be forced on locally (e.g. behind an https proxy)', () => {
      const env = validateEnv({ ...base, AUTH_COOKIE_SECURE: 'true' });
      expect(secureCookies(env)).toBe(true);
    });
  });

  describe('email and reminders', () => {
    it('defaults to no email and no delivery', () => {
      const env = validateEnv(base);
      expect(env.EMAIL_PROVIDER).toBe('none');
      expect(env.REMINDER_DELIVERY_ENABLED).toBe(false);
    });

    it('needs credentials for resend', () => {
      expect(() => validateEnv({ ...base, EMAIL_PROVIDER: 'resend' })).toThrow(
        'EMAIL_FROM, RESEND_API_KEY',
      );
      expect(
        validateEnv({
          ...base,
          EMAIL_PROVIDER: 'resend',
          EMAIL_FROM: 'Care <hello@example.com>',
          RESEND_API_KEY: 're_test',
        }).EMAIL_PROVIDER,
      ).toBe('resend');
    });

    it('needs a provider for reminder delivery, and keeps memory for tests', () => {
      expect(() =>
        validateEnv({ ...base, REMINDER_DELIVERY_ENABLED: 'true' }),
      ).toThrow('REMINDER_DELIVERY_ENABLED');
      expect(() => validateEnv({ ...base, EMAIL_PROVIDER: 'memory' })).toThrow(
        'EMAIL_PROVIDER',
      );
      expect(
        validateEnv({ ...base, NODE_ENV: 'test', EMAIL_PROVIDER: 'memory' })
          .EMAIL_PROVIDER,
      ).toBe('memory');
    });
  });

  describe('CORS_ORIGINS', () => {
    it.each([
      'http://localhost:3000',
      'https://app.example.com',
      'https://app.example.com:8443',
    ])('accepts the exact origin %s', (origin) => {
      expect(isExactOrigin(origin)).toBe(true);
      expect(
        validateEnv({ ...base, CORS_ORIGINS: origin }).CORS_ORIGINS,
      ).toEqual([origin]);
    });

    it.each([
      'localhost:3000',
      'http://localhost:3000/',
      'https://app.example.com/app',
      'https://APP.example.com',
      'ftp://files.example.com',
      '*',
    ])('rejects %s, naming only the variable', (origin) => {
      expect(isExactOrigin(origin)).toBe(false);
      expect(() =>
        validateEnv({
          ...base,
          CORS_ORIGINS: `http://localhost:3000,${origin}`,
        }),
      ).toThrow('Invalid environment configuration: CORS_ORIGINS.1');
    });
  });

  describe('TRUST_PROXY', () => {
    it('defaults to false and accepts hop counts and address lists', () => {
      expect(validateEnv(base).TRUST_PROXY).toBe(false);
      expect(validateEnv({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
      expect(
        validateEnv({
          ...base,
          TRUST_PROXY: '10.0.0.0/8, loopback, 2001:db8::1',
        }).TRUST_PROXY,
      ).toEqual(['10.0.0.0/8', 'loopback', '2001:db8::1']);
    });

    it.each(['true', '0', '11', '10.0.0.0/33', 'not-an-ip', '1.2.3.4/8/9'])(
      'refuses %s (trusting any hop would let clients spoof their IP)',
      (value) => {
        expect(() => validateEnv({ ...base, TRUST_PROXY: value })).toThrow(
          'Invalid environment configuration: TRUST_PROXY',
        );
      },
    );

    it('validates proxy addresses', () => {
      expect(isProxyAddress('192.168.1.10')).toBe(true);
      expect(isProxyAddress('::1/128')).toBe(true);
      expect(isProxyAddress('256.1.1.1')).toBe(false);
    });
  });

  describe('production secret quality', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      FIELD_ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
      FIELD_ENCRYPTION_ACTIVE_KEY: 'k1',
      BETTER_AUTH_URL: 'https://api.example.com',
      APP_URL: 'https://app.example.com',
      CORS_ORIGINS: 'https://app.example.com',
    };
    it('accepts a random secret', () => {
      expect(() =>
        validateEnv({
          ...prod,
          BETTER_AUTH_SECRET: 'q8V3nL0pZr7Tw2Yc5Kd9Hs1Mf6Xb4Ju0Ae3Gi8Oy',
        }),
      ).not.toThrow();
    });
    it.each([
      ['repeated characters', 'x'.repeat(40)],
      ['a placeholder', 'replace-with-at-least-32-random-characters'],
      ['the CI value', 'ci-only-not-a-secret-0123456789abcdef'],
      ['CHANGE_ME', 'CHANGE_ME_0123456789abcdefghijklmnopqrstuv'],
    ])('refuses %s', (_, secret) => {
      expect(() =>
        validateEnv({ ...prod, BETTER_AUTH_SECRET: secret }),
      ).toThrow('Invalid environment configuration: BETTER_AUTH_SECRET');
      // Only production refuses it.
      expect(() =>
        validateEnv({
          ...prod,
          NODE_ENV: 'development',
          BETTER_AUTH_SECRET: secret,
        }),
      ).not.toThrow();
    });
  });
});
