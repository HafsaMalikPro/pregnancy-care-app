# API Inventory

Updated 2026-10-19, after the Phase 3 pregnancy core was added. Counts come from the routes Nest
registers at boot plus the Better Auth routes left enabled, and are cross-checked against
`docs/api/openapi.json`. Two e2e tests keep this honest: one fails if a registered route is
undocumented, the other if any non-public route answers without credentials.

## Summary

| Metric | Count |
|---|---|
| **Total application operations** | **81** (66 paths) |
| Nest (platform) operations | 59 |
| Better Auth operations (`/v1/auth/*`) | 22 |
| By method (all) | GET 32 · POST 35 · PUT 4 · PATCH 6 · DELETE 4 |
| By method (Nest) | GET 27 · POST 18 · PUT 4 · PATCH 6 · DELETE 4 |
| Public (no credentials) | 10: 4 Nest (2 health, start anonymous session, week guide) + 6 auth (sign-up, sign-in, 2FA verify ×2, ok, error) |
| Optional auth (public, entitlement-aware) | 2: article list and read |
| Owner (user **or** anonymous session) | 33 |
| Registered user only | 3 Nest + 16 Better Auth session routes |
| Staff only (role + 2FA) | 17 |
| Incomplete / duplicated | 0 / 0 |
| Framework routes (non-production only) | `/docs`, `/docs/openapi.json`, `/docs-yaml` |
| Better Auth routes **disabled** on purpose | 17 (see below) |

**Before this work:** 2 endpoints (health only). Clients still don't call the API; wiring the
web, admin and mobile apps is separate work.

## Access model

| Requirement | How it is resolved | Failure |
|---|---|---|
| default (`owner`) | Better Auth session (cookie or `Authorization: Bearer`) **or** `Authorization: Anonymous <secret>` | 401 `UNAUTHORIZED` |
| `@UserOnly()` | registered user | 403 for anonymous sessions |
| `@Staff(...roles)` | user with a matching `staff_role` (administrator passes all) **and** 2FA enabled (`ADMIN_REQUIRE_MFA`) | 403 |
| `@OptionalAuth()` | credentials used if sent; invalid ones still 401 | — |
| `@Public()` | nothing | — |

The guard is global and **default-deny**: a new route is protected unless explicitly marked
public. Ownership is enforced in every query (`ownerWhere`); another owner's id returns **404**,
never 403, so ids can't be probed. Health-data writes also need `health_data_processing`
consent (403 `CONSENT_REQUIRED`); premium content needs an entitlement (403 `PREMIUM_REQUIRED`).

## Endpoints

### Platform (Nest, `/v1`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health/live` | public | Liveness (no dependencies) |
| GET | `/health` | public | Readiness (`SELECT 1`, 2 s timeout; 503 when down) |
| POST | `/anonymous-sessions` | public, 10/h/IP | Start anonymous use; returns secret once |
| DELETE | `/anonymous-sessions/current` | anonymous | Delete session and all its data |
| POST | `/anonymous-sessions/link` | user, 10/h | Move anonymous data into the account (409 if account has health data) |
| GET | `/me` | owner | Current caller |
| GET | `/me/profile` | owner | Profile (defaults if never saved) |
| PUT | `/me/profile` | owner | Replace profile (IANA time zone, locale, planning horizon) |
| GET | `/me/consents` | owner | Current state per purpose |
| POST | `/me/consents` | owner | Append grant/withdrawal |
| GET | `/me/entitlement` | owner | Premium status from verified subscriptions |
| POST | `/pregnancies` | owner + consent | Start tracking; API computes the estimated due date (LMP, due date, ultrasound, IVF); 409 if one is active |
| GET | `/pregnancies` | owner | All pregnancies, newest first |
| GET | `/pregnancies/current` | owner | Active pregnancy with today's gestational age, week, trimester, term status |
| PATCH | `/pregnancies/current` | owner + consent | First pregnancy, number of babies, clinician restrictions |
| PUT | `/pregnancies/current/dating` | owner + consent | Re-date (e.g. after a scan); returns the shift in days |
| GET | `/pregnancies/current/dating-history` | owner | Every due-date estimate and its inputs |
| GET | `/pregnancies/current/timeline` | owner | Weeks 1–42 with dates + trimester/term milestones |
| GET | `/pregnancies/current/week` | owner | This week's status + published guide (or null) |
| POST | `/pregnancies/current/end` | owner + consent | End (birth, loss, other); a new pregnancy can follow |
| GET | `/week-guides/{week}` | public | Published, clinically reviewed week guide |
| GET | `/cycles` | owner | Periods, newest first, paginated |
| GET | `/cycles/estimate` | owner | `calendar-average@1` next-period window + limitations |
| GET | `/cycles/{id}` | owner | One period |
| POST | `/cycles` | owner + consent | Record period (409 overlap, 400 future / >30 days) |
| PATCH | `/cycles/{id}` | owner + consent | Correct period |
| DELETE | `/cycles/{id}` | owner | Delete period |
| GET | `/daily-logs?from&to` | owner | Logs in a range (≤ 366 days) |
| GET | `/daily-logs/{date}` | owner | One day |
| PUT | `/daily-logs/{date}` | owner + consent | Create/replace (fixed symptom vocabulary, note ≤ 2000) |
| DELETE | `/daily-logs/{date}` | owner | Delete one day |
| GET | `/readiness/tasks` | owner | Published plan with progress; premium tasks locked |
| PUT | `/readiness/tasks/{taskId}/progress` | owner + consent (+ premium) | Complete/uncomplete with private note |
| GET | `/articles` | optional | Published articles, paginated |
| GET | `/articles/{slug}` | optional | Article + clinical review; premium body locked without entitlement |
| GET | `/reminders` | owner | List |
| POST | `/reminders` | owner | Create (max 20; HH:MM; DAILY/WEEKLY RRULE subset) |
| PATCH | `/reminders/{id}` | owner | Update |
| DELETE | `/reminders/{id}` | owner | Delete |
| POST | `/me/export` | owner, 3/h | Download all data (JSON attachment, `no-store`) |
| POST | `/me/deletion` | user, 3/h | Delete account immediately (`confirm` phrase; staff → 409) |
| GET | `/me/privacy-jobs` | user | Export/deletion history |
| GET | `/admin/articles` | editor, reviewer | All versions, filter by status/slug |
| GET | `/admin/articles/{id}` | editor, reviewer | Version + reviews |
| POST | `/admin/articles` | editor | New draft / new version (409 if a working copy exists) |
| PATCH | `/admin/articles/{id}` | editor | Edit draft |
| POST | `/admin/articles/{id}/submit` | editor | Draft → in review |
| POST | `/admin/articles/{id}/reviews` | reviewer | Approve / request changes (not own article) |
| POST | `/admin/articles/{id}/publish` | editor | Approved → published; archives previous; review due +12 months |
| POST | `/admin/articles/{id}/archive` | editor | Archive / unpublish |
| POST | `/admin/week-guides` | editor | New week-guide draft (`pregnancy-week-<n>`); review and publish via `/admin/articles/{id}` |
| GET | `/admin/readiness-tasks` | editor, reviewer | All tasks |
| POST | `/admin/readiness-tasks` | editor | Create draft (409 duplicate key) |
| PATCH | `/admin/readiness-tasks/{id}` | editor | Edit (returns task to draft) |
| POST | `/admin/readiness-tasks/{id}/publish` | reviewer | Publish |
| POST | `/admin/readiness-tasks/{id}/archive` | editor | Archive |
| GET | `/admin/users` | support | Account lookup (no health data) |
| PATCH | `/admin/users/{id}/staff-role` | administrator | Grant/remove role (not own; revokes sessions; audited) |
| GET | `/admin/audit-events` | administrator | Audit trail |

Every admin mutation, link, export and deletion writes an `audit_events` row containing
identifiers only, never health values.

### Better Auth (`/v1/auth`, enabled)

Public: `POST sign-up/email`, `POST sign-in/email`, `POST two-factor/verify-totp`,
`POST two-factor/verify-backup-code`, `GET ok`, `GET error`.
Session: `GET|POST get-session`, `sign-out`, `verify-password`, `change-password`,
`update-session`, `update-user` (name/image only; role, status and 2FA flags are not writable),
`GET list-sessions`, `revoke-session`, `revoke-sessions`, `revoke-other-sessions`,
`GET list-accounts`, `two-factor/get-totp-uri`, `two-factor/generate-backup-codes`,
`two-factor/enable`, `two-factor/disable`.

Better Auth responses use Better Auth's own error format, not `ApiError`. This is a known
exception to ADR 006.

**Disabled (404):** social sign-in, OAuth callbacks, link/unlink account, token refresh,
access-token, account-info, password reset (3 routes), email verification (2), change-email,
`delete-user` (2, which would bypass the audited deletion), email/SMS OTP (2). Re-enable them when an
OAuth provider or an email provider is configured.

## Remaining gaps (not implemented)

| Gap | Why |
|---|---|
| Store subscription verification and webhooks (App Store, Play, web) | Needs provider credentials and signature verification. An unverified webhook endpoint would let anyone grant premium. `subscriptions` rows are only read today |
| Email verification, password reset | Needs an email provider; tokens must not be logged |
| Anonymous-session expiry purge job | Expired sessions stop authenticating immediately; a scheduled delete of their rows is still needed |
| Multi-locale content | Only `en` is supported |
| Client integration (web, admin, mobile) | Not part of the API work |
