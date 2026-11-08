import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { EMAIL_SENDER, type EmailSender } from '../email/email-sender.js';
import { type Auth, createAuth } from './better-auth.js';

export type { Auth } from './better-auth.js';

/** Injection token for the Better Auth instance. */
export const AUTH = Symbol('AUTH');

export const authProvider: Provider = {
  provide: AUTH,
  inject: [PrismaService, ConfigService, EMAIL_SENDER],
  useFactory: (
    prisma: PrismaService,
    config: ConfigService<Env, true>,
    email: EmailSender,
  ): Auth =>
    createAuth(
      prisma,
      {
        NODE_ENV: config.get('NODE_ENV', { infer: true }),
        BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
        BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
        CORS_ORIGINS: config.get('CORS_ORIGINS', { infer: true }),
        RATE_LIMIT_ENABLED: config.get('RATE_LIMIT_ENABLED', { infer: true }),
        APP_URL: config.get('APP_URL', { infer: true }),
        AUTH_COOKIE_SECURE: config.get('AUTH_COOKIE_SECURE', { infer: true }),
        PASSWORD_BREACH_CHECK: config.get('PASSWORD_BREACH_CHECK', {
          infer: true,
        }),
      },
      email,
    ),
};
