# Integrating the website with the API

For the Next.js site in `../frontend` (or any browser client). The source of truth for
request and response shapes is `docs/api/openapi.json` (served at `/docs` outside production)
and the zod schemas in `packages/contracts`. An e2e test fails if the served document drifts
from the committed one, and another fails if a route is added without being documented.

## Base URL and versioning

All routes live under `/v1` (for example `GET /v1/articles`). Breaking changes would ship
under a new prefix; additive changes (new optional request fields, new response fields, new
routes) can appear within `/v1`, so clients should ignore unknown response fields.

## CORS and cookies

- Browser origins must be listed in the API's `CORS_ORIGINS` (comma-separated). Credentials
  are allowed for those origins only. Production refuses to boot unless every origin is
  `https://`.
- Exposed response headers: `x-request-id`, `set-auth-token`.
- Serve the website and API from the same site (e.g. `app.example.com` and
  `api.example.com`) so the session cookie is first-party. Cookies are `Secure` in production.
- Send `credentials: "include"` on every request. Better Auth rejects cookie-authenticated
  writes from origins it doesn't trust (CSRF protection), so browsers must send their normal
  `Origin` header.

## Who is calling

The API resolves one owner per request, in this order:

1. `Authorization: Anonymous <secret>`: a guest session (`POST /v1/anonymous-sessions`
   returns the secret once; the API stores only its hash). Guest data expires after 180 days
   without activity (`ANONYMOUS_SESSION_TTL_DAYS`).
2. `Authorization: Bearer <token>`: a session token (mobile, scripts). Returned in the
   `set-auth-token` header on sign-up and sign-in.
3. The Better Auth session cookie (browsers).

Because the guest header wins, a browser holding a guest secret must leave it off account
calls (sign-up, sign-in, linking). The website does this with `asAccount: true` in
`src/lib/api.ts`.

### Restoring a session

Call `GET /v1/me` on load:

| Response | Meaning |
| --- | --- |
| `200 { kind: "user", … }` | Signed in. `emailVerified`, `staffRole`, `twoFactorEnabled` included |
| `200 { kind: "anonymous", … }` | Guest |
| `401 UNAUTHORIZED` | Nobody. If a guest secret was sent, it has expired or was deleted: drop it and call again without it |

Any other route returning `401` means the session has ended (sign-out elsewhere, password
reset, expiry after 30 days). Treat it as signed out and send the person to sign in. Sessions
refresh automatically on use (at most once a day); there is no separate refresh call.

### Account routes (Better Auth, under `/v1/auth`)

| Route | Notes |
| --- | --- |
| `POST /sign-up/email` `{ name, email, password }` | Password 12–128 characters. Signs in immediately |
| `POST /sign-in/email` `{ email, password, rememberMe? }` | `{ twoFactorRedirect: true }` when TOTP is on: then `POST /two-factor/verify-totp { code }` or, with a lost authenticator, `POST /two-factor/verify-backup-code { code }` (single use). Both need the `two_factor` cookie from this response (10 minutes) |
| `POST /sign-out` | |
| `GET /get-session`, `GET /list-sessions`, `POST /revoke-session { token }`, `POST /revoke-other-sessions` | Device management |
| `POST /update-user { name }`, `POST /change-password` | |
| `POST /two-factor/enable \| disable { password }` | |
| `POST /request-password-reset { email }` | Same response whether or not the address exists. Emails a link to `${APP_URL}/reset-password?token=…` |
| `POST /reset-password { token, newPassword }` | Token is single use, valid 30 minutes; all sessions are revoked |
| `GET /verify-email?token=…` | Link sent on sign-up to `${APP_URL}/verify-email?token=…`. Valid 30 minutes; never creates a session |
| `POST /send-verification-email { email }` | Resend the verification link. Same response whether or not the address exists |

The four email routes return `404` while the deployment has no email provider
(`EMAIL_PROVIDER=none`). Show those features only if your deployment configures one.

Rate limits on auth (per IP): sign-in 5/min, sign-up 10/hour, TOTP and backup codes 5/min,
password-reset requests 5/hour, reset submissions 5/min, verification emails 5/hour. Other
routes: 120/min per IP; export and deletion 3/hour; consent changes 30/hour; starting,
re-dating or ending a pregnancy 20/hour. Full table: `docs/API_INVENTORY.md` ("Rate limits").
A limit returns `429 RATE_LIMITED`.

`update-session` and `revoke-sessions` are disabled (404): use `sign-out` for this device and
`revoke-other-sessions` for the rest.

## Linking a guest to an account

After sign-up or sign-in, `POST /v1/anonymous-sessions/link { secret }` with the account's
credentials (not the guest header). The move is one transaction. It returns counts of moved
records. `409` with code `ACCOUNT_HAS_HEALTH_DATA` if the account already has health data
(histories are never merged); `404` if the secret is unknown, expired or already linked.

**Keep the guest secret until the link succeeds.** On 409 nothing has moved and the secret still
works: offer to keep using the guest data (stay signed in as the guest) or to export it
(`POST /v1/me/export` with the guest header) before discarding it. On a network error or 5xx,
keep the secret and retry.

## Errors

Every non-2xx response from `/v1` (except Better Auth's `/v1/auth/*` routes, which return
`{ code, message }`) has this shape, plus an `x-request-id` header:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "The request is invalid.",
  "details": [{ "path": "lmpDate", "message": "lmpDate cannot be in the future" }],
  "requestId": "…" } }
```

| Status | `code` | Typical cause |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Field-level problems in `details` |
| 401 | `UNAUTHORIZED` | No or expired session |
| 403 | `FORBIDDEN` | Wrong role, guest on an account-only route |
| 403 | `CONSENT_REQUIRED` | Health data write without `health_data_processing` consent |
| 403 | `PREMIUM_REQUIRED` | Premium-only action |
| 404 | `NOT_FOUND` | Includes "no active pregnancy" on `/pregnancies/current*` |
| 409 | `CONFLICT` | Duplicate or state conflict (active pregnancy exists, linking refused) |
| 413 | `PAYLOAD_TOO_LARGE` | Body over 100 kB |
| 429 | `RATE_LIMITED` | Slow down |
| 5xx | `INTERNAL_ERROR` | Show a retry; quote `requestId` to support |

## Consent

Writes of pregnancy, journal, checklist, cycle, appointment, meal-log, activity-log, birth
preference and daily-plan data need
`POST /v1/me/consents { purpose: "health_data_processing", granted: true, policyVersion, source }`.
Each change is a new record carrying the policy version and timestamp. After withdrawal,
existing data stays readable, exportable and deletable, but new health data can't be saved
(`403 CONSENT_REQUIRED`).

## Lists and pagination

`GET /v1/articles`, `GET /v1/recipes`, `GET /v1/activities`, `GET /v1/meal-plans`,
`GET /v1/pregnancies`, `GET /v1/admin/articles`, `GET /v1/admin/users` and
`GET /v1/admin/audit-events` take `limit` (1–100, default 20) and `offset`, and return
`{ items, page: { limit, offset, total } }`. Lists that are small by design return plain
arrays: readiness tasks, reminders (at most 20 per owner), week guides, saved items,
shopping-list items, appointments (at most a year per request), and daily logs, which need
`from` and `to` at most 366 days apart. Meal and activity logs take `from`/`to` at most 92
days apart.

## Content

- Public: `GET /v1/articles` (filter by `category`, `trimester`, `tag`), `GET /v1/articles/{slug}`,
  `GET /v1/week-guides/{week}` (1–42; `404` when that week has no published guide) and
  `GET /v1/week-guides?from=1&to=42`, which returns every published guide in the range in one
  response (use it instead of 42 single requests). Only published, current versions are served.
- Structured content, also public and published only: `GET /v1/recipes` (filter by `slot`,
  `diet`, `excludeAllergens=milk,egg`, `trimester`, `tag`), `GET /v1/activities` (`type`,
  `trimester`, `week`), `GET /v1/meal-plans` (`diet`, `trimester`) and `/{slug}` for each.
  Shapes are `Recipe`, `Activity` and `MealPlan` in `packages/contracts`.
- "Reviewed" means `review` is non-null: the approving clinical review of that version. Never
  label content as reviewed when `review` is null, even if it is published.
- Week guides may include `sections.babyMilestones` (list) and `sections.sizeComparison`
  (`null` unless the reviewer approved one; typical values, never a measurement of the user's
  baby).
- Article `body` is Markdown written by editors. Render it without raw HTML (the website uses
  react-markdown, which drops HTML and unsafe link protocols).
- Premium: the API decides. `premium: true` with `locked: true` and `body: null` means the
  caller has no active entitlement. Never unlock content in the client.
  `GET /v1/me/entitlement` returns `{ premium, status, expiresAt }`. There is no purchase
  flow: see "Payments" in `docs/BACKEND_AUDIT_2026-10-29.md`.

## Pregnancy

The API is the only place gestational age, trimester, milestones and due dates are computed
(`apps/api/src/pregnancy/dating.ts`). Clients may preview an estimate (the website does, in
onboarding) but must display the values the API returns after saving.

Also: `GET /v1/pregnancies/current/weeks/{week}` (that week's dates for this pregnancy,
`past`/`current`/`upcoming`, and its guide) and `GET|PUT /v1/pregnancies/current/birth-preferences`.
Pregnancy details accept `clinicianNutritionPlan` ("a clinician or dietitian manages what I
eat"); when true, `GET /v1/me/meal-plan` returns `availability: "clinician_guidance"` and no
plan. Ending a pregnancy pauses readiness check-in reminders, and for a loss or other outcome
the daily journal reminder too; the person can turn them back on.

## Planning (personal, owner-scoped)

| What | Endpoints | Notes |
| --- | --- | --- |
| Meal plan | `GET /v1/me/meal-plan?date=&days=1..7` | Filters reviewed plans by diet, allergies, intolerances, excluded foods and clinician-advised restrictions. `availability` explains an empty result: `no_pregnancy`, `clinician_guidance`, `none_published`, `none_matching`. No targets are computed. |
| Meal logs | `GET /v1/meal-logs?from&to`, `PUT|DELETE /v1/meal-logs/{date}/{slot}/{recipeSlug}` | PUT is idempotent. Future dates `400`. |
| Shopping list | `GET|POST|DELETE /v1/shopping-list`, `PATCH|DELETE /v1/shopping-list/{id}`, `POST /v1/shopping-list/from-meal-plan` | Names are lower-cased and unique; adding from the plan never duplicates. `DELETE /v1/shopping-list` clears checked items. |
| Exercise plan | `GET /v1/me/exercise-plan?date=` | Activities reviewed for the current week. `clinician_guidance` (and no activities) when `restrictExercise` is true. Always show `disclaimer`. |
| Activity logs | `GET /v1/activity-logs?from&to`, `PUT|DELETE /v1/activity-logs/{date}/{activitySlug}` | PUT is idempotent per day and activity; it updates `minutes`. Not medical monitoring. |
| Saved | `GET /v1/saved?kind=`, `PUT|DELETE /v1/saved/{kind}/{slug}` | Kept by slug, so items follow new versions. |
| Appointments | `GET|POST /v1/appointments`, `GET|PATCH|DELETE /v1/appointments/{id}` | `startsAt` must include a UTC offset. They send nothing; pair with a reminder. |
| Daily plan | `GET /v1/daily-plan?date=&days=1..7`, `PUT /v1/daily-plan/{date}/tasks/{key}` | Read-only aggregation in the profile's time zone; task keys are stable. `done` comes only from saved records. Complete a task through its `source`: `plan` (the PUT, only `guide:w<week>`), `journal`/`hydration` → `PUT /v1/daily-logs/{date}` (`waterGlasses`), `meal` → meal logs, `activity` → activity logs, `checklist` → readiness progress. `appointment` and `reminder` tasks are informational (`completable: false`). |

Daily logs also take `mood`, `sleepMinutes`, `waterGlasses`, `activityMinutes` and `questions`.
They are optional: an omitted field keeps its saved value; send `null` to clear it. The same
rule applies to the new profile preferences (`foodIntolerances`, `excludedFoods`,
`cuisinePreferences`, `contentTopics`, `reducedMotion`, `largerText`), so older clients never
wipe them. Readiness tasks add `fromWeek`, `toWeek` and `recommendedNow`, and
`GET /v1/readiness/tasks?category=hospital_bag` filters by category (see
`PreparationCategory` in contracts for the newborn and birth lists).

## Reminders and delivery

`channel` is `none` (in-app only, the default) or `email`. Ask
`GET /v1/reminders/delivery-options` first: `{ channels: ["email"], emailVerified }` when this
deployment sends email and the caller is an account. Creating an `email` reminder returns
`400` for guests and `409` when delivery is off or the address isn't confirmed.
`nextRunAt` (UTC) shows the next send. It moves when the profile time zone changes, and is
`null` when paused. Push notifications are not supported.

## Privacy

- `POST /v1/me/export` returns a JSON bundle (`format: "preconception-export@1"`) of
  everything stored for the caller, including consent history, recent reminder deliveries,
  appointments, birth preferences, meal and activity logs, saved items, the shopping list and
  daily-plan completions. New sections were added without changing existing ones.
- `POST /v1/me/deletion { confirm: "DELETE MY ACCOUNT" }` deletes the account straight away and
  returns `204` once done. Guests use `DELETE /v1/anonymous-sessions/current`.
- `GET /v1/me/privacy-jobs` lists export and deletion jobs.
