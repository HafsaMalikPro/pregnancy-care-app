/**
 * E2E and integration tests create accounts, publish content and delete data. This guard runs
 * before any test file imports the app, so a misconfigured environment can never point them at
 * a development or real database.
 *
 * - The database must be named explicitly in TEST_DATABASE_URL. DATABASE_URL (the app's own
 *   database, e.g. the dev database from .env) is never used as a fallback.
 * - The host must be local, unless ALLOW_REMOTE_TEST_DATABASE=true for a dedicated remote one.
 * - NODE_ENV=production is refused.
 */
const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'postgres',
]);

export class UnsafeTestDatabaseError extends Error {}

export function assertSafeTestDatabase(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production') {
    throw new UnsafeTestDatabaseError(
      'Refusing to run tests with NODE_ENV=production.',
    );
  }
  const raw = env.TEST_DATABASE_URL;
  if (!raw) {
    throw new UnsafeTestDatabaseError(
      'Set TEST_DATABASE_URL to a disposable database for e2e tests (DATABASE_URL is never used).',
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeTestDatabaseError('TEST_DATABASE_URL is not a valid URL.');
  }
  // Only the host is reported: the URL holds credentials.
  if (
    !LOCAL_HOSTS.has(url.hostname) &&
    env.ALLOW_REMOTE_TEST_DATABASE !== 'true'
  ) {
    throw new UnsafeTestDatabaseError(
      `Refusing to run tests against non-local database host "${url.hostname}". ` +
        'Use a disposable local database, or set ALLOW_REMOTE_TEST_DATABASE=true for a dedicated remote test database.',
    );
  }
}

/** Checks TEST_DATABASE_URL, then points the app's DATABASE_URL at it. */
export function useTestDatabase(env: NodeJS.ProcessEnv): void {
  assertSafeTestDatabase(env);
  env.DATABASE_URL = env.TEST_DATABASE_URL;
}
