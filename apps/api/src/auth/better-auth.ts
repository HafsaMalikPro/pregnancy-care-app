import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import {
  bearer,
  haveIBeenPwned,
  openAPI,
  twoFactor,
} from 'better-auth/plugins';
import { Logger } from '@nestjs/common';
import { type Env, secureCookies } from '../config/env.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { EmailMessage, EmailSender } from '../email/email-sender.js';
import { passwordResetEmail, verificationEmail } from '../email/templates.js';
import { CLIENT_IP_HEADER } from './client-ip.js';
import {
  hashPassword,
  isBreachedPassword,
  needsRehash,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from './password.js';
import { SignInThrottle } from './sign-in-throttle.js';

export const AUTH_BASE_PATH = '/v1/auth';
export { PASSWORD_MIN_LENGTH } from './password.js';

/** Sessions end after 7 days without use, and 30 days after sign-in whatever the use. */
export const SESSION_IDLE_SECONDS = 7 * 24 * 3600;
/** Enforced by the auth_sessions_absolute_lifetime trigger (migration 20261108120000). */
export const SESSION_ABSOLUTE_DAYS = 30;
/** The two-factor challenge cookie between the password step and the code step. */
export const TWO_FACTOR_CHALLENGE_SECONDS = 5 * 60;

/**
 * Better Auth endpoints this deployment does not support: no OAuth providers, no SMS/email
 * OTP. `/delete-user` would bypass the audited deletion flow in PrivacyModule. Better Auth
 * matches these exactly; parameterised ones are also blocked by prefix in setupApp
 * (BLOCKED_AUTH_PREFIXES).
 */
export const DISABLED_AUTH_PATHS = [
  '/sign-in/social',
  '/callback/:id',
  '/link-social',
  '/unlink-account',
  '/refresh-token',
  '/get-access-token',
  '/account-info',
  '/reset-password/:token',
  '/change-email',
  '/delete-user',
  '/delete-user/callback',
  '/two-factor/send-otp',
  '/two-factor/verify-otp',
  // No custom session fields exist, so update-session always answered 400 "No fields to update".
  '/update-session',
  // Signs out every device including this one. The website offers "sign out of this device"
  // (sign-out) and "sign out of other devices" (revoke-other-sessions) instead.
  '/revoke-sessions',
  // The openAPI plugin's schema endpoint. openapi.ts calls it in-process to build /docs; over
  // HTTP it would publish the auth schema even in production, where /docs is off.
  '/open-api/generate-schema',
];

/** Need an email provider: off while EMAIL_PROVIDER=none. */
export const EMAIL_AUTH_PATHS = [
  '/request-password-reset',
  '/reset-password',
  '/verify-email',
  '/send-verification-email',
];

/**
 * Both kinds of link expire after 30 minutes. Reset tokens are single use (stored hashed,
 * consumed atomically). Verification tokens are signed and only set `emailVerified`; replaying
 * one changes nothing and never creates a session.
 */
export const RESET_TOKEN_TTL_SECONDS = 30 * 60;
export const VERIFICATION_TOKEN_TTL_SECONDS = 30 * 60;

export const BLOCKED_AUTH_PREFIXES = [
  '/callback/',
  '/reset-password/',
  '/delete-user/',
];

/**
 * Better Auth (ADR 004): email + password, database sessions, bearer tokens for mobile and
 * TOTP two-factor for staff. Mounted at /v1/auth/* in setupApp, ahead of Nest's body parser.
 *
 * Password reset and email verification run only when an email provider is configured. Links
 * point at the website (APP_URL), which posts the token back to the API. Reset tokens are
 * stored hashed and consumed atomically; verification tokens are signed JWTs.
 */
export type AuthEnv = Pick<
  Env,
  | 'NODE_ENV'
  | 'BETTER_AUTH_SECRET'
  | 'BETTER_AUTH_URL'
  | 'CORS_ORIGINS'
  | 'RATE_LIMIT_ENABLED'
  | 'APP_URL'
  | 'AUTH_COOKIE_SECURE'
  | 'PASSWORD_BREACH_CHECK'
>;

const COMPROMISED = {
  code: 'PASSWORD_COMPROMISED',
  message:
    'This password appears in a list of breached passwords. Choose a different one.',
};

function rejectBreached(password: unknown) {
  if (typeof password === 'string' && isBreachedPassword(password)) {
    throw APIError.from('BAD_REQUEST', COMPROMISED);
  }
}

const field = (body: unknown, key: string): string | null => {
  const v = (body as Record<string, unknown> | undefined)?.[key];
  return typeof v === 'string' ? v : null;
};

const logger = new Logger('Auth');

/**
 * Sends without awaiting, so response time doesn't reveal whether an address is registered.
 * Failures are logged by kind and error code only.
 */
function sendInBackground(email: EmailSender, message: EmailMessage) {
  email.send(message).catch((err: unknown) => {
    const code = (err as { code?: string }).code ?? 'UNKNOWN';
    logger.warn(`Could not send ${message.tag} email: ${code}`);
  });
  return Promise.resolve();
}

export function createAuth(
  prisma: PrismaService,
  env: AuthEnv,
  email: EmailSender,
) {
  const appUrl = env.APP_URL.replace(/\/$/, '');
  const throttle = new SignInThrottle(prisma, env.RATE_LIMIT_ENABLED);
  const clientIp = (headers: Headers | undefined) =>
    headers?.get(CLIENT_IP_HEADER) || null;
  return betterAuth({
    appName: 'Preconception Platform',
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: env.CORS_ORIGINS,
    disabledPaths: email.enabled
      ? DISABLED_AUTH_PATHS
      : [...DISABLED_AUTH_PATHS, ...EMAIL_AUTH_PATHS],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    advanced: {
      database: { generateId: 'uuid' },
      useSecureCookies: secureCookies(env),
      // Only the IP that clientIpMiddleware resolved (TRUST_PROXY-aware), never a raw
      // X-Forwarded-For sent by the client.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        switch (ctx.path) {
          case '/sign-up/email':
            rejectBreached(field(ctx.body, 'password'));
            return;
          case '/reset-password':
            rejectBreached(field(ctx.body, 'newPassword'));
            return;
          case '/change-password':
            rejectBreached(field(ctx.body, 'newPassword'));
            // A password change always signs out every other device.
            return {
              context: { body: { ...ctx.body, revokeOtherSessions: true } },
            };
          case '/sign-in/email': {
            const email = field(ctx.body, 'email');
            if (!email) return;
            if (await throttle.lockedUntil(email, clientIp(ctx.headers))) {
              throw APIError.from('TOO_MANY_REQUESTS', {
                code: 'SIGN_IN_LOCKED',
                message:
                  'Too many failed sign-in attempts. Wait a few minutes and try again.',
              });
            }
            return;
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        if (ctx.path === '/sign-in/email') {
          const email = field(ctx.body, 'email');
          if (!email) return;
          if (isAPIError(returned)) {
            if (returned.statusCode === 401) {
              await throttle.recordFailure(email, clientIp(ctx.headers));
            }
            return;
          }
          // The password was right (with or without a 2FA step still to come).
          await throttle.recordSuccess(email);
          const password = field(ctx.body, 'password');
          if (password) await upgradeHash(prisma, email, password);
          return;
        }
        if (ctx.path === '/change-password' && !isAPIError(returned)) {
          // Outstanding reset links stop working once the password has changed.
          const userId = ctx.context.session?.user.id;
          if (userId) {
            await prisma.authVerification.deleteMany({
              where: { value: userId },
            });
          }
        }
      }),
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      password: { hash: hashPassword, verify: verifyPassword },
      requireEmailVerification: false,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
      sendResetPassword: ({ user, token }) =>
        sendInBackground(
          email,
          passwordResetEmail(
            user.email,
            `${appUrl}/reset-password?token=${encodeURIComponent(token)}`,
          ),
        ),
    },
    emailVerification: {
      sendOnSignUp: email.enabled,
      expiresIn: VERIFICATION_TOKEN_TTL_SECONDS,
      sendVerificationEmail: ({ user, token }) =>
        sendInBackground(
          email,
          verificationEmail(
            user.email,
            `${appUrl}/verify-email?token=${encodeURIComponent(token)}`,
          ),
        ),
    },
    // Reset tokens (and other one-time identifiers) are stored as digests, not raw values.
    verification: { modelName: 'authVerification', storeIdentifier: 'hashed' },
    user: {
      modelName: 'user',
      additionalFields: {
        status: { type: 'string', input: false, required: false },
        staffRole: { type: 'string', input: false, required: false },
      },
    },
    session: {
      modelName: 'authSession',
      // Idle timeout; the 30-day absolute cap is a database trigger.
      expiresIn: SESSION_IDLE_SECONDS,
      updateAge: 60 * 60 * 24,
    },
    account: { modelName: 'authAccount' },
    rateLimit: {
      enabled: env.RATE_LIMIT_ENABLED,
      window: 60,
      max: 30,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 3600, max: 10 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/two-factor/enable': { window: 3600, max: 10 },
        '/two-factor/disable': { window: 3600, max: 10 },
        '/two-factor/generate-backup-codes': { window: 3600, max: 5 },
        '/change-password': { window: 3600, max: 5 },
        '/verify-password': { window: 60, max: 5 },
        '/request-password-reset': { window: 3600, max: 5 },
        '/reset-password': { window: 60, max: 5 },
        '/send-verification-email': { window: 3600, max: 5 },
        '/verify-email': { window: 60, max: 10 },
      },
    },
    plugins: [
      bearer(),
      ...(env.PASSWORD_BREACH_CHECK === 'hibp' ? [haveIBeenPwned()] : []),
      // Schema only: merged into /docs by openapi.ts. Its own reference UI stays off.
      openAPI({ disableDefaultReference: true }),
      twoFactor({
        issuer: 'Preconception Platform',
        twoFactorCookieMaxAge: TWO_FACTOR_CHALLENGE_SECONDS,
        schema: { twoFactor: { modelName: 'twoFactor' } },
      }),
    ],
    telemetry: { enabled: false },
  });
}

/** Re-hashes a legacy or weaker password hash after a successful sign-in. */
async function upgradeHash(
  prisma: PrismaService,
  email: string,
  password: string,
) {
  const account = await prisma.authAccount.findFirst({
    where: {
      providerId: 'credential',
      user: { email: email.trim().toLowerCase() },
    },
    select: { id: true, password: true },
  });
  if (account?.password && needsRehash(account.password)) {
    await prisma.authAccount.update({
      where: { id: account.id },
      data: { password: await hashPassword(password) },
    });
  }
}

export type Auth = ReturnType<typeof createAuth>;
