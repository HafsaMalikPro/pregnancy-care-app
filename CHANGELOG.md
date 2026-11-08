# Changelog

## 2026-11-08 — Password minimum lowered to 8 characters (owner decision)

- `PASSWORD_MIN_LENGTH` is now 8 (was 12), in the API and the website.
- By the owner's choice, the bundled breached-password list still covers 12+ characters only.
  Breached passwords of 8–11 characters (for example `pass@123`, entry #21,622 in the NCSC
  list) are accepted. This is recorded as a finding in `docs/SECURITY_PENETRATION_TEST_REPORT.md`.
- The boundary tests moved to 7 (refused) and 8 (accepted).

## 2026-11-08 — Production security hardening

Threat model: `docs/THREAT_MODEL.md`. Controls and tests: `docs/SECURITY_CHECKLIST.md`.

### Hardening phase 8 — Logging, monitoring and audit

- Security events in `audit_events`, queryable by administrators (`?action=security.…`):
  - `sign_in_failed`, `sign_in_locked`, `two_factor_failed`;
  - `rate_limited` (every 429, from any source);
  - `staff_access_denied` (with reason), `csrf_rejected`.
  - Emails and IPs are stored only as keyed pseudonyms.
  - Noisy events are de-duplicated per client and route per minute.
  - Writes never fail the request.
- The request id is also set on the incoming request headers, so Better Auth events carry it.
- New `docs/MONITORING.md`: the events, the alerts that should page someone (with
  thresholds), example queries, and what the health endpoints expose.
- TOTP test helpers moved to `test/support/totp.ts`. New tests check each event, pseudonyms
  only, admin query, de-duplicated 429 events, request ids on all responses and in error
  bodies, and that health endpoints reveal status only.

### Hardening phase 7 — Dependencies, supply chain and secrets

- Removed `@nestjs/mau` (and the unused `deploy` script). Its `undici` and `tmp` were all 8
  high advisories; the audit went from 24 advisories (8 high) to 1 moderate.
- `scripts/audit-gate.mjs` runs in CI over production and development dependencies. It fails
  on any high or critical advisory unless `security/audit-exceptions.json` lists it with a
  reason, a reviewer and an expiry date at most 90 days ahead (currently none).
- Dependabot for npm, GitHub Actions and the Docker base image.
- gitleaks:
  - `.gitleaks.toml`, and a pre-commit hook (`scripts/git-hooks/pre-commit`) that refuses `.env`
    files and scans staged changes.
  - The full history scan found no credentials. Six synthetic fixtures are recorded in
    `.gitleaksignore`, and a literal fixture is now generated at runtime.
- New `apps/api/Dockerfile` (multi-stage) and `.dockerignore`:
  - base image pinned by digest; production dependencies only;
  - numeric non-root user, read-only app files, health check;
  - a separate `migrate` target.
  - Verified: it boots in production mode with `--read-only --cap-drop ALL`, becomes healthy,
    serves no `/docs`, and logs JSON with no secrets.
  - hadolint passes, and a CI container job lints, builds and checks the image.
- `.env.example` and the variables test were already in place (local setup work).

### Hardening phase 6 — Data protection and privacy

- **Field encryption** (AES-256-GCM, key id in every value, column name as authenticated data)
  for journal notes and questions, checklist notes, appointment notes and questions, and
  birth-preference notes. Production requires `FIELD_ENCRYPTION_KEYS` and
  `FIELD_ENCRYPTION_ACTIVE_KEY`. Legacy plaintext still reads.
  `pnpm --filter api fields:reencrypt` encrypts existing rows and rotates keys (idempotent).
  The export decrypts. Every e2e suite now runs with encryption on.
- **Redacting logger** for Nest and Better Auth: credentials, cookies, password and token
  fields, email mailboxes, connection strings and opaque tokens are removed, while UUIDs are
  kept for correlation. JSON lines in production.
- **Account deletion anonymises the audit trail.** Earlier events lose the person's actor and
  target ids (the append-only trigger's one permitted change). The deletion event stores a
  keyed pseudonym instead of the user id. The two existing assertions that looked the event up
  by raw user id were updated to look it up by pseudonym.
- **Retention purge** every `RETENTION_PURGE_INTERVAL_MS` (6 h): expired guests with their
  data, deliveries after 90 days, expired sessions and tokens, stale lockout counters, and
  privacy jobs after 3 years. Audit events are not purged.
- New `docs/DEPLOYMENT_SECURITY.md` (data at rest, keys and rotation, retention, logs).
- New tests:
  - ciphertext in every column, with plaintext through the API and export;
  - rotation and legacy migration;
  - a tampered value is a generic 500;
  - no secrets in logs for a failed sign-in or a 500;
  - no SQL or Prisma detail in a 409;
  - no row references a deleted person (all tables scanned);
  - retention purge;
  - cipher and redaction unit tests.
- Unit + e2e 895/895, statements 96.64%.

### Hardening phase 5 — Rate limits and resource protection

- Every write route now has its own limit. New `ownerWrite` (60/min) covers 36 owner writes;
  new `staffWrite` (60/min) covers 17 admin writes. A reflection test fails on any new write
  route without one.
- Postgres `statement_timeout` and `idle_in_transaction_session_timeout` come from
  `DATABASE_STATEMENT_TIMEOUT_MS` (default 10 s). HTTP `requestTimeout` comes from
  `REQUEST_TIMEOUT_MS` (default 15 s), with a 10 s header timeout.
- Tests:
  - owner-write limit (61st write is 429, while reads still work);
  - page size capped at 100 on every list endpoint;
  - server timeouts;
  - a 5 s query is cancelled under a 500 ms limit, and the pool still works afterwards.
- The `.env.example` secret check now ignores variable names. It still catches a planted
  secret.

### Hardening phase 4 — Transport, headers and CORS

- Helmet 8.3.0 on every response:
  - HSTS `max-age=31536000; includeSubDomains`, `nosniff`, `X-Frame-Options: DENY`,
    `Referrer-Policy: no-referrer`, CORP `same-site`, COOP `same-origin`, and a minimal
    Permissions-Policy;
  - API CSP `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`.
    Only the development Swagger UI gets a looser CSP, and it still can't be framed.
- ETags are off. Writes, credentialed requests and `/v1/auth`, `/v1/me` and `/v1/admin` are
  `Cache-Control: no-store`. Uncredentialed public content gets `Vary: Origin, Authorization,
  Cookie`.
- Production refuses a `BETTER_AUTH_SECRET` with fewer than 16 distinct characters or a
  placeholder-looking value (CI's shared test value is one). Test fixtures now use random
  secrets.
- New `test/security/headers.e2e-spec.ts`:
  - every header on Nest, Better Auth and 404 responses;
  - no-store and no ETag on private responses;
  - CORS refuses unknown, `null`, unlisted-subdomain, lookalike-suffix and http origins;
  - no wildcard origin.
- Production mode now also checks HSTS, the CSP and the disabled schema route. Unit + e2e
  865/865, statements 97.25%.

### Hardening phase 3 — Input validation and output safety

- **Request bodies must be JSON.** Any other body type now gets 415 `UNSUPPORTED_MEDIA_TYPE`
  (new `ErrorCode`) instead of being silently ignored. Parser 415s (bad charset or encoding)
  now use that code too, instead of `VALIDATION_ERROR`; the two existing tests were updated
  for the new code and still check for a generic 4xx message.
- **Authored content is checked server-side** on create and edit (`src/content/content-safety.ts`),
  for titles, summaries, bodies and every nested string in structured sections. Refused: raw
  HTML (tags, comments), numeric character references, and link targets other than https://
  or site-relative paths. Obfuscated schemes are caught too (mixed case, embedded whitespace
  or control characters, reference-style links).
- New `ParseSlugPipe` for every `:slug` parameter (same pattern and 120-character limit used
  at creation). A malformed slug is a 404 and never reaches the database.
- Two array fields gained `ArrayMaxSize`. New unit tests:
  - every DTO string has a length bound and every array a size bound (257 properties checked);
  - only parameterised tagged-template raw SQL is used (`$queryRawUnsafe`,
    `$executeRawUnsafe`, `Prisma.raw` and the function-call forms are forbidden).
- New `test/security/input.e2e-spec.ts`: 415, malformed JSON, 413, mass assignment,
  SQL-looking text stored literally, malformed path parameters, unsafe content refused, and
  no credential or hash fields in responses or response schemas. Unit + e2e 843/843,
  statements 97.23%.

### Hardening phase 2 — Authorization

- `@Public(reason)` and `@OptionalAuth(reason)` now require a written reason. A new test lists
  every registered route: the 17 reachable without credentials must match a reviewed
  allow-list, and every other route must answer 401 without credentials.
- Owner scoping is enforced at test time (`src/database/owner-scope.spec.ts`): every Prisma
  call on an owner model (read from the schema) must show owner scoping or carry a reviewed
  `// owner-scope:` reason. The 13 existing exceptions were checked and annotated.
- `audit_events` is append-only in the database (migration
  `20261108130000_audit_append_only`): UPDATE, DELETE and TRUNCATE are refused for every role.
  The only allowed change is clearing actor/target ids inside a transaction that opts in
  (account deletion).
- New tests: tracker IDOR (another user and a guest), refused `pending_deletion`/`deleted`
  accounts including staff. Unit + e2e 807/807.

### Hardening phase 1 — Authentication and sessions

- **Fixed: rate limits could be bypassed by spoofing `X-Forwarded-For`.** Better Auth trusted
  the header as sent. New `TRUST_PROXY` (default `false`, `true` refused) sets Express
  `trust proxy`; the resolved IP is passed to Better Auth in a header the API overwrites on
  every request.
- **Fixed: `GET /v1/auth/open-api/generate-schema` was public in production.** Disabled; `/docs`
  still builds the auth schema in-process.
- Passwords: scrypt N=2^15, r=8, p=3 (an OWASP equal-strength option; Better Auth's default was
  a third of that work) with constant-time comparison. Legacy hashes still verify and are
  upgraded on the next sign-in. Breached passwords (bundled NCSC list, 1,197 entries of 12+
  characters) are refused on sign-up, change and reset (`PASSWORD_COMPROMISED`). Optional
  `PASSWORD_BREACH_CHECK=hibp` adds the Have I Been Pwned k-anonymity check.
- Sign-in lockout per account (5 failures in 15 min, doubling to 30 min; also for unknown
  emails, so no enumeration) and per IP (50 failures, doubling to 2 h). New table
  `auth_throttles` (migration `20261108120000_auth_hardening`).
- Sessions: 7-day idle timeout, 30-day absolute cap enforced by a database trigger,
  `SameSite=Lax` and `HttpOnly` set explicitly. A password change always revokes other sessions
  and invalidates outstanding reset links.
- CSRF: cookie-authenticated writes (Nest and Better Auth routes) need an allowed `Origin` or
  `Referer`. Bearer and anonymous credentials are unaffected.
- Two-factor challenge cookie lasts 5 minutes (was 10).
- New `test/security/` suites (auth, rate-limit, trust-proxy) and unit tests for hashing,
  lockout, CSRF and `TRUST_PROXY`. Unit + e2e 798/798, statements 97.21%.

## 2026-11-07

### Phase 0 — Baseline

- Recorded the baseline in `docs/BASELINE_2026-11-07.md` (unit 269/269, e2e 377/377,
  combined coverage 646/646 at 97.05% statements).
- `test:coverage`: e2e hook timeout raised so the combined unit + e2e run no longer times out
  in `platform.e2e-spec.ts` setup.
- `turbo.json`: `pnpm dev` now passes shell variables (`RATE_LIMIT_ENABLED`, `EMAIL_PROVIDER`, …)
  through to the API; strict env mode had been dropping them.

### Phase 1 — Security and correctness

- Two-factor sign-in tested end to end (`test/two-factor.e2e-spec.ts`): TOTP, single-use backup
  codes, wrong codes, codes without the password step, regenerated codes. Backup-code guesses,
  `verify-password`, `change-password`, 2FA enable/disable and backup-code regeneration now
  have Better Auth rate limits.
- Guest linking: a refused link returns `409 ACCOUNT_HAS_HEALTH_DATA` (new `ErrorCode`). Tests
  cover the success path (secret retired) and the 409 path (nothing moved, secret still works,
  guest can export, retry into an empty account succeeds).
- Email verification links now expire after 30 minutes (were 24 hours). New tests: link
  lifetime, replay has no effect, resend does not reveal whether an address exists, reset
  token lifetime.
- Disabled `update-session` (always 400) and `revoke-sessions` (unused); documented with every
  other disabled auth route in `docs/API_INVENTORY.md`.
- `PUT /v1/daily-plan/{date}/tasks/{key}` rejects future dates. New e2e suite for owners in
  UTC+14 and UTC−11: reads report the zone date, and journal, cycle, pregnancy-end and
  daily-plan writes reject the zone's tomorrow.
- OpenAPI: removed `POST /v1/auth/get-session` (405 at runtime) and the two disabled routes
  (96 → 94 paths). New tests compare the documented Nest routes with the live Express router and
  probe every documented auth operation for 404/405.
- Per-route write limits: consent changes 30/hour, pregnancy start/re-date/end 20/hour.
- Production guard: new `AUTH_COOKIE_SECURE` (default on in production and staging; production
  refuses `false`). An e2e test checks that production session cookies are `__Secure-`,
  `Secure` and `HttpOnly`.

### Phase 2 — 9-month product (backend)

- `FEATURE_PREMIUM_LOCKS` (default `false`): nothing is locked and `GET /v1/me/entitlement`
  reports `locksEnabled: false`, so clients show no paywall. Every gate goes through
  `EntitlementsService.canAccessPremium`. The `subscriptions` table is unchanged; payments stay
  out of scope.
- Symptom checks: `GET /v1/symptom-checks/options` (fixed vocabulary) and
  `POST /v1/symptom-checks`, a rule-based triage (`routine` / `call_clinic_today` /
  `emergency`) from the version-controlled `src/symptoms/triage-rules.json`. Any red flag
  escalates. The result is always returned, including to visitors and without consent; it is
  saved to the journal only with `health_data_processing` consent. The rules file has
  `review: null`, and the API labels it "not yet clinically reviewed".
- Kick counter (third trimester): sessions, kick counts, per-day totals and an owner-set
  clinician threshold with an alert template. Contraction timer: start/stop with duration and
  interval per day and a fixed "contact your maternity unit" message.
- Prenatal visit schedule per trimester from reviewed content, mapped onto the pregnancy with
  booked appointments. Postpartum mode: week guides 1–6 after birth plus recovery checklist.
- Opt-in weight tracking (`/v1/weight-entries`): plain trend with no target ranges or ideal
  weight.
- Profile: `quietHoursStart` / `quietHoursEnd` (set as a pair; reminder emails inside the
  window are skipped with `QUIET_HOURS`) and `weightTrackingEnabled`.
- Export bundle is now `preconception-export@2` and includes symptom checks, kick sessions,
  contractions and weight entries. Guest linking and deletion cover the new tables.
- Migration `20261107105913_tracking_and_postpartum` (four owner tables with the single-owner
  CHECK and cascades).
- Tests: existing suites updated for the new profile fields, export format and owner tables.
  `content-admin` runs with locks on, and `journey-tracking` covers locks off. The paused
  reminder test now checks its own reminder instead of global tick counts (it was flaky with
  other files' reminders). New e2e test: quiet hours skip delivery and scheduling continues.
  Unit + e2e 746/746, statements 97.05%. OpenAPI 113 paths, regenerated with no diff.

### Phase 1 follow-up — password reset and verification in OpenAPI

- `docs/api/openapi.json` is now exported with an email provider enabled, so it lists
  `request-password-reset`, `reset-password`, `verify-email` and `send-verification-email`
  (113 → 117 paths). Each is marked public and "needs an email provider". The contract test
  runs with `EMAIL_PROVIDER=memory`, and a production-mode test checks they answer 404 when
  `EMAIL_PROVIDER=none`.
- `scripts/export-openapi.mjs` imports the app after setting its env (static ESM imports
  had loaded the config first).

### Local environment setup

- `apps/api/.env.example` rewritten by section (runtime, database, auth, cookies and CORS,
  email, rate limiting, MFA, features, dev/tests). Every variable has its purpose, whether it's
  required, allowed values and default. Secrets are empty.
- New `src/config/env-example.spec.ts`: fails if the code reads a variable the template doesn't
  list (or the template lists one the code never reads), or if the template holds a value that
  looks like a secret.
- `CORS_ORIGINS` is now validated: each entry must be an exact `scheme://host[:port]` origin.
  Paths, trailing slashes and a missing scheme used to be accepted and then never matched.
- Docker Postgres container is named `preconception-db` (same volume, data kept).
- New `docs/LOCAL_SETUP.md`: prerequisites, generating the secret without printing it,
  database, tests, seeds and troubleshooting.
