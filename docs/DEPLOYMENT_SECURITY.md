# Deployment security

What a production deployment must provide around the API. The repository enforces what it
can at boot (`src/config/env.ts`) and in tests (`docs/SECURITY_CHECKLIST.md`). This document
covers what only the platform can provide. It is provider-neutral: any host, database
service and secret manager that meets these requirements will do.

## Data at rest

Two layers protect health data.

1. **Storage encryption (platform).** The PostgreSQL volume, its snapshots and every backup
   must be encrypted at rest with keys held by the platform's KMS. Managed PostgreSQL services
   generally offer this; enable it for the instance, the automated backups and any
   cross-region copies.
2. **Field encryption (application).** The most sensitive free text is encrypted by the API
   before it reaches the database (AES-256-GCM, a random IV per value, and the column name as
   authenticated data):

   | Column | Content |
   | --- | --- |
   | `daily_logs.note`, `daily_logs.questions` | Journal notes and questions for the clinician |
   | `user_task_progress.note` | Private checklist notes |
   | `appointments.notes`, `appointments.questions` | Appointment notes and questions |
   | `birth_preferences.notes` | Birth-plan notes |

   A database dump, a backup or a read-only SQL account shows `enc1.<key id>.…`, not the text.
   Structured values (dates, symptom codes, mood, weight) stay in plaintext columns so they
   can be queried, and are covered by storage encryption.

### Keys

- `FIELD_ENCRYPTION_KEYS` lists one or more `<id>:<base64 of 32 random bytes>`, and
  `FIELD_ENCRYPTION_ACTIVE_KEY` names the one used for new writes. Production refuses to boot
  without them.
- Keys and `BETTER_AUTH_SECRET` come from the secret manager as environment variables at
  runtime. They never come from the repository or the image, and they never appear in logs.
- Generate a key: `printf 'k2:%s' "$(openssl rand -base64 32)"` (run it where the output goes
  straight into the secret manager).

### Turning field encryption on for existing data, and rotating keys

1. Add the new key to `FIELD_ENCRYPTION_KEYS`, keeping every existing key listed.
2. Set `FIELD_ENCRYPTION_ACTIVE_KEY` to the new id and deploy. New writes use it, and old
   values still decrypt.
3. Run `pnpm --filter api fields:reencrypt` once (after `pnpm build`). It encrypts any legacy
   plaintext and rewrites values under older keys. It is idempotent and resumable, and prints
   counts only.
4. Only after it reports 0 rows on a second run, remove the old key from
   `FIELD_ENCRYPTION_KEYS`.

**Never remove a key that still protects data.** Values under a missing key cannot be read
(the API answers 500 for that record), and nothing can recover them.

`test/security/data-protection.e2e-spec.ts` checks the raw columns hold ciphertext, that
values under an older key and legacy plaintext still read, and that the re-encryption job
moves everything to the active key.

## Retention

The API purges data past its retention period every `RETENTION_PURGE_INTERVAL_MS` (6 hours by
default; `src/privacy/retention.service.ts`).

| Data | Kept for | Then |
| --- | --- | --- |
| Guest (anonymous) sessions and their records | 180 days after last use (`ANONYMOUS_SESSION_TTL_DAYS`) | Deleted with all their data |
| Reminder deliveries (sent, failed, skipped, cancelled) | 90 days | Deleted |
| Auth sessions | Until expiry: 7 days idle, at most 30 days | Deleted |
| Reset and verification tokens | Until expiry (30 minutes) | Deleted |
| Sign-in lockout counters | 1 day without activity (never while a lock runs) | Deleted |
| Privacy jobs (export and deletion receipts) | 3 years | Deleted |
| Audit events | Not purged | Append-only. The legal retention period is a decision for the data controller (see open items in `docs/SECURITY_CHECKLIST.md`) |
| Accounts and their health data | Until the person deletes the account | Deleted immediately and irreversibly. Audit references are anonymised, and the deletion itself is recorded under a keyed pseudonym |

## Logs

- Every log line goes through redaction (`src/common/logging/redact.ts`): credentials,
  cookies, password and token fields, email mailboxes, connection-string credentials and
  long opaque tokens are removed. Request ids and record ids (UUIDs) are kept for
  correlation.
- Production writes one JSON object per line. The code never logs request bodies or health
  values; a 500 logs only the method, route, error class and request id.
- Keep application logs for at most 30 days unless a legal requirement says otherwise, with
  access limited to the operations team.
