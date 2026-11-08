import { z } from 'zod';
import { parseKeys } from '../database/field-keys.js';

const PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** An IP, an IP/CIDR or an Express trust-proxy keyword. */
export function isProxyAddress(value: string): boolean {
  if (PROXY_KEYWORDS.has(value)) return true;
  const [ip, bits, ...rest] = value.split('/');
  if (rest.length > 0) return false;
  const v4 = IPV4.test(ip);
  const v6 = !v4 && /^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':');
  if (!v4 && !v6) return false;
  if (bits === undefined) return true;
  const n = Number(bits);
  return /^\d+$/.test(bits) && n >= 0 && n <= (v4 ? 32 : 128);
}

/** True for "https://app.example.com" or "http://localhost:3000"; false for paths or slashes. */
export function isExactOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

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
  /** Postgres cancels any statement running longer than this (ms). */
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(120_000)
    .default(10_000),
  /** The HTTP server drops a client that takes longer than this to send its request (ms). */
  REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120_000)
    .default(15_000),
  /**
   * Field-encryption keys for sensitive free text: `<id>:<base64 32-byte key>`, comma-separated
   * (old keys stay listed for reading during rotation). Required in production.
   */
  FIELD_ENCRYPTION_KEYS: z.string().optional(),
  /** The key id used for new writes. Must be one of FIELD_ENCRYPTION_KEYS. */
  FIELD_ENCRYPTION_ACTIVE_KEY: z.string().optional(),
  /** Signs and encrypts Better Auth sessions and 2FA secrets. At least 32 random characters. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** Public base URL of this API, e.g. https://api.example.com. */
  BETTER_AUTH_URL: z.url().default('http://localhost:4000'),
  /** Staff routes require two-factor auth. Only disable in local development. */
  ADMIN_REQUIRE_MFA: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * Session cookies carry the Secure attribute (sent over https only). Defaults to on in
   * production and staging; production refuses `false`.
   */
  AUTH_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /**
   * Premium gating. Off by default: every article, task and plan is fully accessible and
   * clients show no paywall. Payments are out of scope; entitlements still come only from
   * verified `subscriptions` rows when this is on.
   */
  FEATURE_PREMIUM_LOCKS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Per-IP rate limiting (Nest throttler and Better Auth). Disable only in tests. */
  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /**
   * Which proxies may set X-Forwarded-For. `false` (default): the socket address is the client
   * IP and the header is ignored. A number: that many trusted hops in front of the API (for
   * example 1 behind a single load balancer). Otherwise a comma-separated list of proxy IPs or
   * CIDRs (Express keywords loopback, linklocal and uniquelocal are allowed). `true` (trust
   * any hop) is refused: it lets clients spoof their IP and bypass rate limits.
   */
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((v, ctx): false | number | string[] => {
      const value = v.trim();
      if (value === 'false' || value === '') return false;
      if (/^\d+$/.test(value)) {
        const hops = Number(value);
        if (hops >= 1 && hops <= 10) return hops;
      } else if (value !== 'true') {
        const list = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (list.length > 0 && list.every(isProxyAddress)) return list;
      }
      ctx.addIssue({ code: 'custom', message: 'invalid TRUST_PROXY' });
      return z.NEVER;
    }),
  /**
   * Breached-password check on sign-up, password change and reset. `bundled` (default) checks
   * the bundled list only. `hibp` also asks Have I Been Pwned's k-anonymity range API (only
   * the first 5 hex characters of the SHA-1 leave the server); needs outbound HTTPS.
   */
  PASSWORD_BREACH_CHECK: z.enum(['bundled', 'hibp']).default('bundled'),
  /** Inactive anonymous sessions (and their data) expire after this many days. */
  ANONYMOUS_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(180),
  /**
   * Exact origins (scheme://host[:port]). The browser's Origin header is compared verbatim, so
   * a path, a trailing slash or a missing scheme would never match: those are rejected here.
   */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().refine(isExactOrigin))),
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
  /** How often the retention purge runs (ms). 0 turns it off. Default 6 hours. */
  RETENTION_PURGE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .default(6 * 3_600_000),
  REMINDER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(30_000),
});

/** Every variable the API validates at boot (used by env-example.spec.ts). */
export const ENV_KEYS = Object.keys(EnvSchema.shape);

/** Settings that are only safe outside production, checked so a bad deploy fails at boot. */
function checkCombinations(
  env: z.infer<typeof EnvSchema>,
  ctx: z.RefinementCtx,
) {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });

  if (env.FIELD_ENCRYPTION_KEYS || env.FIELD_ENCRYPTION_ACTIVE_KEY) {
    try {
      const keys = parseKeys(env.FIELD_ENCRYPTION_KEYS ?? '');
      if (
        !env.FIELD_ENCRYPTION_ACTIVE_KEY ||
        !keys.has(env.FIELD_ENCRYPTION_ACTIVE_KEY)
      ) {
        issue('FIELD_ENCRYPTION_ACTIVE_KEY', 'must name a configured key');
      }
    } catch {
      issue('FIELD_ENCRYPTION_KEYS', 'invalid key list');
    }
  }
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
  if (!env.FIELD_ENCRYPTION_KEYS || !env.FIELD_ENCRYPTION_ACTIVE_KEY) {
    issue('FIELD_ENCRYPTION_KEYS', 'required in production');
  }
  if (weakSecret(env.BETTER_AUTH_SECRET)) {
    issue('BETTER_AUTH_SECRET', 'too weak or a placeholder');
  }
  if (!env.RATE_LIMIT_ENABLED)
    issue('RATE_LIMIT_ENABLED', 'must be true in production');
  if (!env.ADMIN_REQUIRE_MFA)
    issue('ADMIN_REQUIRE_MFA', 'must be true in production');
  if (env.AUTH_COOKIE_SECURE === false)
    issue('AUTH_COOKIE_SECURE', 'must be true in production');
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

/**
 * Production secrets must look random: at least 32 characters (checked by the schema), at
 * least 16 distinct characters, and not a template placeholder.
 */
export function weakSecret(secret: string): boolean {
  return (
    new Set(secret).size < 16 ||
    /change[_-]?me|replace|placeholder|example|not[_-]?a[_-]?secret|ci[_-]?only|password/i.test(
      secret,
    )
  );
}

const CheckedEnvSchema = EnvSchema.superRefine(checkCombinations);

/** Whether session cookies get the Secure attribute (explicit setting, else by environment). */
export function secureCookies(env: {
  NODE_ENV: z.infer<typeof EnvSchema>['NODE_ENV'];
  AUTH_COOKIE_SECURE?: boolean;
}): boolean {
  return (
    env.AUTH_COOKIE_SECURE ??
    (env.NODE_ENV === 'production' || env.NODE_ENV === 'staging')
  );
}

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
