import { createHash, randomBytes } from 'node:crypto';

/** 256-bit random secret, base64url (43 characters). Returned to the client exactly once. */
export function generateAnonymousSecret(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The secret is high-entropy random data, so a fast hash is sufficient: there is nothing to
 * brute-force. Only this hash is stored (`anonymous_sessions.credential_hash`).
 */
export function hashAnonymousSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

const SECRET_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** Extracts the secret from `Authorization: Anonymous <secret>`, or null. */
export function parseAnonymousAuthorization(
  header: string | undefined,
): string | null {
  if (!header) return null;
  const [scheme, value, ...rest] = header.trim().split(/\s+/);
  if (scheme !== 'Anonymous' || rest.length > 0 || !value) return null;
  return SECRET_SHAPE.test(value) ? value : null;
}
