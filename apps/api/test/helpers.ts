import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { StaffRole } from '@preconception/contracts';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { PrismaService } from '../src/database/prisma.service.js';

/**
 * Boots the real AppModule with setupApp(), after applying `env` to process.env.
 * ConfigModule reads the environment when app.module is first imported, so the import is
 * dynamic and each e2e file (vitest isolates files) gets its own configuration.
 *
 * Rate limiting is off by default because every test request comes from one IP;
 * rate-limit.e2e-spec.ts turns it back on.
 */
/**
 * A configuration production accepts, for production-mode suites. Email is "resend" with a
 * placeholder key, but createTestApp swaps in the in-memory sender, so nothing is sent.
 */
export function productionEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    RATE_LIMIT_ENABLED: 'true',
    ADMIN_REQUIRE_MFA: 'true',
    BETTER_AUTH_URL: 'https://api.example.test',
    APP_URL: 'https://app.example.test',
    CORS_ORIGINS: 'https://app.example.test',
    EMAIL_PROVIDER: 'resend',
    EMAIL_FROM: 'Pregnancy Care <test@example.test>',
    RESEND_API_KEY: 'test-placeholder-never-used',
  };
}

/** Test-only field-encryption keys (synthetic data only). */
export const TEST_FIELD_KEYS = `t1:${Buffer.alloc(32, 7).toString('base64')},t0:${Buffer.alloc(32, 3).toString('base64')}`;

export async function createTestApp(
  env: Record<string, string> = {},
  extraControllers: Type[] = [],
): Promise<INestApplication<App>> {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    RATE_LIMIT_ENABLED: 'false',
    // Field encryption on in every e2e suite. A fixed, test-only key (not a secret: it only
    // ever protects synthetic test data).
    FIELD_ENCRYPTION_KEYS: TEST_FIELD_KEYS,
    FIELD_ENCRYPTION_ACTIVE_KEY: 't1',
    // Tests call RetentionService.purge() directly instead of waiting for the timer.
    RETENTION_PURGE_INTERVAL_MS: '0',
    // Tests publish content and create accounts; keep them off the dev database when a
    // disposable one is configured.
    ...(process.env.TEST_DATABASE_URL
      ? { DATABASE_URL: process.env.TEST_DATABASE_URL }
      : {}),
    ...env,
  });
  const { AppModule } = await import('../src/app.module.js');
  const { setupApp } = await import('../src/setup-app.js');
  const { EMAIL_SENDER, MemoryEmailSender } =
    await import('../src/email/email-sender.js');
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: extraControllers,
  });
  // Tests never reach a real email service: a suite that configures Resend (to run the
  // production configuration) gets the in-memory sender in its place.
  if (process.env.EMAIL_PROVIDER === 'resend') {
    builder = builder
      .overrideProvider(EMAIL_SENDER)
      .useValue(new MemoryEmailSender());
  }
  const moduleFixture = await builder.compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  await setupApp(app);
  await app.init();
  // Bind once; otherwise supertest listens per request and concurrent tests leak listeners.
  await app.listen(0);
  return app;
}

export async function getPrisma(app: INestApplication): Promise<PrismaService> {
  const { PrismaService } = await import('../src/database/prisma.service.js');
  return app.get(PrismaService);
}

export type Auth = { authorization: string };

export const PASSWORD = 'correct-horse-battery-staple';

export function uniqueEmail(label = 'user'): string {
  return `${label}-${randomUUID()}@example.test`;
}

/**
 * Signs up a new user through Better Auth and returns bearer credentials. When the app requires
 * email verification (production configuration, F-03) sign-up starts no session: the test
 * marks the address verified, as the emailed link would, and signs in.
 */
export async function signUp(
  app: INestApplication<App>,
  email = uniqueEmail(),
): Promise<Auth & { id: string; email: string }> {
  const http = request(app.getHttpServer());
  const res = await http
    .post('/v1/auth/sign-up/email')
    .send({ email, password: PASSWORD, name: 'Test Person' })
    .expect(200);
  let token = res.headers['set-auth-token'];
  let id: string = res.body.user.id;
  if (!token) {
    const prisma = await getPrisma(app);
    const user = await prisma.user.update({
      where: { email },
      data: { emailVerified: true },
    });
    id = user.id;
    const signedIn = await http
      .post('/v1/auth/sign-in/email')
      .send({ email, password: PASSWORD })
      .expect(200);
    token = signedIn.headers['set-auth-token'];
  }
  if (!token) throw new Error('sign-up returned no set-auth-token header');
  return { authorization: `Bearer ${token}`, id, email };
}

/** Starts an anonymous session and returns its credentials. */
export async function anonymous(
  app: INestApplication<App>,
): Promise<Auth & { id: string; secret: string }> {
  const res = await request(app.getHttpServer())
    .post('/v1/anonymous-sessions')
    .send({ platform: 'ios' })
    .expect(201);
  return {
    authorization: `Anonymous ${res.body.secret}`,
    id: res.body.id,
    secret: res.body.secret,
  };
}

export async function grantHealthConsent(
  app: INestApplication<App>,
  auth: Auth,
  granted = true,
): Promise<void> {
  await request(app.getHttpServer())
    .post('/v1/me/consents')
    .set(auth)
    .send({
      purpose: 'health_data_processing',
      granted,
      policyVersion: '2026-10-01',
      source: 'test',
    })
    .expect(201);
}

/** Grants a staff role directly in the database (normally an audited admin action). */
export async function makeStaff(
  prisma: PrismaService,
  userId: string,
  role: StaffRole,
  twoFactorEnabled = true,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { staffRole: role, twoFactorEnabled },
  });
}

/** Signs up a user, then makes them staff. */
export async function staffUser(
  app: INestApplication<App>,
  prisma: PrismaService,
  role: StaffRole,
  twoFactorEnabled = true,
) {
  const user = await signUp(app, uniqueEmail(role));
  await makeStaff(prisma, user.id, role, twoFactorEnabled);
  return user;
}

/** Days before today (UTC) as YYYY-MM-DD, for dates that must not be in the future. */
export function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
