import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/**
 * Security events (docs/MONITORING.md), written to `audit_events` with a `security.` action so
 * they are queryable with GET /v1/admin/audit-events?action=… and by SQL.
 *
 * Personal values are never stored: emails and IPs become keyed pseudonyms (`acct_…`, `ip_…`)
 * that still let an operator see "30 failures for one account" or "one IP across 200 accounts".
 * Writes are fire-and-forget and never fail the request. Noisy events are de-duplicated per
 * key per minute so an attacker cannot turn them into a write flood.
 */
export const SECURITY_EVENTS = {
  signInFailed: 'security.sign_in_failed',
  signInLocked: 'security.sign_in_locked',
  twoFactorFailed: 'security.two_factor_failed',
  rateLimited: 'security.rate_limited',
  staffAccessDenied: 'security.staff_access_denied',
  csrfRejected: 'security.csrf_rejected',
} as const;
export type SecurityEventName =
  (typeof SECURITY_EVENTS)[keyof typeof SECURITY_EVENTS];

const DEDUPE_MS = 60_000;
const DEDUPE_MAX_KEYS = 10_000;

export interface SecurityEventInput {
  actorUserId?: string | null;
  actorRole?: string | null;
  requestId?: string;
  /** Raw values are converted to pseudonyms here; never put them in `metadata`. */
  email?: string | null;
  ip?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  /** When set, at most one event per (action, key) per minute. */
  dedupeKey?: string;
}

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger('SecurityEvents');
  private readonly recent = new Map<string, number>();
  private pending = new Set<Promise<unknown>>();

  constructor(private readonly audit: AuditService) {}

  record(action: SecurityEventName, input: SecurityEventInput = {}): void {
    if (input.dedupeKey && this.isDuplicate(`${action}|${input.dedupeKey}`))
      return;
    const metadata = {
      ...input.metadata,
      ...(input.email
        ? {
            accountRef: this.audit.ref(
              'acct',
              input.email.trim().toLowerCase(),
            ),
          }
        : {}),
      ...(input.ip ? { ipRef: this.audit.ref('ip', input.ip) } : {}),
    };
    const write = this.audit
      .record({
        action,
        actorUserId: input.actorUserId ?? null,
        actorRole: input.actorRole ?? null,
        requestId: input.requestId,
        metadata,
      })
      .catch((err: unknown) =>
        this.logger.warn(`could not record ${action}: ${(err as Error).name}`),
      )
      .finally(() => this.pending.delete(write));
    this.pending.add(write);
  }

  /** Resolves when every write started so far has finished (tests, shutdown). */
  async flush(): Promise<void> {
    await Promise.all(this.pending);
  }

  private isDuplicate(key: string): boolean {
    const now = Date.now();
    const last = this.recent.get(key);
    if (last !== undefined && now - last < DEDUPE_MS) return true;
    if (this.recent.size >= DEDUPE_MAX_KEYS) {
      for (const [k, t] of this.recent)
        if (now - t >= DEDUPE_MS) this.recent.delete(k);
      if (this.recent.size >= DEDUPE_MAX_KEYS) this.recent.clear();
    }
    this.recent.set(key, now);
    return false;
  }
}
