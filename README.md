# Preconception Platform

Backend for the platform: a single NestJS API on PostgreSQL. All business rules (cycle
estimates, access control, entitlements) live in the API; clients consume it over HTTP via the
OpenAPI spec and `packages/contracts`.

## Layout

```
apps/
  api/      NestJS 12 · Prisma 7 · PostgreSQL       :4000  (/v1/*, OpenAPI at /docs)
packages/
  contracts/      zod request/response schemas, error codes
  utils/          pure date helpers (no health logic)
  config/         shared tsconfig bases
infra/docker/     local Postgres (docker compose)
content/          clinical content templates and the draft-only import workflow
docs/             architecture, privacy-security, medical-safety, product, api
```

## Requirements

- Node 22.17+ (see `.nvmrc`), pnpm 11 (pinned via `packageManager`)
- Docker (local Postgres)

## First run

```sh
pnpm install
pnpm db:up                                  # Postgres on localhost:5434
cp apps/api/.env.example apps/api/.env      # then generate the secret: docs/LOCAL_SETUP.md
pnpm --filter @preconception/api db:migrate
pnpm build                                  # shared packages must build before apps typecheck
pnpm dev                                    # api + package watchers
```

Optional sample content for local testing (5 articles, week guides 6–16, 5 checklist tasks):
`cd apps/api && pnpm dlx tsx prisma/seed.ts`. Never run it against a real environment.

The website lives in the separate `frontend` repo (`../frontend`) and calls this API on
`http://localhost:4000`.

Local Postgres uses port **5434** to avoid clashing with other Postgres instances on 5432/5433.

## Checks (what CI runs)

```sh
pnpm format:check
pnpm build && pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @preconception/api exec prisma validate
export TEST_DATABASE_URL=postgresql://preconception:preconception_local@localhost:5434/preconception_e2e
pnpm --filter @preconception/api test:e2e         # integration + e2e, real Postgres
pnpm --filter @preconception/api test:coverage    # unit + e2e, fails below 80% coverage
pnpm audit --prod --audit-level high
```

E2E tests create accounts and publish test content, so they run only against the disposable
database named in `TEST_DATABASE_URL` (create it once with `createdb`, then
`DATABASE_URL=$TEST_DATABASE_URL pnpm --filter @preconception/api db:deploy`). They never fall
back to `DATABASE_URL` and refuse non-local hosts (`apps/api/test/db-safety.ts`). Test
factories live in `apps/api/test/fixtures.ts`. Latest QA results: `docs/QA_REPORT_2026-11-06.md`. After changing an endpoint, run
`pnpm --filter @preconception/api build && pnpm --filter @preconception/api openapi:export`
to refresh `docs/api/openapi.json` (an e2e test fails if it drifts).

API audit, load testing and scaling: `docs/API_INVENTORY.md`, `docs/API_TEST_REPORT.md`,
`docs/LOAD_TEST_REPORT.md`, `docs/SCALABILITY_REVIEW.md`, `docs/DEPLOYMENT_RECOMMENDATIONS.md`,
and `tests/load/README.md`.

CI is defined in `.github/workflows/ci.yml`.

## Email, password reset and reminder delivery

Off by default (`EMAIL_PROVIDER=none`). For local testing set `EMAIL_PROVIDER=log`: emails,
including reset and verification links, are printed to the API console. Add
`REMINDER_DELIVERY_ENABLED=true` to run the reminder scheduler. Production uses
`EMAIL_PROVIDER=resend` with `EMAIL_FROM` and `RESEND_API_KEY`. Design and limits are in
`docs/BACKEND_AUDIT_2026-10-29.md` §4–5.

How the website should call the API (auth, sessions, CORS, errors, pagination, planning):
`docs/api/FRONTEND_INTEGRATION.md`. Nutrition, exercise, baby-care, birth and daily-planning
extension (audit, design, tests, deployment): `docs/PLATFORM_EXTENSION_2026-11-03.md`.
Authoring and importing clinical content: `content/README.md`. Latest audit, fixes and deployment checklist:
`docs/BACKEND_AUDIT_2026-10-29.md`.

## Rules that apply everywhere

- Never import `apps/api` code into a client. Share through `packages/contracts`.
- Never compute cycle estimates on a client. Render what the API returns, including `limitations`.
- Never put health data (dates, symptoms, notes) in URLs, logs, analytics or audit metadata.
- Never trust `userId`, premium status or roles sent by a client.

See `docs/architecture/decisions.md` for the reasoning and `docs/architecture/data-model.md`
for schema rules.

## Application audit (2026-10-23)

A full read-only audit of the codebase as it stands. Status labels (functional / partial /
mocked / placeholder) are based on reading the actual code, not on what a UI or doc claims.

> Snapshot from before 2026-10-28, when `apps/web`, `apps/admin`, `apps/mobile` and
> `packages/design-tokens` were removed from this repo. Frontend findings below are historical.

### 1. Project overview

**What this is.** A pnpm/Turborepo monorepo for a health-tech product. It was originally built
as a **preconception** app (menstrual cycle tracking, fertility-window estimates, "readiness"
tasks) and is now mid-pivot toward a broader **pregnancy companion app** (see
`docs/product/PREGNANCY_APP_PRD.md`), but almost none of the pregnancy-specific product scope
(weekly content, nutrition, symptom/warning-sign journal, appointments, postpartum) exists yet —
it is a roadmap, not shipped work.

| Layer | Tech | Status |
| --- | --- | --- |
| API | NestJS 12, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, Better Auth | Mature, real, well-tested |
| Web (`apps/web`, :3000) | Next.js 16 | Unmodified `create-next-app` scaffold |
| Admin (`apps/admin`, :3001) | Next.js 16 | Unmodified `create-next-app` scaffold |
| Mobile (`apps/mobile`) | Expo SDK 58 / React Native 0.88, expo-router | Partially real — 4 working screens, guest-only |
| Shared contracts (`packages/contracts`) | Zod schemas, `ApiError` envelope | Real and mature (449 lines modelling the full intended domain) |
| Shared `design-tokens`, `utils` | Colours/spacing/type scale; pure date helpers | Real, but not imported anywhere in web/admin; `utils` used on mobile |
| Infra | Docker Compose Postgres (local, port 5434) | Dev-only, no deployment config found |

**Architecture** (per `docs/architecture/decisions.md`): modular monolith, one NestJS API,
URI-versioned (`/v1/...`), default-deny auth via a global guard, anonymous-first identity (hashed
secrets, no raw secret stored), Better Auth for registered users (email/password + staff 2FA),
consent-gated writes for all health data, immediate/irreversible deletion, append-only audit
trail that is contractually forbidden from holding health values.

### 2. Completed features

**Backend (`apps/api`) — the one genuinely mature layer**

| Feature | Status | Evidence |
| --- | --- | --- |
| Identity: anonymous sessions, link-to-account, `/v1/me` | Fully functional | `auth/anonymous.controller.ts`, hashed secrets, transactional merge on link, 409 on conflict |
| Better Auth (email/password, bearer sessions, staff 2FA) | Fully functional | `auth/better-auth.ts`, ~22 real routes |
| Profile | Functional | upsert, IANA timezone validation |
| Consent (`health_data_processing` gate) | Functional — the actual access gate | `consent/consent.service.ts` — 403 `CONSENT_REQUIRED` enforced on every health write |
| Cycle tracking + estimate algorithm (`calendar-average@1`) | Functional | real mean/stdev over last ≤6 cycles, confidence tiers, limitations text always returned |
| Pregnancy dating (LMP/due-date/ultrasound/IVF), timeline, current week | Functional | server computes gestational age/week/trimester per ACOG rules |
| Daily logs (fixed symptom vocabulary) | Functional | upsert by date, 366-day range cap |
| Content workflow (draft→review→publish, articles + week guides + readiness tasks) | Functional, but no content has actually been written | self-review blocked, versioned, archives prior published version |
| Entitlements (premium read) | Read path functional, write path doesn't exist | derives from `Subscription` table, but nothing anywhere writes to it — no Stripe/App Store/Play webhook. Premium can never actually turn on. |
| Reminders | CRUD-only storage, no delivery | no cron/queue/push library in `package.json` at all — a reminder row is stored and never fires |
| Privacy export/deletion | Fully functional, real GDPR-style behaviour | synchronous full export, immediate cascade delete, staff-deprovision guard |
| Admin (articles, week-guides, readiness-tasks, users, staff roles, audit log) | Fully functional at the API layer | role-gated (`@Staff(...)`), audited, but zero UI exists to drive any of it |
| Audit trail | Functional | transactional, typed to exclude health values |

81 total operations (59 Nest + 22 Better Auth) — matches `docs/API_INVENTORY.md` exactly. No
discrepancies were found between that doc / `decisions.md` / `data-model.md` and the actual
code (one cosmetic mismatch: ADR 001 lists a "subscriptions" module that doesn't exist as its
own folder — it lives inside `entitlements/`).

**Mobile (`apps/mobile`) — partially real, guest-only**

| Screen | Status | Evidence |
| --- | --- | --- |
| "Today" (pregnancy summary, dating onboarding) | Functional, live API calls | `createPregnancy`/`getThisWeek` → real `/pregnancies*` endpoints, inline consent recording |
| Discover (article list + detail) | Functional | real `/articles` calls; premium lock is display-only, no purchase flow |
| Tools (readiness checklist) | Functional | real `/readiness/tasks` + progress PUT |
| Sign-in / sign-up / account linking | Backend-complete, zero UI | `src/api/services/session.ts` has working `signUp`/`signIn`/`linkGuestData` — never called from any screen. App only ever runs as anonymous guest. |
| Cycles, daily-logs, profile, reminders, privacy, admin | No mobile client exists at all | confirmed via grep — zero service files for 6 of the API's ~11 modules |
| Push notifications | Not implemented | `expo-notifications` is a declared dependency, never imported |

**Web (`apps/web`) & Admin (`apps/admin`) — 0% built**

Both are byte-identical, unmodified `create-next-app` boilerplate — the generator's default
"Deploy Now / Documentation / Templates" landing page, `title: 'Create Next App'` never changed.
No login page, no routes beyond `/`, no forms, no state management, no data fetching (no React
Query/SWR/axios even installed), and a `src/lib/api.ts` that computes an unused URL constant and
is imported nowhere. The admin app has no auth and no distinction from the public site other
than its port number, despite this README describing it as a "protected admin portal."

### 3. Application workflow

Today, the only way to actually use this product is the mobile app, and only as an anonymous
guest — there is no way to sign in from any client UI, even though the backend fully supports it.

```mermaid
flowchart TD
    A[App opens] --> B[bootstrap.ts: ensureSession]
    B -->|no stored credential| C[POST /v1/anonymous-sessions<br/>secret stored in SecureStore]
    B -->|credential exists| D[Reuse stored anonymous secret<br/>or user token]
    C --> E[Today tab]
    D --> E
    E -->|no pregnancy yet| F[Prompt for dates]
    F --> G[Inline consent record<br/>POST /v1/me/consents]
    G --> H[POST /v1/pregnancies]
    H --> I[AuthGuard resolves owner]
    I --> J[ConsentService.assertHealthDataConsent]
    J -->|granted| K[PregnancyService computes due date,<br/>week, trimester server-side]
    J -->|not granted| Z[403 CONSENT_REQUIRED]
    K --> L[Prisma -> PostgreSQL]
    E --> M[Discover tab: GET /articles]
    E --> N[Tools tab: readiness tasks + progress]
    M --> O{article.locked?}
    O -->|premium, no entitlement| P[Body hidden -<br/>no purchase flow exists to unlock it]
    O -->|free| Q[Full article shown]

    subgraph "Never reachable from any UI"
      R[signUp / signIn / linkGuestData<br/>fully implemented in mobile API layer]
      S[Reminder rows created via API<br/>but nothing ever delivers them]
      T[Admin content workflow<br/>draft -> review -> publish<br/>exists only via raw API/Swagger]
    end
```

- **Routing/navigation:** mobile uses expo-router with 3 tabs / 5 screens total; web and admin
  each have a single static route.
- **Validation:** NestJS `ValidationPipe` with `whitelist`+`forbidNonWhitelisted` rejects unknown
  fields; mobile additionally validates responses client-side with the same Zod schemas from
  `packages/contracts`, giving real type parity between mobile and API.
- **Auth/session:** a default-deny global guard resolves either a Better Auth session
  (cookie/bearer) or an `Authorization: Anonymous <secret>` header hashed against the DB — but
  since no client exposes a login screen, every real request today is anonymous.
- **Background jobs/notifications:** none exist. No cron, no queue, no push SDK anywhere in
  `apps/api` or `apps/mobile` dependencies. Reminders and entitlements are both "write never
  happens" or "fire never happens" gaps — documented as open gaps in `docs/API_INVENTORY.md`.
- **Admin workflow:** a content editor/clinical reviewer/administrator can only act today by
  calling the API directly (e.g. via the auto-generated `/docs` OpenAPI UI outside production) —
  `apps/admin` provides no interface for any of it.

### 4. API and database audit

**Endpoint inventory** (by module):

| Module | Endpoints | Auth | Status |
| --- | --- | --- | --- |
| health | 2 | public | Functional |
| identity (`/anonymous-sessions`, `/me`, `/auth/*`) | ~25 | public/owner/mixed | Functional |
| profile | 2 | owner | Functional |
| consent | 2 | owner | Functional — the real access gate |
| entitlements | 1 | owner | Read-only functional; write path missing (no billing webhook) |
| cycles | 5 | owner+consent | Functional |
| pregnancy | 9 | owner+consent / public (week-guides) | Functional |
| daily-logs | 4 | owner+consent | Functional |
| content (articles, readiness) | 4 | optional auth / owner | Functional |
| reminders | 4 | owner | Storage-only, no delivery |
| privacy | 3 | owner, rate-limited | Functional, real export/deletion |
| admin (articles, week-guides, readiness-tasks, users, staff-role, audit) | ~20 | staff roles | Functional, no UI consumer |

**Database** (`apps/api/prisma/schema.prisma`, 3 migrations): Better Auth identity tables
(`User`, `AuthSession`, `AuthAccount`, `AuthVerification`, `TwoFactor`), `AnonymousSession`,
`Profile`, `Cycle`, `DailyLog`, `Pregnancy` + `PregnancyDating` (append-only history),
`ReadinessTask`/`UserTaskProgress`, `Article`/`ContentReview`, `ConsentRecord` (append-only),
`Reminder`, `Subscription`/`SubscriptionEvent`, `PrivacyJob`, `AuditEvent`. Hand-written
CHECK/EXCLUDE constraints cover invariants Prisma can't express (exactly-one-owner, no
overlapping cycles, one active pregnancy, one published article per slug).

**Frontend-to-backend connection matrix:**

| Client | Modules actually consumed | Modules with zero client code |
| --- | --- | --- |
| Mobile | pregnancy, articles/content, readiness, consent (write-only) | cycles, daily-logs, profile, reminders, privacy, entitlements (read never called), admin, audit |
| Web | none | all |
| Admin | none | all — including the fully-built admin API |

**Missing/incomplete, concretely:**

1. Entitlements can never actually activate — no payment provider is wired up anywhere.
2. Reminders are inert — created and stored, never evaluated or delivered.
3. No anonymous-session purge job — expired rows persist indefinitely (documented gap).
4. Mobile has no account-creation path despite the backend fully supporting it.
5. `apps/admin` provides no way to operate the content-review workflow that already exists
   server-side.
6. `apps/web` and `apps/admin` are both pre-feature-work scaffolding — the single biggest gap
   relative to how far the backend has come.

**Mock/hardcoded data:** none found anywhere — the backend has no stubs disguised as real logic,
and the frontends have nothing to mock because nothing beyond boilerplate exists.

**Cross-check.** The project's own `docs/product/ROADMAP.md` (dated 2026-10-19, self-graded
against the repo) independently lands on the same picture — of 68 planned items for the
*pregnancy* product, 11 done / 13 partial / 44 not started, with zero UI/UX design work
completed. That roadmap is scoped to the pregnancy pivot, not the original preconception
product, which is why the backend looks far more complete than the roadmap percentage suggests —
the preconception API was essentially finished before the pregnancy pivot began.
