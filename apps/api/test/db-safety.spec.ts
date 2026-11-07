import {
  assertSafeTestDatabase,
  UnsafeTestDatabaseError,
  useTestDatabase,
} from './db-safety.js';

const local =
  'postgresql://u:secret-password@localhost:5434/preconception_test';

describe('test database guard', () => {
  it('accepts local test databases', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]', 'postgres']) {
      expect(() =>
        assertSafeTestDatabase({
          TEST_DATABASE_URL: `postgresql://u:p@${host}:5432/db`,
        }),
      ).not.toThrow();
    }
  });

  it('never falls back to DATABASE_URL (regression: e2e runs wrote to the dev database)', () => {
    expect(() =>
      assertSafeTestDatabase({
        DATABASE_URL: 'postgresql://u:p@localhost:5434/preconception',
      }),
    ).toThrow(/TEST_DATABASE_URL/);
  });

  it('refuses a remote host unless explicitly allowed, without echoing credentials', () => {
    const env = {
      TEST_DATABASE_URL:
        'postgresql://u:secret-password@db.prod.example.com:5432/app',
    };
    expect(() => assertSafeTestDatabase(env)).toThrow(UnsafeTestDatabaseError);
    try {
      assertSafeTestDatabase(env);
    } catch (e) {
      expect((e as Error).message).toContain('db.prod.example.com');
      expect((e as Error).message).not.toContain('secret-password');
    }
    expect(() =>
      assertSafeTestDatabase({ ...env, ALLOW_REMOTE_TEST_DATABASE: 'true' }),
    ).not.toThrow();
  });

  it('refuses production mode and an invalid URL', () => {
    expect(() =>
      assertSafeTestDatabase({
        TEST_DATABASE_URL: local,
        NODE_ENV: 'production',
      }),
    ).toThrow(/production/);
    expect(() =>
      assertSafeTestDatabase({ TEST_DATABASE_URL: 'not a url' }),
    ).toThrow(/not a valid URL/);
  });

  it('points DATABASE_URL at TEST_DATABASE_URL', () => {
    const env: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgresql://u:p@localhost:5434/dev',
      TEST_DATABASE_URL: local,
    };
    useTestDatabase(env);
    expect(env.DATABASE_URL).toBe(local);
  });
});
