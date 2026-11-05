import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Connections per API instance. Instances × this must stay below Postgres max_connections. */
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  /** How long a request waits for a free pool connection before failing (0 = forever). */
  DATABASE_POOL_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5000),
  /** Signs and encrypts Better Auth sessions and 2FA secrets. At least 32 random characters. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Public base URL of this API, e.g. https://api.example.com. */
  BETTER_AUTH_URL: z.url().default('http://localhost:4000'),
  /** Staff routes require two-factor auth. Only disable in local development. */
  ADMIN_REQUIRE_MFA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Per-IP rate limiting (Nest throttler and Better Auth). Disable only in tests. */
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Inactive anonymous sessions (and their data) expire after this many days. */
  ANONYMOUS_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(180),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  /**
   * Public base URL of the website. Password-reset and verification emails link to
   * `${APP_URL}/reset-password` and `${APP_URL}/verify-email`.
   */
  APP_URL: z.url().default('http://localhost:3000'),
  /**
   * Outgoing email. `none` keeps password reset, email verification and reminder emails off.
   * `log` prints messages (including their links) to the console: local development only.
   * `resend` sends through the Resend HTTP API. `memory` keeps messages in memory for tests.
   */
  EMAIL_PROVIDER: z.enum(['none', 'log', 'resend', 'memory']).default('none'),
  /** Sender, e.g. "Pregnancy Care <hello@example.com>". Required for `resend`. */
  EMAIL_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  /** Runs the reminder scheduler and sender in this process. Needs an email provider. */
  REMINDER_DELIVERY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
});

/** Settings that are only safe outside production, checked so a bad deploy fails at boot. */
function checkCombinations(
  env: z.infer<typeof EnvSchema>,
  ctx: z.RefinementCtx,
) {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });

  if (env.EMAIL_PROVIDER === 'resend') {
    if (!env.EMAIL_FROM) issue('EMAIL_FROM', 'required for resend');
    if (!env.RESEND_API_KEY) issue('RESEND_API_KEY', 'required for resend');
  }
  if (env.REMINDER_DELIVERY_ENABLED && env.EMAIL_PROVIDER === 'none') {
    issue('REMINDER_DELIVERY_ENABLED', 'needs an EMAIL_PROVIDER');
  }
  if (env.EMAIL_PROVIDER === 'memory' && env.NODE_ENV !== 'test') {
    issue('EMAIL_PROVIDER', 'memory is for tests only');
  }
  if (env.NODE_ENV !== 'production') return;
  if (!env.RATE_LIMIT_ENABLED)
    issue('RATE_LIMIT_ENABLED', 'must be true in production');
  if (!env.ADMIN_REQUIRE_MFA)
    issue('ADMIN_REQUIRE_MFA', 'must be true in production');
  if (env.EMAIL_PROVIDER === 'log')
    issue('EMAIL_PROVIDER', 'log is for development only');
  if (!env.BETTER_AUTH_URL.startsWith('https://'))
    issue('BETTER_AUTH_URL', 'must use https');
  if (!env.APP_URL.startsWith('https://')) issue('APP_URL', 'must use https');
  if (env.CORS_ORIGINS.length === 0)
    issue('CORS_ORIGINS', 'must list the website origin');
  if (env.CORS_ORIGINS.some((o) => !o.startsWith('https://'))) {
    issue('CORS_ORIGINS', 'must use https');
  }
}

const CheckedEnvSchema = EnvSchema.superRefine(checkCombinations);

export type Env = z.infer<typeof CheckedEnvSchema>;

/** Fails fast at boot with the names of missing/invalid variables — never their values. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = CheckedEnvSchema.safeParse(raw);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  return result.data;
}
