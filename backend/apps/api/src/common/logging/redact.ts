/**
 * Redaction for log output (docs/SECURITY_CHECKLIST.md, F3). The code never logs request bodies
 * or health values; this is the safety net for anything that slips into a message anyway:
 * library warnings, error messages quoting input, future code.
 */
const RULES: [RegExp, string][] = [
  // Authorization header values and cookies.
  [/\b(Bearer|Anonymous|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]'],
  [/((?:__Secure-|__Host-)?better-auth\.[a-z_]+)=[^;\s"']+/gi, '$1=[redacted]'],
  // JSON or key=value password, secret and token fields.
  [
    /(["']?(?:password|newPassword|currentPassword|secret|token|code|backupCode|apiKey|authorization|cookie)["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}&]+)/gi,
    '$1[redacted]',
  ],
  // Email addresses: keep the domain for debugging, drop the mailbox.
  [/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '[email]@$1'],
  // Connection strings with credentials.
  [/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, '$1[redacted]@'],
  // Long opaque tokens (session tokens, guest secrets, keys).
  // UUIDs (request ids, record ids) are identifiers, not secrets: keep them for correlation.
  [
    /\b(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b)[A-Za-z0-9_-]{32,}\b/gi,
    '[token]',
  ],
];

const SENSITIVE_KEY =
  /^(password|newPassword|currentPassword|secret|token|code|backupCode|apiKey|authorization|cookie)$/i;

export function redact(message: string): string {
  return RULES.reduce(
    (text, [re, replacement]) => text.replace(re, replacement),
    message,
  );
}

export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redact(value);
  if (value instanceof Error) {
    const copy = new Error(redact(value.message));
    copy.name = value.name;
    copy.stack = value.stack ? redact(value.stack) : undefined;
    return copy;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        SENSITIVE_KEY.test(k) ? '[redacted]' : redactValue(v),
      ]),
    );
  }
  return value;
}
