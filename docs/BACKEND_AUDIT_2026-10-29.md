# Backend audit and hardening (2026-10-29)

Scope: everything the Next.js website relies on. Results below are from commands run on
2026-10-29 on an Apple M1 laptop (Node 22.17.1, PostgreSQL 17 in Docker), not from CI.

## 1. Baseline before changes

| Check | Result |
| --- | --- |
| `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` | Pass |
| Unit tests (`pnpm test`) | 161 / 161 pass |
| Integration tests (`test:e2e`) on a fresh database | 225 / 225 pass |
| Migrations from an empty database, then `prisma migrate diff` | Apply cleanly; no drift |
| `pnpm audit --prod` | 2 high (body-parser 2.3.0, multer 2.4.0), 2 moderate + 2 low (fast-uri 3.1.8) |

## 2. Findings

Already sound (kept as is):

- Default-deny auth guard; owner resolved server-side; every owner query scoped by
  `ownerWhere`; staff routes role-checked, with TOTP required for staff in production.
- Error filter returns one shape with a request id and never logs request bodies.
- Consent: health writes need `health_data_processing`; every change is a new record with
  policy version and timestamp; withdrawal blocks new health writes and keeps reads, export and
  deletion working.
- Account deletion is one transaction: cascades remove health data, sessions and credentials;
  the privacy job and audit rows survive without the user id. It returns 204 only once done.
- Pregnancy maths has a single source (`pregnancy/dating.ts`); dates are UTC-midnight
  calendar dates; leap days are tested; 404 for no active pregnancy.
- Daily logs are unique per owner and date (DB constraints); list ranges capped at 366 days.
- Content is served only when published; the review workflow is enforced in
  `admin-content.service.ts`; premium bodies are withheld server-side.
- Migrations reproduce the schema from an empty database; CI checks drift.

Fixed in this pass:

| # | Finding | Severity | Fix |
| --- | --- | --- | --- |
| 1 | Guest linking checked "not yet linked" with a plain read. Two concurrent links of one guest session could both pass, and two guest sessions linking into one account at once could both pass the "account has no health data" check, leaving two active pregnancies | High (data integrity) | Account row locked `FOR UPDATE`; session claimed with a conditional update. Tested with racing requests |
| 2 | body-parser < 2.4.0 and multer < 2.5.0 DoS advisories (via `@nestjs/platform-express`); fast-uri < 3.1.9 (via Prisma dev tooling) | High | pnpm `overrides` to the patched releases in the same major. `pnpm audit --prod`: 0 known vulnerabilities. The app has no upload routes, so multer was never reachable, but it was installed |
| 3 | Production booted with development-only settings (rate limits off, staff MFA off, http URLs, empty CORS list) | Medium | `config/env.ts` refuses them in production and names the variable, never its value |
| 4 | `test:e2e` ran against whatever `DATABASE_URL` was set, usually the dev database, leaving test accounts and test content marked as clinically reviewed there | Medium | `TEST_DATABASE_URL` support in the e2e helper. The sample seed now refuses non-local databases |
| 5 | No password reset or email verification | Feature gap | Implemented (§4) |
| 6 | Reminders were stored but never delivered | Feature gap | Implemented for email (§5) |
| 7 | k6 tests covered only `/health` | Gap | User-journey load test added and run (§7) |

Not changed, worth knowing:

- Logs use Nest's text logger, not JSON. Request ids are on every response and error log line.
  Switch to a JSON logger when a log platform is chosen.
- Readiness (`GET /v1/health`) checks the database only. Reminder delivery health is at the
  staff-only `GET /v1/admin/reminder-deliveries/stats`, so the public probe exposes nothing
  about it.
- Sample content (`prisma/seed.ts`) is published without a clinical review. It is local-only
  and shows no "reviewed" badge. Real content must go through the admin review workflow.
- Your local dev database still contains rows created by earlier e2e runs, including week
  guides with test review records. Recreate it (`pnpm db:down`, remove the volume,
  `pnpm db:up`, migrate, seed) to clear them.

## 3. API contract

- Additive changes only. Reminders gain `channel` (`none` | `email`, default `none`) and
  `nextRunAt`; new `GET /v1/reminders/delivery-options` and
  `GET /v1/admin/reminder-deliveries/stats`. Password-reset and verification routes under
  `/v1/auth` exist only when an email provider is configured.
- `docs/api/openapi.json` regenerated. The drift test and the "every route documented" test
  both pass. `packages/contracts` gained `ReminderChannel` and `ReminderDeliveryOptions`.
- Integration guide for the website: `docs/api/FRONTEND_INTEGRATION.md` (auth order, session
  restore, CORS and cookies, errors, pagination, consent, premium, reminders, privacy).

## 4. Password reset and email verification

Built on Better Auth 1.7 rather than a parallel system:

- Off unless `EMAIL_PROVIDER` is set; the routes return 404 when it's `none`.
- Reset: `POST /v1/auth/request-password-reset` answers identically for unknown addresses,
  does a dummy lookup to even out timing, and sends in the background, so response time doesn't
  depend on the email. Tokens: 24 random characters, valid 30 minutes, stored as SHA-256 digests
  (`verification.storeIdentifier: "hashed"`), consumed atomically (single use). A reset revokes
  every session.
- Verification: sent on sign-up when email is on; signed token valid 24 hours; sets
  `emailVerified`. Sign-in does not require it.
- Links go to the website: `${APP_URL}/reset-password?token=…` and `${APP_URL}/verify-email?token=…`.
  **The website does not have these two pages yet.**
- Providers (`src/email/`): `none`, `log` (development only, refused in production; prints
  links), `memory` (tests only), `resend` (HTTP API; 429 and 5xx retryable, other 4xx permanent).
- Rate limits: reset requests 5/hour, reset submissions 5/min, verification sends 5/hour.

**Not verified:** delivery through a real Resend account (no credentials here). Request
shape and error mapping are unit-tested against a stubbed `fetch`.

## 5. Reminder delivery (email)

Design: Postgres-backed scheduling inside the API process. No new infrastructure. Several
instances can run it.

- `reminders.next_run_at` holds the next send (UTC), computed from the local time, rule
  and the owner's profile time zone (`reminders/schedule.ts`). DST rules: a time inside a
  spring-forward gap fires after the gap; a repeated fall-back time fires once, at the first
  occurrence. Unit-tested for London, New York, Karachi, Auckland, Tokyo and a leap day.
- Each tick (every `REMINDER_POLL_INTERVAL_MS`, default 30 s) locks due reminders with
  `FOR UPDATE SKIP LOCKED`, inserts a `reminder_deliveries` row per occurrence (unique on
  reminder + time, so never queued twice), then claims pending rows with `SKIP LOCKED` and sends.
- Before sending it re-checks the reminder (paused, deleted or switched to in-app → cancelled)
  and the account (deleted or email unconfirmed → skipped).
- Retries: 429, 5xx and network errors back off 1, 5, 15 and 60 minutes, up to 5 attempts;
  other errors fail at once. Rows stuck in `sending` for 10 minutes (crash) return to pending.
  Occurrences more than an hour late (outage) are skipped, not sent late.
- Editing, pausing or deleting a reminder cancels its queued sends in the same transaction. A
  time-zone change reschedules all of the owner's email reminders.
- Only accounts with a confirmed email can use `email`; a DB CHECK stops guest reminders
  from having it. Existing reminders default to `none`, so nobody starts receiving emails
  unasked.
- Emails contain only the person's own label (or a neutral default) and links. Delivery rows
  store status and machine codes only, never content or provider error text.
- Logs: one line per tick with counts; one warning per final failure (id and code only).
- At-least-once: if the process dies after the provider accepts a message but before the row
  is marked sent, that one email can repeat.

Push notifications are not implemented (no provider or device registration).

**Not verified:** sending through a real provider; behaviour under clock skew between
instances (all instances should use NTP).

## 6. Payments

No provider, product or pricing decision exists, so no payment code was added. The backend
stays the only source of entitlements (`subscriptions` rows; never a client flag). Premium
articles return `locked: true, body: null` to callers without an active entitlement, and the
website says premium can't be bought yet. Before building checkout, decide: provider (Stripe for
web; App Store / Play for apps), products, trial and refund policy, and tax handling. Then add
signed-webhook ingestion that is idempotent per event id and tolerant of out-of-order events,
writing `subscription_events` and `subscriptions`.

## 7. Load test

Configuration and measured results: see `docs/LOAD_TEST_REPORT.md` §7.

## 8. Tests and builds run for this pass

| Command | Result |
| --- | --- |
| `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check` | Pass |
| `pnpm test` | 182 / 182 (was 161: +schedule, env and email-sender tests) |
| `pnpm --filter @preconception/api test:e2e` on a fresh database | 242 / 242 (was 225: +17 for reset, verification, delivery and racing guest links) |
| Migrations on an empty database, then `prisma migrate diff --exit-code` | Clean, no drift |
| `pnpm audit --prod` | No known vulnerabilities |

## 9. Production setup still required

| Item | What to do |
| --- | --- |
| Database | Managed Postgres 17; `DATABASE_URL`, `DATABASE_POOL_MAX` × instances below `max_connections`; backups and point-in-time recovery; `prisma migrate deploy` in the release step |
| Auth | `BETTER_AUTH_SECRET` (≥ 32 random chars) from a secret store; `BETTER_AUTH_URL` = https API URL |
| Website | `APP_URL` and `CORS_ORIGINS` = https site origin; same-site domains so the cookie is first-party |
| Email | Resend account, verified sending domain (SPF, DKIM, DMARC), `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `RESEND_API_KEY` |
| Reminders | `REMINDER_DELIVERY_ENABLED=true` once email works; alert on `failed` counts and on `oldestPendingAt` older than a few minutes (`GET /v1/admin/reminder-deliveries/stats`) |
| Website pages | `/reset-password` and `/verify-email` in the frontend, plus an email toggle on reminders using `delivery-options` |
| Monitoring | Collect stdout logs; probes on `/v1/health/live` (liveness) and `/v1/health` (readiness); alert on 5xx rate |
| Load | Re-run `tests/load/journeys.js` on staging hardware before launch |
| Payments | Decision first (§6) |

## 10. Still incomplete

- Website pages for password reset and email verification, and the reminder email toggle.
- Real email delivery (needs provider credentials); push notifications.
- Payments.
- JSON structured logging and metrics export.
- Week-guide content beyond the local sample, through the clinical review workflow.
