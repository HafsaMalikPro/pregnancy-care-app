import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, openAPI, twoFactor } from 'better-auth/plugins';
import { Logger } from '@nestjs/common';
import type { Env } from '../config/env.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { EmailMessage, EmailSender } from '../email/email-sender.js';
import { passwordResetEmail, verificationEmail } from '../email/templates.js';

export const AUTH_BASE_PATH = '/v1/auth';
export const PASSWORD_MIN_LENGTH = 12;

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
];

/** Need an email provider: off while EMAIL_PROVIDER=none. */
export const EMAIL_AUTH_PATHS = [
  '/request-password-reset',
  '/reset-password',
  '/verify-email',
  '/send-verification-email',
];

/** Reset links are single use and short lived; verification links last a day. */
export const RESET_TOKEN_TTL_SECONDS = 30 * 60;
export const VERIFICATION_TOKEN_TTL_SECONDS = 24 * 60 * 60;

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
>;

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
      useSecureCookies: env.NODE_ENV === 'production',
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: 128,
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
      expiresIn: 60 * 60 * 24 * 30,
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
        '/request-password-reset': { window: 3600, max: 5 },
        '/reset-password': { window: 60, max: 5 },
        '/send-verification-email': { window: 3600, max: 5 },
        '/verify-email': { window: 60, max: 10 },
      },
    },
    plugins: [
      bearer(),
      // Schema only: merged into /docs by openapi.ts. Its own reference UI stays off.
      openAPI({ disableDefaultReference: true }),
      twoFactor({
        issuer: 'Preconception Platform',
        schema: { twoFactor: { modelName: 'twoFactor' } },
      }),
    ],
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
