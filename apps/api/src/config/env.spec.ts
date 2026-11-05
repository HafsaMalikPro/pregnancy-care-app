import { validateEnv } from './env.js';

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
      NODE_ENV: 'production',
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
          EMAIL_PROVIDER: 'log',
          CORS_ORIGINS: 'http://app.example.com',
          BETTER_AUTH_URL: 'http://api.example.com',
        }),
      ).toThrow(
        'Invalid environment configuration: RATE_LIMIT_ENABLED, ADMIN_REQUIRE_MFA, EMAIL_PROVIDER, BETTER_AUTH_URL, CORS_ORIGINS',
      );
      expect(() => validateEnv({ ...prod, CORS_ORIGINS: '' })).toThrow(
        'CORS_ORIGINS',
      );
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
});
