# API Documentation and Integration Audit

**Pregnancy Care platform — NestJS API (backend) and Next.js website (frontend)**

| | |
|---|---|
| Audit date | 2026-11-06 |
| Backend repo | `preconception-platform/backend` (commit `5e9c13f` plus uncommitted QA fixes of 2026-11-06, see `backend/docs/QA_REPORT_2026-11-06.md`) |
| Frontend repo | `preconception-platform/frontend` (commit `b7cdab9`, unmodified by this audit) |
| Environment | Local only. PostgreSQL 17 (Docker, port 5434) using disposable databases `preconception_test` and `preconception_fe_e2e`. No production system, real email, notification or payment was touched. |
| Status labels | **PASS** = success response observed and the test's assertions held · **PASS (live)** = verified by a live HTTP request made during this audit · **PARTIAL** · **NOT TESTED** · **BLOCKED** |

> This document was produced from the running code, not from existing documentation. Every count was taken from the
> routes the application actually registers at runtime, and every "verified" claim comes from an observed HTTP response.
> How each number was obtained is described in [§20](#20-audit-method-scope-and-reproduction).

## Contents

1. [Project architecture overview](#1-project-architecture-overview)
2. [Backend technology stack](#2-backend-technology-stack)
3. [Frontend technology stack](#3-frontend-technology-stack)
4. [Backend API inventory](#4-backend-api-inventory)
5. [Exact API counts](#5-exact-api-counts)
6. [API-by-API functionality](#6-api-by-api-functionality)
7. [Frontend integration mapping](#7-frontend-integration-mapping)
8. [Feature-wise integration status](#8-feature-wise-integration-status)
9. [API verification and test results](#9-api-verification-and-test-results)
10. [Frontend/backend contract compatibility](#10-frontendbackend-contract-compatibility)
11. [Mock data audit](#11-mock-data-audit)
12. [Missing APIs and integration gaps](#12-missing-apis-and-integration-gaps)
13. [Broken or partially working APIs](#13-broken-or-partially-working-apis)
14. [Security and authorization findings](#14-security-and-authorization-findings)
15. [Database interaction details](#15-database-interaction-details)
16. [Critical issues](#16-critical-issues)
17. [Recommended fixes](#17-recommended-fixes)
18. [Implementation roadmap](#18-implementation-roadmap)
19. [Source file references](#19-source-file-references)
20. [Audit method, scope and reproduction](#20-audit-method-scope-and-reproduction)
21. [Final summary dashboard](#21-final-summary-dashboard)

---

## 1. Project architecture overview

```
 Browser ──► Next.js website (frontend, :3000)
               │  client components: fetch() with credentials:"include"  ──────────────┐
               │  server components: fetch() without credentials (public content, ISR 5 min)
               ▼                                                                         ▼
         NestJS API (backend/apps/api, :4000, all routes under /v1)
           ├─ requestId middleware → CORS (CORS_ORIGINS, credentials) → Better Auth handler (/v1/auth/*)
           ├─ global ThrottlerGuard (120/min/IP; tighter per route) → global AuthGuard (default deny)
           ├─ global ValidationPipe (whitelist + forbidNonWhitelisted) → controllers → services
           ├─ global ApiExceptionFilter (one error envelope, no internals)
           └─ Prisma 7 (adapter-pg) ──► PostgreSQL 17
         In-process reminder scheduler (optional) ──► Resend HTTP API (only when EMAIL_PROVIDER=resend)
```

- **Two repositories.** `backend/` is a pnpm/Turborepo monorepo (`apps/api`, `packages/contracts` with zod schemas,
  `packages/utils`). `frontend/` is a standalone Next.js app. The frontend does **not** import the contracts package;
  `frontend/src/lib/types.ts` is a hand-maintained copy (checked in §10).
- **Identity.** Every user-owned row belongs to exactly one owner: a registered user (Better Auth session via cookie or
  `Authorization: Bearer`) or a guest (`Authorization: Anonymous <secret>`). The website uses **cookies** for accounts and
  the **Anonymous** header for guests (`frontend/src/lib/api.ts`).
- **Business rules live in the API.** Due dates, gestational age, trimesters, plan filtering, consent and entitlement checks
  are all computed server-side. The website renders what the API returns.
- **Clinical content** (articles, week guides, recipes, activities, meal plans, checklist tasks) goes through
  draft → in review → approved → published, with role separation, audit trail and versioning.

## 2. Backend technology stack

| Concern | Technology (version from `apps/api/package.json`) |
|---|---|
| Runtime | Node.js ≥ 22.17 (CI uses `.nvmrc`), TypeScript 6, ESM |
| Framework | NestJS 12 (`@nestjs/core` 12.1.3 at runtime), Express 5 platform, URI versioning (`/v1`) |
| Database | PostgreSQL 17; Prisma 7.10.1 with `@prisma/adapter-pg`; 5 migrations; hand-written CHECK/EXCLUDE/partial-unique constraints |
| Auth | Better Auth 1.7.10 (email+password, database sessions, bearer plugin, TOTP two-factor) + custom anonymous sessions |
| Validation | class-validator DTOs (global pipe) + zod schemas from `packages/contracts` for structured content |
| Rate limiting | `@nestjs/throttler` 6.7.1 + Better Auth's limiter |
| API docs | `@nestjs/swagger` 12.0.2; served at `/docs` outside production; committed `backend/docs/api/openapi.json` |
| Email | Pluggable sender: `none` (default), `log` (dev), `memory` (tests), `resend` (HTTP API) |
| Tests | Vitest 4 (unit + e2e with supertest against real PostgreSQL), coverage v8 |

## 3. Frontend technology stack

| Concern | Technology (from `frontend/package.json`) |
|---|---|
| Framework | Next.js 16.4.3 (App Router), React 19.3, TypeScript 5 |
| Styling | Tailwind CSS 4, lucide-react icons, react-markdown for article bodies |
| Data fetching | No React Query/SWR/axios. `src/lib/api.ts` (`api()` fetch wrapper), `src/lib/use-api.ts` (`useApi()` hook: GET on mount, reload, setData), `src/lib/public-api.ts` (server-only reads with ISR `revalidate: 300` and 429 retry) |
| Session | `src/components/session-provider.tsx` (React context: `me`, `startGuest`, `signUp`, `signIn`, `verifyTotp`, `signOut`, guest linking) |
| Config | `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`); no other env vars |
| Tests | Vitest (20 unit tests) and Playwright (32 browser tests against a running site + API) |
| Rendering | Almost every page is a client component calling the API with the visitor's session; public topic pages are static with 5-minute revalidation |

---

## 4. Backend API inventory

All **125** operations the API serves (121 with the default configuration + 4 password-reset/verification
routes that exist only when an email provider is configured). IDs are stable within this document.
`*` marks a required field. Request and response shapes come from the OpenAPI document, which was confirmed to match all
99 runtime Nest routes exactly (§5.3). Database tables are listed by their PostgreSQL names.

**Legend.** Auth: *Guest or User* = any valid owner credential; *Staff* routes always admit `administrator`, and require two-factor auth unless `ADMIN_REQUIRE_MFA=false`.
Test coverage: *E2E: <file>* = `backend/apps/api/test/<file>.e2e-spec.ts` called it; *live* = verified by request during this audit; *browser* = called by the website during Playwright runs.


### 4.1 Module: `health`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-001 | GET | `/v1/health` | Public | none | 200 ReadinessDto {status*, database*} | raw SELECT 1 | Implemented | PASS | E2E: app, database-down, http-contract | `apps/api/src/health/health.controller.ts → HealthController.ready()` |
| API-002 | GET | `/v1/health/live` | Public | none | 200 LivenessDto {status*} | - | Implemented | PASS | E2E: database-down, http-contract, production-mode, rate-limit | `apps/api/src/health/health.controller.ts → HealthController.live()` |


### 4.2 Module: `auth`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-003 | POST | `/v1/anonymous-sessions` | Public | body: CreateAnonymousSessionDto {platform*} | 201 AnonymousSessionCreatedDto {id*, secret*, expiresAt*} | anonymous_sessions (create) | Implemented | PASS | E2E: content-admin, database, email-and-reminders, health-data, identity, planning, platform, pregnancy, pregnancy-journey, privacy, rate-limit, security; live; browser | `apps/api/src/auth/anonymous.controller.ts → AnonymousSessionController.create()` |
| API-004 | DELETE | `/v1/anonymous-sessions/current` | Guest or User | none | 204 (no body) | anonymous_sessions (delete, cascade to all owned tables), audit_events | Implemented | PASS | E2E: identity | `apps/api/src/auth/anonymous.controller.ts → AnonymousSessionController.deleteCurrent()` |
| API-005 | POST | `/v1/anonymous-sessions/link` | User (registered) | body: LinkAnonymousSessionDto {secret*} | 200 LinkResultDto {pregnancies*, cycles*, dailyLogs*, taskProgress*, consentRecords*, reminders*, profile*} | users, anonymous_sessions, pregnancies, cycles, daily_logs, user_task_progress, consent_records, reminders, appointments, meal_logs, activity_logs, plan_task_completions, saved_content, shopping_items, profiles, audit_events | Implemented | PASS | E2E: email-and-reminders, identity, platform, pregnancy, privacy, security; live | `apps/api/src/auth/anonymous.controller.ts → AnonymousSessionController.link()` |
| API-006 | POST | `/v1/auth/change-password` | User | body: {newPassword*, currentPassword*, revokeOtherSessions} | 200 {token, user*} | auth_accounts, auth_sessions | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-007 | GET | `/v1/auth/error` | Public | none | 200 (no body) | - | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-008 | GET | `/v1/auth/get-session` | Public (null without session) | none | 200 {session*, user*} | auth_sessions, users | Implemented | PASS (live) | live; browser | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-009 | GET | `/v1/auth/list-accounts` | User | none | 200 array of {id*, providerId*, createdAt*, updatedAt*, accountId*, userId*, scopes*} | auth_accounts | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-010 | GET | `/v1/auth/list-sessions` | User | none | 200 array of Session {id*, expiresAt*, token*, createdAt*, updatedAt*, ipAddress, userAgent, userId*} | auth_sessions | Implemented | PASS (live) | live; browser | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-011 | GET | `/v1/auth/ok` | Public | none | 200 {ok*} | - | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-012 | GET | `/v1/auth/open-api/generate-schema` | Public | — | see Better Auth | - | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-013 | POST | `/v1/auth/request-password-reset` | Public | — | see Better Auth | auth_verifications | Implemented (off unless EMAIL_PROVIDER set) | PASS | E2E: email-and-reminders, identity | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-014 | POST | `/v1/auth/reset-password` | Public (token) | — | see Better Auth | auth_verifications, auth_accounts, auth_sessions | Implemented (off unless EMAIL_PROVIDER set) | PASS | E2E: email-and-reminders | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-015 | POST | `/v1/auth/revoke-other-sessions` | User | body: object | 200 {status*} | auth_sessions | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-016 | POST | `/v1/auth/revoke-session` | User | body: {token*} | 200 {status*} | auth_sessions | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-017 | POST | `/v1/auth/revoke-sessions` | User | body: object | 200 {status*} | auth_sessions | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-018 | POST | `/v1/auth/send-verification-email` | Public/User | — | see Better Auth | auth_verifications | Implemented (off unless EMAIL_PROVIDER set) | NOT TESTED | none | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-019 | POST | `/v1/auth/sign-in/email` | Public | body: {email*, password*, callbackURL, rememberMe} | 200 {redirect*, token*, url, user*} | users, auth_accounts, auth_sessions, two_factors | Implemented | PASS | E2E: email-and-reminders, identity, rate-limit; live; browser | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-020 | POST | `/v1/auth/sign-out` | User | body: {callbackURL, disableRedirect, state} | 200 {success, url, redirect} | auth_sessions | Implemented | PASS | E2E: identity, security; live; browser | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-021 | POST | `/v1/auth/sign-up/email` | Public | body: {name*, email*, password*, image, callbackURL, rememberMe} | 200 {token, user*} | users, auth_accounts, auth_sessions | Implemented | PASS | E2E: content-admin, database, email-and-reminders, health-data, identity, planning, platform, pregnancy, pregnancy-journey, privacy, rate-limit, security; live; browser | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-022 | POST | `/v1/auth/two-factor/disable` | User | body: {password*} | 200 {status} | two_factors, users | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-023 | POST | `/v1/auth/two-factor/enable` | User | body: {password*, method, issuer} | 200 {method*, totpURI, backupCodes} | two_factors, users | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-024 | POST | `/v1/auth/two-factor/generate-backup-codes` | User | body: {password*} | 200 {status*, backupCodes*} | two_factors | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-025 | POST | `/v1/auth/two-factor/get-totp-uri` | User | body: {password*} | 200 {totpURI} | two_factors | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-026 | POST | `/v1/auth/two-factor/verify-backup-code` | 2FA cookie | body: {code*, disableSession, trustDevice} | 200 {user*, session*} | two_factors, auth_sessions | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-027 | POST | `/v1/auth/two-factor/verify-totp` | 2FA cookie or User | body: {code*, trustDevice} | 200 {status} | two_factors, users, auth_sessions | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-028 | POST | `/v1/auth/update-session` | User | body: object | 200 {session} | auth_sessions | Partial (no-op) | PARTIAL | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-029 | POST | `/v1/auth/update-user` | User | body: {name, image} | 200 {user} | users | Implemented | PASS (live) | E2E: identity, security; live; browser | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-030 | GET | `/v1/auth/verify-email` | Public (token) | — | 302/HTML or provider-defined | users | Implemented (off unless EMAIL_PROVIDER set) | PASS | E2E: email-and-reminders | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-031 | POST | `/v1/auth/verify-password` | User | body: {password*} | 200 {status} | auth_accounts | Implemented | PASS (live) | live | `apps/api/src/auth/better-auth.ts (Better Auth plugin route)` |
| API-032 | GET | `/v1/me` | Guest or User | none | 200 MeDto {kind*, id*, email, name, emailVerified, staffRole, twoFactorEnabled, expiresAt} | users / auth_sessions or anonymous_sessions (via guard) | Implemented | PASS | E2E: content-admin, email-and-reminders, identity, privacy, security; live; browser | `apps/api/src/auth/me.controller.ts → MeController.me()` |


### 4.3 Module: `consent`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-033 | GET | `/v1/me/consents` | Guest or User | none | 200 array of ConsentStateDto {purpose*, granted*, policyVersion*, updatedAt*} | consent_records (read) | Implemented | PASS | E2E: health-data, identity; browser | `apps/api/src/consent/consent.controller.ts → ConsentController.current()` |
| API-034 | POST | `/v1/me/consents` | Guest or User | body: RecordConsentDto {purpose*, granted*, policyVersion*, source*} | 201 ConsentStateDto {purpose*, granted*, policyVersion*, updatedAt*} | consent_records (create) | Implemented | PASS | E2E: content-admin, database, email-and-reminders, health-data, identity, planning, platform, pregnancy, pregnancy-journey, privacy, security; live; browser | `apps/api/src/consent/consent.controller.ts → ConsentController.record()` |


### 4.4 Module: `profile`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-035 | GET | `/v1/me/profile` | Guest or User | none | 200 ProfileDto {timeZone*, locale*, planningHorizonMonths*, countryCode*, dietPattern*, foodAllergies*, activityLevel*, foodIntolerances, excludedFoods, cuisinePreferences, contentTopics, reducedMotion, largerText} | profiles (read) | Implemented | PASS | E2E: health-data, identity, pregnancy; browser | `apps/api/src/profile/profile.controller.ts → ProfileController.get()` |
| API-036 | PUT | `/v1/me/profile` | Guest or User | body: ProfileDto {timeZone*, locale*, planningHorizonMonths*, countryCode*, dietPattern*, foodAllergies*, activityLevel*, foodIntolerances, excludedFoods, cuisinePreferences, contentTopics, reducedMotion, largerText} | 200 ProfileDto {timeZone*, locale*, planningHorizonMonths*, countryCode*, dietPattern*, foodAllergies*, activityLevel*, foodIntolerances, excludedFoods, cuisinePreferences, contentTopics, reducedMotion, largerText} | profiles (upsert), reminders, reminder_deliveries | Implemented | PASS | E2E: email-and-reminders, health-data, identity, planning, platform, pregnancy, pregnancy-journey, privacy; browser | `apps/api/src/profile/profile.controller.ts → ProfileController.put()` |


### 4.5 Module: `entitlements`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-037 | GET | `/v1/me/entitlement` | Guest or User | none | 200 EntitlementDto {premium*, status*, expiresAt*} | subscriptions (read) | Implemented (read only; nothing writes subscriptions) | PASS | E2E: content-admin, identity | `apps/api/src/entitlements/entitlements.controller.ts → EntitlementsController.get()` |


### 4.6 Module: `privacy`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-038 | POST | `/v1/me/deletion` | User (registered) | body: DeleteAccountDto {confirm*} | 204 (no body) | users (delete + cascade), anonymous_sessions, privacy_jobs, audit_events | Implemented | PASS | E2E: database, email-and-reminders, identity, platform, pregnancy, privacy, rate-limit, security; browser | `apps/api/src/privacy/privacy.controller.ts → PrivacyController.delete()` |
| API-039 | POST | `/v1/me/export` | Guest or User | none | 200 ExportBundleDto {format*, exportedAt*, account*, profile*, pregnancies*, consentHistory*, cycles*, dailyLogs*, readinessProgress*, reminders*, subscriptions*} | privacy_jobs, every owner table (read), audit_events | Implemented | PASS | E2E: database, identity, platform, pregnancy, privacy, rate-limit; live; browser | `apps/api/src/privacy/privacy.controller.ts → PrivacyController.export()` |
| API-040 | GET | `/v1/me/privacy-jobs` | User (registered) | none | 200 array of PrivacyJobDto {id*, kind*, status*, requestedAt*, completedAt*} | privacy_jobs (read) | Implemented | PASS | E2E: database, identity, privacy, security; live; browser | `apps/api/src/privacy/privacy.controller.ts → PrivacyController.jobs()` |


### 4.7 Module: `pregnancy`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-041 | GET | `/v1/pregnancies` | Guest or User | query: limit, offset | 200 PregnancyPageDto {items*, page*} | pregnancies (read) | Implemented | PASS | E2E: identity, platform, pregnancy, pregnancy-journey; browser | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.list()` |
| API-042 | POST | `/v1/pregnancies` | Guest or User | body: CreatePregnancyDto {firstPregnancy, fetusCount, confirmedByClinician, restrictExercise, clinicianNutritionPlan, foodRestrictions, dating*, source} | 201 PregnancyDto {id*, status*, dueDate*, datingMethod*, datingSource*, today*, gestationalAge*, week*, trimester*, termStatus*, daysUntilDue*, firstPregnancy*, fetusCount*, confirmedByClinician*, restrictExercise*, foodRestrictions*, clinicianNutritionPlan*, outcome*, endedOn*, createdAt*, updatedAt*} | pregnancies, pregnancy_datings (create) | Implemented | PASS | E2E: database, email-and-reminders, identity, planning, platform, pregnancy, pregnancy-journey, security; live; browser | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.create()` |
| API-043 | GET | `/v1/pregnancies/current` | Guest or User | none | 200 PregnancyDto {id*, status*, dueDate*, datingMethod*, datingSource*, today*, gestationalAge*, week*, trimester*, termStatus*, daysUntilDue*, firstPregnancy*, fetusCount*, confirmedByClinician*, restrictExercise*, foodRestrictions*, clinicianNutritionPlan*, outcome*, endedOn*, createdAt*, updatedAt*} | pregnancies, profiles (read) | Implemented | PASS | E2E: identity, platform, pregnancy, pregnancy-journey, security; browser | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.current()` |
| API-044 | PATCH | `/v1/pregnancies/current` | Guest or User | body: PregnancyDetailsDto {firstPregnancy, fetusCount, confirmedByClinician, restrictExercise, clinicianNutritionPlan, foodRestrictions} | 200 PregnancyDto {id*, status*, dueDate*, datingMethod*, datingSource*, today*, gestationalAge*, week*, trimester*, termStatus*, daysUntilDue*, firstPregnancy*, fetusCount*, confirmedByClinician*, restrictExercise*, foodRestrictions*, clinicianNutritionPlan*, outcome*, endedOn*, createdAt*, updatedAt*} | pregnancies (update) | Implemented | PASS | E2E: identity, pregnancy, pregnancy-journey | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.update()` |
| API-045 | GET | `/v1/pregnancies/current/birth-preferences` | Guest or User | none | 200 BirthPreferencesDto {birthSetting*, painRelief*, supportPeople*, feedingIntention*, notes*, updatedAt*} | birth_preferences (read) | Implemented | PASS | E2E: identity, platform; browser | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.birthPreferences()` |
| API-046 | PUT | `/v1/pregnancies/current/birth-preferences` | Guest or User | body: PutBirthPreferencesDto {birthSetting*, painRelief*, supportPeople*, feedingIntention*, notes*} | 200 BirthPreferencesDto {birthSetting*, painRelief*, supportPeople*, feedingIntention*, notes*, updatedAt*} | birth_preferences (upsert) | Implemented | PASS | E2E: database, identity, platform; browser | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.putBirthPreferences()` |
| API-047 | PUT | `/v1/pregnancies/current/dating` | Guest or User | body: RedateDto {dating*, source} | 200 RedateResultDto {pregnancy*, change*} | pregnancy_datings (create), pregnancies (update) | Implemented | PASS | E2E: identity, pregnancy, pregnancy-journey | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.redate()` |
| API-048 | GET | `/v1/pregnancies/current/dating-history` | Guest or User | none | 200 array of DatingRecordDto {id*, method*, source*, inputs*, dueDate*, createdAt*} | pregnancy_datings (read) | Implemented | PASS | E2E: identity, pregnancy, pregnancy-journey; live; browser | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.history()` |
| API-049 | POST | `/v1/pregnancies/current/end` | Guest or User | body: EndPregnancyDto {outcome*, endedOn*} | 200 PregnancyDto {id*, status*, dueDate*, datingMethod*, datingSource*, today*, gestationalAge*, week*, trimester*, termStatus*, daysUntilDue*, firstPregnancy*, fetusCount*, confirmedByClinician*, restrictExercise*, foodRestrictions*, clinicianNutritionPlan*, outcome*, endedOn*, createdAt*, updatedAt*} | pregnancies, reminders, reminder_deliveries (update) | Implemented | PASS | E2E: identity, platform, pregnancy, pregnancy-journey | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.end()` |
| API-050 | GET | `/v1/pregnancies/current/timeline` | Guest or User | none | 200 TimelineDto {dueDate*, today*, weeks*, milestones*} | pregnancies (read) | Implemented | PASS | E2E: identity, pregnancy, pregnancy-journey; browser | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.timeline()` |
| API-051 | GET | `/v1/pregnancies/current/week` | Guest or User | query: locale | 200 ThisWeekDto {pregnancy*, guide*} | pregnancies, articles (week_guide), content_reviews (read) | Implemented | PASS | E2E: identity, pregnancy, pregnancy-journey; live; browser | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.thisWeek()` |
| API-052 | GET | `/v1/pregnancies/current/weeks/:week` | Guest or User | path: week; query: locale | 200 PregnancyWeekDetailDto {week*, trimester*, startDate*, endDate*, status*, guide*} | pregnancies, articles (read) | Implemented | PASS | E2E: identity, platform, pregnancy-journey | `apps/api/src/pregnancy/pregnancy.controller.ts → PregnancyController.weekDetail()` |
| API-053 | GET | `/v1/week-guides` | Public | query: locale, from, to | 200 array of WeekGuideDto {week*, locale*, version*, title*, summary*, sections*, references*, review*, publishedAt*, nextReviewDue*} | articles (week_guide), content_reviews (read) | Implemented | PASS | E2E: platform, pregnancy-journey | `apps/api/src/pregnancy/pregnancy.controller.ts → WeekGuidesController.list()` |
| API-054 | GET | `/v1/week-guides/:week` | Public | path: week; query: locale | 200 WeekGuideDto {week*, locale*, version*, title*, summary*, sections*, references*, review*, publishedAt*, nextReviewDue*} | articles, content_reviews (read) | Implemented | PASS | E2E: pregnancy, pregnancy-journey; browser | `apps/api/src/pregnancy/pregnancy.controller.ts → WeekGuidesController.get()` |


### 4.8 Module: `daily-logs`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-055 | GET | `/v1/daily-logs` | Guest or User | query: from*, to* | 200 array of DailyLogDto {date*, symptoms*, note*, mood*, sleepMinutes*, waterGlasses*, activityMinutes*, questions*, updatedAt*} | daily_logs (read) | Implemented | PASS | E2E: health-data, identity; browser | `apps/api/src/daily-logs/daily-logs.controller.ts → DailyLogsController.list()` |
| API-056 | GET | `/v1/daily-logs/:date` | Guest or User | path: date | 200 DailyLogDto {date*, symptoms*, note*, mood*, sleepMinutes*, waterGlasses*, activityMinutes*, questions*, updatedAt*} | daily_logs (read) | Implemented | PASS | E2E: health-data, identity, security; live; browser | `apps/api/src/daily-logs/daily-logs.controller.ts → DailyLogsController.get()` |
| API-057 | PUT | `/v1/daily-logs/:date` | Guest or User | path: date; body: PutDailyLogDto {symptoms*, note, mood, sleepMinutes, waterGlasses, activityMinutes, questions} | 200 DailyLogDto {date*, symptoms*, note*, mood*, sleepMinutes*, waterGlasses*, activityMinutes*, questions*, updatedAt*} | daily_logs (upsert) | Implemented | PASS | E2E: database, health-data, identity, planning, platform, privacy, security; live; browser | `apps/api/src/daily-logs/daily-logs.controller.ts → DailyLogsController.put()` |
| API-058 | DELETE | `/v1/daily-logs/:date` | Guest or User | path: date | 204 (no body) | daily_logs (delete) | Implemented | PASS | E2E: health-data, identity, security | `apps/api/src/daily-logs/daily-logs.controller.ts → DailyLogsController.remove()` |


### 4.9 Module: `content`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-059 | GET | `/v1/activities` | Public | query: limit, offset, locale, trimester, tag, type, week | 200 ActivityPageDto {items*, page*} | articles (activity), content_reviews (read) | Implemented | PASS | E2E: planning | `apps/api/src/content/catalog.controller.ts → ActivitiesController.list()` |
| API-060 | GET | `/v1/activities/:slug` | Public | path: slug; query: locale | 200 ActivityDto {slug*, locale*, version*, title*, summary*, category*, trimester*, tags*, references*, review*, publishedAt*, nextReviewDue*, sections*} | articles, content_reviews (read) | Implemented | PASS | E2E: planning | `apps/api/src/content/catalog.controller.ts → ActivitiesController.get()` |
| API-061 | GET | `/v1/articles` | Optional (public; identifies caller if credentials sent) | query: limit, offset, locale, category, trimester, tag | 200 ArticlePageDto {items*, page*} | articles (read) | Implemented | PASS | E2E: content-admin, pregnancy, security; browser | `apps/api/src/content/articles.controller.ts → ArticlesController.list()` |
| API-062 | GET | `/v1/articles/:slug` | Optional (public; identifies caller if credentials sent) | path: slug; query: locale | 200 ArticleDto {slug*, locale*, version*, title*, summary*, premium*, publishedAt*, category*, trimester*, tags*, body*, locked*, references*, review*, nextReviewDue*} | articles, content_reviews, subscriptions (read) | Implemented | PASS | E2E: content-admin, pregnancy, security; browser | `apps/api/src/content/articles.controller.ts → ArticlesController.get()` |
| API-063 | GET | `/v1/meal-plans` | Public | query: limit, offset, locale, trimester, tag, diet | 200 MealPlanPageDto {items*, page*} | articles (meal_plan, recipe), content_reviews (read) | Implemented | PASS | E2E: planning | `apps/api/src/content/catalog.controller.ts → MealPlansController.list()` |
| API-064 | GET | `/v1/meal-plans/:slug` | Public | path: slug; query: locale | 200 MealPlanDto {slug*, locale*, version*, title*, summary*, category*, trimester*, tags*, references*, review*, publishedAt*, nextReviewDue*, sections*, recipes*} | articles, content_reviews (read) | Implemented | PASS | E2E: planning | `apps/api/src/content/catalog.controller.ts → MealPlansController.get()` |
| API-065 | GET | `/v1/readiness/tasks` | Guest or User | query: locale, category | 200 array of ReadinessTaskDto {id*, key*, title*, description*, category*, premium*, locked*, articleSlug*, completedAt*, note*, fromWeek*, toWeek*, recommendedNow*} | readiness_tasks, articles, user_task_progress, subscriptions, pregnancies (read) | Implemented | PASS | E2E: content-admin, identity, platform; live; browser | `apps/api/src/content/readiness.controller.ts → ReadinessController.list()` |
| API-066 | PUT | `/v1/readiness/tasks/:taskId/progress` | Guest or User | path: taskId; body: PutProgressDto {completed*, note} | 200 ReadinessTaskDto {id*, key*, title*, description*, category*, premium*, locked*, articleSlug*, completedAt*, note*, fromWeek*, toWeek*, recommendedNow*} | user_task_progress (create/update) | Implemented | PASS | E2E: content-admin, identity; browser | `apps/api/src/content/readiness.controller.ts → ReadinessController.putProgress()` |
| API-067 | GET | `/v1/recipes` | Public | query: limit, offset, locale, trimester, tag, slot, diet, excludeAllergens | 200 RecipePageDto {items*, page*} | articles (recipe), content_reviews (read) | Implemented | PASS | E2E: planning, platform | `apps/api/src/content/catalog.controller.ts → RecipesController.list()` |
| API-068 | GET | `/v1/recipes/:slug` | Public | path: slug; query: locale | 200 RecipeDto {slug*, locale*, version*, title*, summary*, category*, trimester*, tags*, references*, review*, publishedAt*, nextReviewDue*, sections*, allergens*} | articles, content_reviews (read) | Implemented | PASS | E2E: planning, platform | `apps/api/src/content/catalog.controller.ts → RecipesController.get()` |


### 4.10 Module: `planning`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-069 | GET | `/v1/activity-logs` | Guest or User | query: from*, to* | 200 array of ActivityLogDto {id*, date*, activitySlug*, minutes*, createdAt*} | activity_logs (read) | Implemented | PASS | E2E: identity, planning | `apps/api/src/planning/exercise.controller.ts → ExerciseController.logs()` |
| API-070 | PUT | `/v1/activity-logs/:date/:activitySlug` | Guest or User | path: date, activitySlug; body: PutActivityLogDto {minutes} | 200 ActivityLogDto {id*, date*, activitySlug*, minutes*, createdAt*} | articles (read), activity_logs (upsert) | Implemented | PASS | E2E: identity, planning, platform; browser | `apps/api/src/planning/exercise.controller.ts → ExerciseController.log()` |
| API-071 | DELETE | `/v1/activity-logs/:date/:activitySlug` | Guest or User | path: date, activitySlug | 204 (no body) | activity_logs (delete) | Implemented | PASS | E2E: identity, planning | `apps/api/src/planning/exercise.controller.ts → ExerciseController.unlog()` |
| API-072 | GET | `/v1/appointments` | Guest or User | query: from, to | 200 array of AppointmentDto {id*, kind*, title*, startsAt*, location*, notes*, questions*, pregnancyId*, createdAt*, updatedAt*} | appointments (read) | Implemented | PASS | E2E: identity, planning, platform, security; browser | `apps/api/src/planning/appointments.controller.ts → AppointmentsController.list()` |
| API-073 | POST | `/v1/appointments` | Guest or User | body: CreateAppointmentDto {kind*, title*, startsAt*, location, notes, questions} | 201 AppointmentDto {id*, kind*, title*, startsAt*, location*, notes*, questions*, pregnancyId*, createdAt*, updatedAt*} | pregnancies (read), appointments (create) | Implemented | PASS | E2E: database, identity, planning, platform, security; browser | `apps/api/src/planning/appointments.controller.ts → AppointmentsController.create()` |
| API-074 | GET | `/v1/appointments/:id` | Guest or User | path: id | 200 AppointmentDto {id*, kind*, title*, startsAt*, location*, notes*, questions*, pregnancyId*, createdAt*, updatedAt*} | appointments (read) | Implemented | PASS | E2E: identity, planning, platform, security | `apps/api/src/planning/appointments.controller.ts → AppointmentsController.get()` |
| API-075 | PATCH | `/v1/appointments/:id` | Guest or User | path: id; body: UpdateAppointmentDto {kind, title, startsAt, location, notes, questions} | 200 AppointmentDto {id*, kind*, title*, startsAt*, location*, notes*, questions*, pregnancyId*, createdAt*, updatedAt*} | appointments (update) | Implemented | PASS | E2E: identity, planning, platform, security | `apps/api/src/planning/appointments.controller.ts → AppointmentsController.update()` |
| API-076 | DELETE | `/v1/appointments/:id` | Guest or User | path: id | 204 (no body) | appointments (delete) | Implemented | PASS | E2E: identity, planning, platform, security | `apps/api/src/planning/appointments.controller.ts → AppointmentsController.remove()` |
| API-077 | GET | `/v1/daily-plan` | Guest or User | query: date, days, locale | 200 DailyPlanDto {days*} | pregnancies, profiles, daily_logs, plan_task_completions, readiness_tasks, user_task_progress, appointments, reminders, articles, meal_logs, activity_logs (read) | Implemented | PASS | E2E: identity, planning, platform | `apps/api/src/planning/daily-plan.controller.ts → DailyPlanController.get()` |
| API-078 | PUT | `/v1/daily-plan/:date/tasks/:key` | Guest or User | path: date, key; body: PutPlanTaskDto {done*} | 200 DailyPlanDayDto {date*, pregnancyWeek*, tasks*, done*, total*} | plan_task_completions (create/delete) | Implemented | PASS | E2E: identity, planning, platform | `apps/api/src/planning/daily-plan.controller.ts → DailyPlanController.setTask()` |
| API-079 | GET | `/v1/me/exercise-plan` | Guest or User | query: date, days, locale | 200 ExercisePlanDto {availability*, week*, activities*, disclaimer*} | pregnancies, profiles, articles, content_reviews, activity_logs (read) | Implemented | PASS | E2E: identity, planning, platform; browser | `apps/api/src/planning/exercise.controller.ts → ExerciseController.plan()` |
| API-080 | GET | `/v1/me/meal-plan` | Guest or User | query: date, days, locale | 200 PersonalMealPlanDto {availability*, planSlug*, hydrationNote*, days*, filters*} | pregnancies, profiles, articles, content_reviews, meal_logs (read) | Implemented | PASS | E2E: identity, planning, platform; browser | `apps/api/src/planning/nutrition.controller.ts → NutritionController.mealPlan()` |
| API-081 | GET | `/v1/meal-logs` | Guest or User | query: from*, to* | 200 array of MealLogDto {id*, date*, slot*, recipeSlug*, createdAt*} | meal_logs (read) | Implemented | PASS | E2E: identity, planning | `apps/api/src/planning/nutrition.controller.ts → NutritionController.logs()` |
| API-082 | PUT | `/v1/meal-logs/:date/:slot/:recipeSlug` | Guest or User | path: date, slot, recipeSlug | 200 MealLogDto {id*, date*, slot*, recipeSlug*, createdAt*} | articles (read), meal_logs (create) | Implemented | PASS | E2E: identity, planning, platform; browser | `apps/api/src/planning/nutrition.controller.ts → NutritionController.logMeal()` |
| API-083 | DELETE | `/v1/meal-logs/:date/:slot/:recipeSlug` | Guest or User | path: date, slot, recipeSlug | 204 (no body) | meal_logs (delete) | Implemented | PASS | E2E: identity, planning | `apps/api/src/planning/nutrition.controller.ts → NutritionController.unlogMeal()` |
| API-084 | GET | `/v1/saved` | Guest or User | query: kind | 200 array of SavedItemDto {kind*, slug*, savedAt*} | saved_content (read) | Implemented | PASS | E2E: identity, planning, platform | `apps/api/src/planning/saved.controller.ts → SavedController.list()` |
| API-085 | PUT | `/v1/saved/:kind/:slug` | Guest or User | path: kind, slug | 200 SavedItemDto {kind*, slug*, savedAt*} | articles (read), saved_content (create) | Implemented | PASS | E2E: identity, planning, platform | `apps/api/src/planning/saved.controller.ts → SavedController.save()` |
| API-086 | DELETE | `/v1/saved/:kind/:slug` | Guest or User | path: kind, slug | 204 (no body) | saved_content (delete) | Implemented | PASS | E2E: identity, planning | `apps/api/src/planning/saved.controller.ts → SavedController.remove()` |
| API-087 | GET | `/v1/shopping-list` | Guest or User | none | 200 array of ShoppingItemDto {id*, name*, quantity*, checked*, recipeSlug*, updatedAt*} | shopping_items (read) | Implemented | PASS | E2E: identity, planning, security; browser | `apps/api/src/planning/nutrition.controller.ts → NutritionController.shopping()` |
| API-088 | POST | `/v1/shopping-list` | Guest or User | body: CreateShoppingItemDto {name*, quantity} | 201 ShoppingItemDto {id*, name*, quantity*, checked*, recipeSlug*, updatedAt*} | shopping_items (create) | Implemented | PASS | E2E: database, identity, planning, platform, security | `apps/api/src/planning/nutrition.controller.ts → NutritionController.addItem()` |
| API-089 | DELETE | `/v1/shopping-list` | Guest or User | none | 204 (no body) | shopping_items (deleteMany) | Implemented | PASS | E2E: identity, planning; browser | `apps/api/src/planning/nutrition.controller.ts → NutritionController.clearChecked()` |
| API-090 | PATCH | `/v1/shopping-list/:id` | Guest or User | path: id; body: UpdateShoppingItemDto {checked, quantity} | 200 ShoppingItemDto {id*, name*, quantity*, checked*, recipeSlug*, updatedAt*} | shopping_items (update) | Implemented | PASS | E2E: identity, planning, platform, security; browser | `apps/api/src/planning/nutrition.controller.ts → NutritionController.updateItem()` |
| API-091 | DELETE | `/v1/shopping-list/:id` | Guest or User | path: id | 204 (no body) | shopping_items (delete) | Implemented | PASS | E2E: identity, planning, platform, security | `apps/api/src/planning/nutrition.controller.ts → NutritionController.removeItem()` |
| API-092 | POST | `/v1/shopping-list/from-meal-plan` | Guest or User | body: FromMealPlanDto {date, days} | 201 ShoppingFromPlanResultDto {added*, items*} | shopping_items (createMany), plus meal-plan reads | Implemented | PASS | E2E: identity, platform; browser | `apps/api/src/planning/nutrition.controller.ts → NutritionController.fromPlan()` |


### 4.11 Module: `reminders`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-093 | GET | `/v1/admin/reminder-deliveries/stats` | Staff: support (+administrator; 2FA required) | none | None None | reminder_deliveries (groupBy) | Implemented | PASS | E2E: email-and-reminders, identity, security | `apps/api/src/reminders/reminders.controller.ts → AdminReminderDeliveriesController.stats()` |
| API-094 | GET | `/v1/reminders` | Guest or User | none | 200 array of ReminderDto {id*, kind*, enabled*, localTime*, recurrence*, label*, channel*, nextRunAt*, createdAt*, updatedAt*} | reminders (read) | Implemented | PASS | E2E: email-and-reminders, health-data, identity, platform; browser | `apps/api/src/reminders/reminders.controller.ts → RemindersController.list()` |
| API-095 | POST | `/v1/reminders` | Guest or User | body: CreateReminderDto {kind*, enabled, localTime*, recurrence*, label, channel} | 201 ReminderDto {id*, kind*, enabled*, localTime*, recurrence*, label*, channel*, nextRunAt*, createdAt*, updatedAt*} | reminders (create), profiles (read) | Implemented | PASS | E2E: email-and-reminders, health-data, identity, planning, platform, privacy, security; browser | `apps/api/src/reminders/reminders.controller.ts → RemindersController.create()` |
| API-096 | PATCH | `/v1/reminders/:id` | Guest or User | path: id; body: UpdateReminderDto {kind, enabled, localTime, recurrence, label, channel} | 200 ReminderDto {id*, kind*, enabled*, localTime*, recurrence*, label*, channel*, nextRunAt*, createdAt*, updatedAt*} | reminders (update), reminder_deliveries (update) | Implemented | PASS | E2E: email-and-reminders, health-data, identity, security | `apps/api/src/reminders/reminders.controller.ts → RemindersController.update()` |
| API-097 | DELETE | `/v1/reminders/:id` | Guest or User | path: id | 204 (no body) | reminders (delete) | Implemented | PASS | E2E: health-data, identity, security | `apps/api/src/reminders/reminders.controller.ts → RemindersController.remove()` |
| API-098 | GET | `/v1/reminders/delivery-options` | Guest or User | none | 200 ReminderDeliveryOptionsDto {channels*, emailVerified*} | - | Implemented | PASS | E2E: email-and-reminders, identity | `apps/api/src/reminders/reminders.controller.ts → RemindersController.deliveryOptions()` |


### 4.12 Module: `cycles`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-099 | GET | `/v1/cycles` | Guest or User | query: limit, offset | 200 CyclePageDto {items*, page*} | cycles (read) | Implemented | PASS | E2E: health-data, identity | `apps/api/src/cycles/cycles.controller.ts → CyclesController.list()` |
| API-100 | POST | `/v1/cycles` | Guest or User | body: CreateCycleDto {periodStart*, periodEnd} | 201 CycleEntryDto {id*, periodStart*, periodEnd*, createdAt*, updatedAt*} | cycles (create) | Implemented | PASS | E2E: database, health-data, identity, privacy, security | `apps/api/src/cycles/cycles.controller.ts → CyclesController.create()` |
| API-101 | GET | `/v1/cycles/:id` | Guest or User | path: id | 200 CycleEntryDto {id*, periodStart*, periodEnd*, createdAt*, updatedAt*} | cycles (read) | Implemented | PASS | E2E: health-data, identity, security | `apps/api/src/cycles/cycles.controller.ts → CyclesController.get()` |
| API-102 | PATCH | `/v1/cycles/:id` | Guest or User | path: id; body: UpdateCycleDto {periodStart, periodEnd} | 200 CycleEntryDto {id*, periodStart*, periodEnd*, createdAt*, updatedAt*} | cycles (update) | Implemented | PASS | E2E: health-data, identity, security | `apps/api/src/cycles/cycles.controller.ts → CyclesController.update()` |
| API-103 | DELETE | `/v1/cycles/:id` | Guest or User | path: id | 204 (no body) | cycles (delete) | Implemented | PASS | E2E: health-data, identity, security | `apps/api/src/cycles/cycles.controller.ts → CyclesController.remove()` |
| API-104 | GET | `/v1/cycles/estimate` | Guest or User | none | 200 CycleEstimateDto {method*, confidence*, nextPeriodWindow*, cyclesUsed*, limitations*} | cycles (read) | Implemented | PASS | E2E: health-data, identity | `apps/api/src/cycles/cycles.controller.ts → CyclesController.estimate()` |


### 4.13 Module: `admin`

| API ID | HTTP | Endpoint | Auth / Authorization | Request | Response | Database (tables) | Status | Verified | Test coverage | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| API-105 | POST | `/v1/admin/activities` | Staff: content_editor (+administrator; 2FA required) | body: CreateStructuredContentDto {slug*, locale*, title*, summary*, category*, trimester, tags, references*, sections*} | 201 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles (create), audit_events | Implemented | PASS | E2E: identity, planning, platform, security | `apps/api/src/admin/admin-structured.controller.ts → AdminStructuredController.activity()` |
| API-106 | GET | `/v1/admin/articles` | Staff: content_editor, clinical_reviewer (+administrator; 2FA required) | query: limit, offset, status, slug, kind, category, q | 200 AdminArticlePageDto {items*, page*} | articles (read) | Implemented | PASS | E2E: content-admin, identity, pregnancy, security | `apps/api/src/admin/admin-articles.controller.ts → AdminArticlesController.list()` |
| API-107 | POST | `/v1/admin/articles` | Staff: content_editor (+administrator; 2FA required) | body: CreateArticleDto {slug*, locale*, title*, summary*, body*, references*, premium*, category, trimester, tags} | 201 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles (create), audit_events | Implemented | PASS | E2E: content-admin, identity, platform, pregnancy, security | `apps/api/src/admin/admin-articles.controller.ts → AdminArticlesController.create()` |
| API-108 | GET | `/v1/admin/articles/:id` | Staff: content_editor, clinical_reviewer (+administrator; 2FA required) | path: id | 200 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles, content_reviews (read) | Implemented | PASS | E2E: content-admin, identity, security | `apps/api/src/admin/admin-articles.controller.ts → AdminArticlesController.get()` |
| API-109 | PATCH | `/v1/admin/articles/:id` | Staff: content_editor (+administrator; 2FA required) | path: id; body: UpdateArticleDto {title, summary, body, references, premium, category, trimester, tags, sections, structuredSections} | 200 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles (update), audit_events | Implemented | PASS | E2E: content-admin, identity, pregnancy, security | `apps/api/src/admin/admin-articles.controller.ts → AdminArticlesController.update()` |
| API-110 | POST | `/v1/admin/articles/:id/archive` | Staff: content_editor (+administrator; 2FA required) | path: id | 200 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles (update), audit_events | Implemented | PASS | E2E: content-admin, identity, security | `apps/api/src/admin/admin-articles.controller.ts → AdminArticlesController.archive()` |
| API-111 | POST | `/v1/admin/articles/:id/publish` | Staff: content_editor (+administrator; 2FA required) | path: id | 200 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles (update/updateMany), audit_events | Implemented | PASS | E2E: content-admin, identity, planning, platform, pregnancy, security | `apps/api/src/admin/admin-articles.controller.ts → AdminArticlesController.publish()` |
| API-112 | POST | `/v1/admin/articles/:id/reviews` | Staff: clinical_reviewer (+administrator; 2FA required) | path: id; body: ReviewArticleDto {decision*, reviewerCredentials*, sources*, comments} | 201 (no body) | content_reviews (create), articles (update), audit_events | Implemented | PASS | E2E: content-admin, identity, planning, platform, pregnancy, security | `apps/api/src/admin/admin-articles.controller.ts → AdminArticlesController.review()` |
| API-113 | POST | `/v1/admin/articles/:id/submit` | Staff: content_editor (+administrator; 2FA required) | path: id | 200 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles (update), audit_events | Implemented | PASS | E2E: content-admin, identity, planning, platform, pregnancy, security | `apps/api/src/admin/admin-articles.controller.ts → AdminArticlesController.submit()` |
| API-114 | GET | `/v1/admin/audit-events` | Admin (administrator only) | query: limit, offset, action, actorUserId | 200 AuditPageDto {items*, page*} | audit_events (read) | Implemented | PASS | E2E: content-admin, identity, security | `apps/api/src/admin/admin-users.controller.ts → AdminUsersController.auditEvents()` |
| API-115 | GET | `/v1/admin/content/coverage` | Staff: content_editor, clinical_reviewer (+administrator; 2FA required) | query: locale | 200 ContentCoverageDto {weekGuides*, byKind*} | articles (read, groupBy) | Implemented | PASS | E2E: identity, platform, security | `apps/api/src/admin/admin-structured.controller.ts → AdminStructuredController.coverage()` |
| API-116 | POST | `/v1/admin/meal-plans` | Staff: content_editor (+administrator; 2FA required) | body: CreateStructuredContentDto {slug*, locale*, title*, summary*, category*, trimester, tags, references*, sections*} | 201 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles (create), audit_events | Implemented | PASS | E2E: identity, planning, platform, security | `apps/api/src/admin/admin-structured.controller.ts → AdminStructuredController.mealPlan()` |
| API-117 | GET | `/v1/admin/readiness-tasks` | Staff: content_editor, clinical_reviewer (+administrator; 2FA required) | none | 200 array of AdminTaskDto {id*, key*, locale*, title*, description*, category*, sortOrder*, premium*, status*, articleId*, fromWeek*, toWeek*} | readiness_tasks (read) | Implemented | PASS | E2E: identity, security | `apps/api/src/admin/admin-tasks.controller.ts → AdminTasksController.list()` |
| API-118 | POST | `/v1/admin/readiness-tasks` | Staff: content_editor (+administrator; 2FA required) | body: CreateTaskDto {key*, locale*, title*, description*, category*, sortOrder*, premium*, fromWeek, toWeek, articleId} | 201 AdminTaskDto {id*, key*, locale*, title*, description*, category*, sortOrder*, premium*, status*, articleId*, fromWeek*, toWeek*} | readiness_tasks (create), audit_events | Implemented | PASS | E2E: content-admin, identity, security; live | `apps/api/src/admin/admin-tasks.controller.ts → AdminTasksController.create()` |
| API-119 | PATCH | `/v1/admin/readiness-tasks/:id` | Staff: content_editor (+administrator; 2FA required) | path: id; body: UpdateTaskDto {title, description, category, sortOrder, premium, fromWeek, toWeek, articleId} | 200 AdminTaskDto {id*, key*, locale*, title*, description*, category*, sortOrder*, premium*, status*, articleId*, fromWeek*, toWeek*} | readiness_tasks (update), audit_events | Implemented | PASS | E2E: content-admin, identity, security | `apps/api/src/admin/admin-tasks.controller.ts → AdminTasksController.update()` |
| API-120 | POST | `/v1/admin/readiness-tasks/:id/archive` | Staff: content_editor (+administrator; 2FA required) | path: id | 200 AdminTaskDto {id*, key*, locale*, title*, description*, category*, sortOrder*, premium*, status*, articleId*, fromWeek*, toWeek*} | readiness_tasks (update), audit_events | Implemented | PASS (live) | E2E: identity, security; live | `apps/api/src/admin/admin-tasks.controller.ts → AdminTasksController.archive()` |
| API-121 | POST | `/v1/admin/readiness-tasks/:id/publish` | Staff: clinical_reviewer (+administrator; 2FA required) | path: id | 200 AdminTaskDto {id*, key*, locale*, title*, description*, category*, sortOrder*, premium*, status*, articleId*, fromWeek*, toWeek*} | readiness_tasks (update), audit_events | Implemented | PASS | E2E: content-admin, identity, security; live | `apps/api/src/admin/admin-tasks.controller.ts → AdminTasksController.publish()` |
| API-122 | POST | `/v1/admin/recipes` | Staff: content_editor (+administrator; 2FA required) | body: CreateStructuredContentDto {slug*, locale*, title*, summary*, category*, trimester, tags, references*, sections*} | 201 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles (create), audit_events | Implemented | PASS | E2E: identity, planning, platform, security | `apps/api/src/admin/admin-structured.controller.ts → AdminStructuredController.recipe()` |
| API-123 | GET | `/v1/admin/users` | Staff: support (+administrator; 2FA required) | query: limit, offset, email, staffOnly | 200 AdminUserPageDto {items*, page*} | users (read) | Implemented | PASS | E2E: content-admin, identity, security | `apps/api/src/admin/admin-users.controller.ts → AdminUsersController.users()` |
| API-124 | PATCH | `/v1/admin/users/:id/staff-role` | Admin (administrator only) | path: id; body: SetStaffRoleDto {staffRole*} | 200 AdminUserDto {id*, email*, name*, status*, staffRole*, twoFactorEnabled*, emailVerified*, createdAt*} | users (update), auth_sessions (deleteMany), audit_events | Implemented | PASS | E2E: content-admin, identity, security | `apps/api/src/admin/admin-users.controller.ts → AdminUsersController.setRole()` |
| API-125 | POST | `/v1/admin/week-guides` | Staff: content_editor (+administrator; 2FA required) | body: CreateWeekGuideDto {week*, locale*, title*, summary*, sections*, references*} | 201 AdminArticleDto {id*, kind*, category*, trimester*, tags*, week*, sections*, slug*, locale*, version*, title*, summary*, body*, references*, premium*, status*, publishedAt*, nextReviewDue*, createdById*, createdAt*, updatedAt*} | articles (create), audit_events | Implemented | PASS | E2E: identity, pregnancy, security | `apps/api/src/admin/admin-week-guides.controller.ts → AdminWeekGuidesController.create()` |


**Validation applied to every Nest route** (`apps/api/src/common/validation.ts`): unknown body/query fields → 400;
type/format/range violations → 400 with `details[].path`; route params use `ParseUUIDPipe`, `ParseCalendarDatePipe` or
DTO patterns (slugs `^[a-z0-9]+(-[a-z0-9]+)*$`). Errors always use `{error:{code,message,requestId,details?}}`
(`common/filters/api-exception.filter.ts`); database constraint failures map to 409/400/404 with generic messages.
Better Auth routes return `{code,message}` on error (the frontend handles both shapes in `toError()`).

---

## 5. Exact API counts

### 5.1 Counting method

1. **Runtime enumeration, not documentation.** The compiled API (`apps/api/dist`) was booted against the test database. Every
   route on the Express router was listed, and every Nest controller method was read from Nest's module container with its
   `@Get/@Post…` metadata, guard requirement (`auth:requirement`) and throttle settings. All **99** Nest handlers are registered
   on Express (no unregistered or duplicate handlers).
2. **Better Auth** is mounted as one catch-all (`/v1/auth/*splat`, all verbs). Its endpoint list was read from the live auth
   instance and **each method+path was requested over HTTP**: 42 candidate pairs → **22 reachable** with the default config;
   **4 more** reachable only when `EMAIL_PROVIDER` is set; 15 deliberately disabled (404: social login, OAuth callbacks,
   change-email, delete-user, OTP by email/SMS, token refresh…); `GET /reference` 404 (disabled UI); `POST /get-session` 405.
3. **Excluded** (not API operations): Swagger UI assets under `/docs` (served outside production only) and `/docs/openapi.json`, `/docs-yaml`.
4. One operation = one HTTP method on one path. A path with GET and POST counts as two operations.

### 5.2 Counts

| Metric | Default config (`EMAIL_PROVIDER=none`) | With an email provider |
|---|---:|---:|
| Total unique API paths | **97** | 101 |
| Total API operations (method + path) | **121** | 125 |
| GET | 54 | 55 |
| POST | 40 | 43 |
| PUT | 9 | 9 |
| PATCH | 8 | 8 |
| DELETE | 10 | 10 |
| …of which NestJS operations | 99 (75 paths) | 99 |
| …of which Better Auth operations | 22 (22 paths) | 26 |

| Access level (default config, 121 operations) | Count |
|---|---:|
| Guest or User (owner) | 61 |
| Staff (role-gated) | 20 |
| Public (incl. optional auth) | 19 |
| Registered user only | 19 |
| Admin only | 2 |

Breakdown of the 22 staff operations: content_editor 12, content_editor or clinical_reviewer 4, clinical_reviewer 2, support 2,
administrator-only 2 (role changes, audit log). Guest-accessible operations = the 61 owner operations plus public ones;
**user-only** Nest routes: `POST /v1/anonymous-sessions/link`, `POST /v1/me/deletion`, `GET /v1/me/privacy-jobs`.

| Implementation status (all 125) | Count |
|---|---:|
| Implemented | 124 |
| Partially implemented | 1 (`POST /v1/auth/update-session`: exposed but a no-op) |
| Placeholder | 0 |
| Broken or unavailable | 0 (the 4 email-only routes are intentionally unavailable until an email provider is configured) |

Feature-level partials that are not endpoint defects: entitlements (read path only; nothing writes subscriptions) and
reminders (email channel only; no push).

### 5.3 Registered routes vs OpenAPI vs documentation

| Source | Operations | Paths | Differences from runtime |
|---|---:|---:|---|
| **Runtime (this audit)** | 121 (+4 email) | 97 (+4) | — |
| `backend/docs/api/openapi.json` (regenerated 2026-11-06) | 121 | 96 | Contains all 99 Nest operations exactly. Lists `POST /v1/auth/get-session`, which really answers **405**. Omits `GET /v1/auth/open-api/generate-schema` (internal) and the 4 email-only routes. |
| Swagger UI at `/docs` (dev) | same as openapi.json + Better Auth schema | | Merged at runtime by `apps/api/src/openapi.ts`. |
| `backend/docs/API_INVENTORY.md` (2026-10-19) | 81 (59 Nest + 22 auth) | 66 | **Outdated:** missing the 40 planning, catalog, appointments, saved, daily-plan, birth-preferences, admin structured-content and coverage operations added on 2026-11-03. |
| `backend/README.md` audit section | "81 total operations" | | Outdated, as above. |
| `frontend/docs/BACKEND_GAPS.md` (2026-11-02) | — | | **Outdated:** lists meal plans, recipes, exercise library, appointments, birth preferences, hydration and sleep as missing; all now exist in the API and are used by the website. |

No undocumented Nest endpoint exists. The only undocumented runtime operations are the Better Auth email routes and its schema route.

---

## 6. API-by-API functionality

What happens when each operation is called, from reading the controller and service code. "Consent required" means the
service calls `ConsentService.assertHealthDataConsent()` and returns **403 CONSENT_REQUIRED** without a current
`health_data_processing` grant. Unless stated, owner-scoped lookups return **404** for another owner's record (no IDOR),
writes are persisted in PostgreSQL in the same request (no queues), and invalid input returns **400** before any database access.


### 6.1 `health`

- **API-001 `GET /v1/health`**: Readiness probe: SELECT 1 on PostgreSQL with a 2 s timeout; 200 {status:"ok",database:"up"} or 503 {status:"degraded",database:"down"}. *Tables:* raw SELECT 1. *Documented errors:* 503.
- **API-002 `GET /v1/health/live`**: Liveness probe; returns {status:"ok"} without touching dependencies. Public, never throttled. *Tables:* -. *Documented errors:* see Better Auth.

### 6.2 `auth`

- **API-003 `POST /v1/anonymous-sessions`**: Creates a guest session; generates a 256-bit secret, stores only its SHA-256 hash, returns {id, secret, expiresAt} once. 10/hour/IP. *Tables:* anonymous_sessions (create). *Documented errors:* 400, 429.
- **API-004 `DELETE /v1/anonymous-sessions/current`**: Deletes the calling guest session; FK cascades delete every record it owns; audited. 403 for registered users. *Tables:* anonymous_sessions (delete, cascade to all owned tables), audit_events. *Documented errors:* 401, 403.
- **API-005 `POST /v1/anonymous-sessions/link`**: Transaction: locks the user row, atomically claims the guest session, refuses (409) if the account already has health data, moves pregnancies, cycles, logs, progress, consents, reminders, appointments, meal/activity logs, plan completions, saved items and shopping items (de-duplicated), and the profile if the account has none. Old secret stops working. 404 unknown/expired/already linked. *Tables:* users, anonymous_sessions, pregnancies, cycles, daily_logs, user_task_progress, consent_records, reminders, appointments, meal_logs, activity_logs, plan_task_completions, saved_content, shopping_items, profiles, audit_events. *Documented errors:* 400, 401, 403, 404, 409.
- **API-006 `POST /v1/auth/change-password`**: Changes password after checking the current one; optional revokeOtherSessions. *Tables:* auth_accounts, auth_sessions. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-007 `GET /v1/auth/error`**: Better Auth HTML error page. *Tables:* -. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-008 `GET /v1/auth/get-session`**: Current session and user, or null. *Tables:* auth_sessions, users. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-009 `GET /v1/auth/list-accounts`**: Linked auth accounts (only 'credential' here; no OAuth). *Tables:* auth_accounts. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-010 `GET /v1/auth/list-sessions`**: The user's active sessions (id, token, expiry, IP, user agent). *Tables:* auth_sessions. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-011 `GET /v1/auth/ok`**: Better Auth health check {ok:true}. *Tables:* -. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-012 `GET /v1/auth/open-api/generate-schema`**: Better Auth's OpenAPI schema (merged into /docs by openapi.ts). Not in docs/api/openapi.json. *Tables:* -. *Documented errors:* see Better Auth.
- **API-013 `POST /v1/auth/request-password-reset`**: EMAIL_PROVIDER only. Emails a single-use 30-minute reset link (always 200, no account enumeration). 5/hour. *Tables:* auth_verifications. *Documented errors:* see Better Auth.
- **API-014 `POST /v1/auth/reset-password`**: EMAIL_PROVIDER only. Sets a new password with a reset token; revokes all sessions. *Tables:* auth_verifications, auth_accounts, auth_sessions. *Documented errors:* see Better Auth.
- **API-015 `POST /v1/auth/revoke-other-sessions`**: Revokes every session except the current one. *Tables:* auth_sessions. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-016 `POST /v1/auth/revoke-session`**: Revokes one session by token. *Tables:* auth_sessions. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-017 `POST /v1/auth/revoke-sessions`**: Revokes all of the user's sessions, including the current one. *Tables:* auth_sessions. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-018 `POST /v1/auth/send-verification-email`**: EMAIL_PROVIDER only. Resends the verification email. *Tables:* auth_verifications. *Documented errors:* see Better Auth.
- **API-019 `POST /v1/auth/sign-in/email`**: Verifies the password; returns a session, or {twoFactorRedirect:true} with a short-lived 2FA cookie when TOTP is enabled. 5/min/IP. *Tables:* users, auth_accounts, auth_sessions, two_factors. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-020 `POST /v1/auth/sign-out`**: Deletes the current session and clears cookies. *Tables:* auth_sessions. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-021 `POST /v1/auth/sign-up/email`**: Creates a user + credential account (password 12-128 chars, scrypt hash) and a session (cookie and set-auth-token bearer). staffRole/status cannot be set (input:false). 10/hour/IP. *Tables:* users, auth_accounts, auth_sessions. *Documented errors:* 400, 401, 403, 404, 422, 429, 500.
- **API-022 `POST /v1/auth/two-factor/disable`**: Turns off 2FA after password check. *Tables:* two_factors, users. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-023 `POST /v1/auth/two-factor/enable`**: Starts TOTP enrolment after password check; returns totpURI and backup codes (secret stored encrypted). *Tables:* two_factors, users. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-024 `POST /v1/auth/two-factor/generate-backup-codes`**: Replaces backup codes after password check. *Tables:* two_factors. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-025 `POST /v1/auth/two-factor/get-totp-uri`**: Returns the TOTP URI again after password check. *Tables:* two_factors. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-026 `POST /v1/auth/two-factor/verify-backup-code`**: Completes a two-factor sign-in with a single-use backup code. *Tables:* two_factors, auth_sessions. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-027 `POST /v1/auth/two-factor/verify-totp`**: Verifies a TOTP code: confirms enrolment, or completes a two-factor sign-in. 5/min/IP. *Tables:* two_factors, users, auth_sessions. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-028 `POST /v1/auth/update-session`**: Updates custom session fields. None are configured, so every call returns 400 "No fields to update" (no-op). *Tables:* auth_sessions. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-029 `POST /v1/auth/update-user`**: Updates name/image; staffRole and status are not writable. *Tables:* users. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-030 `GET /v1/auth/verify-email`**: EMAIL_PROVIDER only. Marks the email verified from a signed token. *Tables:* users. *Documented errors:* see Better Auth.
- **API-031 `POST /v1/auth/verify-password`**: Checks a password for the signed-in user (re-authentication). *Tables:* auth_accounts. *Documented errors:* 400, 401, 403, 404, 429, 500.
- **API-032 `GET /v1/me`**: Returns the resolved caller: {kind:"user", id, email, name, emailVerified, staffRole, twoFactorEnabled} or {kind:"anonymous", id, expiresAt}. Read only. *Tables:* users / auth_sessions or anonymous_sessions (via guard). *Documented errors:* 401. **Note:** Guard slides guest expiry at most once a day (write to anonymous_sessions).

### 6.3 `consent`

- **API-033 `GET /v1/me/consents`**: Current state for each purpose (health_data_processing, product_analytics, marketing_email) = newest append-only row; defaults to not granted. *Tables:* consent_records (read). *Documented errors:* 401.
- **API-034 `POST /v1/me/consents`**: Appends a consent decision {purpose, granted, policyVersion, source}. History is never edited. health_data_processing gates every health write (403 CONSENT_REQUIRED). *Tables:* consent_records (create). *Documented errors:* 400, 401.

### 6.4 `profile`

- **API-035 `GET /v1/me/profile`**: Returns the saved profile or defaults (UTC, en, empty preferences). *Tables:* profiles (read). *Documented errors:* 401.
- **API-036 `PUT /v1/me/profile`**: Upserts profile: time zone (IANA-validated), locale, country, diet pattern, allergies, activity level; preference fields keep saved values when omitted. A time-zone change reschedules email reminders in the same transaction. *Tables:* profiles (upsert), reminders, reminder_deliveries. *Documented errors:* 400, 401. **Note:** Core fields (incl. foodAllergies) are replaced: omitting them clears them.

### 6.5 `entitlements`

- **API-037 `GET /v1/me/entitlement`**: Derives premium status from verified subscription rows (active/grace_period and not past period end). Guests always {premium:false, status:"none"}. *Tables:* subscriptions (read). *Documented errors:* 401. **Note:** Nothing in the codebase writes subscriptions: premium can never become true. Read path only.

### 6.6 `privacy`

- **API-038 `POST /v1/me/deletion`**: Body must be {confirm:"DELETE MY ACCOUNT"}. Transaction: refuses staff or former reviewers (409), deletes linked guest sessions and the user (cascade removes all data and sessions), completes a deletion job, audits. 204. 3/hour. *Tables:* users (delete + cascade), anonymous_sessions, privacy_jobs, audit_events. *Documented errors:* 400, 401, 403, 409, 429.
- **API-039 `POST /v1/me/export`**: Synchronously assembles every record the caller owns (profile, pregnancies + dating history + birth preferences, consents, cycles, logs, task progress, reminders + recent deliveries, appointments, meal/activity logs, saved, shopping, plan completions, subscriptions) as JSON attachment, Cache-Control no-store. Records a privacy job (users) and an audit event. 3/hour. *Tables:* privacy_jobs, every owner table (read), audit_events. *Documented errors:* 401, 429. **Note:** Job marked failed if assembly throws (fixed 2026-11-06).
- **API-040 `GET /v1/me/privacy-jobs`**: The user's last 50 export/deletion jobs (id, kind, status, requestedAt, completedAt). *Tables:* privacy_jobs (read). *Documented errors:* 401, 403.

### 6.7 `pregnancy`

- **API-041 `GET /v1/pregnancies`**: Paged list of all pregnancies (active and ended), newest first, each described as of today (or as of endedOn when ended). *Tables:* pregnancies (read). *Documented errors:* 400, 401.
- **API-042 `POST /v1/pregnancies`**: Consent required. Computes due date server-side from LMP (+cycle-length shift), known due date, ultrasound (scan date + GA) or IVF (transfer + embryo age); rejects future input dates and gestation outside 0-44 weeks. One active pregnancy per owner (409; partial unique index). Creates pregnancy + first dating-history row in one transaction. Response includes week, trimester, term status, daysUntilDue. *Tables:* pregnancies, pregnancy_datings (create). *Documented errors:* 400, 401, 403, 409.
- **API-043 `GET /v1/pregnancies/current`**: The active pregnancy with gestational age, week (1-42), trimester and term status computed for 'today' in the profile time zone. 404 when none. *Tables:* pregnancies, profiles (read). *Documented errors:* 401, 404.
- **API-044 `PATCH /v1/pregnancies/current`**: Consent required. Updates details: firstPregnancy, fetusCount, confirmedByClinician, restrictExercise, foodRestrictions (normalised), clinicianNutritionPlan. *Tables:* pregnancies (update). *Documented errors:* 400, 401, 403, 404.
- **API-045 `GET /v1/pregnancies/current/birth-preferences`**: Birth preferences of the active pregnancy (empty defaults when never saved). *Tables:* birth_preferences (read). *Documented errors:* 401, 404.
- **API-046 `PUT /v1/pregnancies/current/birth-preferences`**: Consent required. Upserts birth setting, pain relief, support people, feeding intention and notes for the active pregnancy. *Tables:* birth_preferences (upsert). *Documented errors:* 400, 401, 403, 404.
- **API-047 `PUT /v1/pregnancies/current/dating`**: Consent required. Re-dates the active pregnancy with any method, appends a dating-history row and returns {pregnancy, change:{previousDueDate,newDueDate,shiftDays}}. *Tables:* pregnancy_datings (create), pregnancies (update). *Documented errors:* 400, 401, 403, 404.
- **API-048 `GET /v1/pregnancies/current/dating-history`**: Every due-date estimate for the active pregnancy, newest first, with the original inputs. *Tables:* pregnancy_datings (read). *Documented errors:* 401, 404.
- **API-049 `POST /v1/pregnancies/current/end`**: Consent required. Ends the active pregnancy with outcome birth|loss|other and endedOn (not future, not before the pregnancy began). Pauses pregnancy reminders (and the journal reminder after a loss/other) and cancels their pending email sends. A new pregnancy can then be created. *Tables:* pregnancies, reminders, reminder_deliveries (update). *Documented errors:* 400, 401, 403, 404. **Note:** endedOn-before-start check added 2026-11-06.
- **API-050 `GET /v1/pregnancies/current/timeline`**: Weeks 1-42 with calendar dates and trimester, plus milestones (trimesters, early/full/late term, due date, postterm) marked past/today/upcoming. *Tables:* pregnancies (read). *Documented errors:* 401, 404.
- **API-051 `GET /v1/pregnancies/current/week`**: Today's pregnancy plus the published week guide for that week (null when not published). *Tables:* pregnancies, articles (week_guide), content_reviews (read). *Documented errors:* 400, 401, 404.
- **API-052 `GET /v1/pregnancies/current/weeks/:week`**: One week (1-42) of the active pregnancy: start/end dates, trimester, past/current/upcoming and its published guide. *Tables:* pregnancies, articles (read). *Documented errors:* 400, 401, 404.
- **API-053 `GET /v1/week-guides`**: Public. Every published week guide from `from` to `to` (default 1-42) in one response, with approving review info; unpublished weeks absent. *Tables:* articles (week_guide), content_reviews (read). *Documented errors:* 400.
- **API-054 `GET /v1/week-guides/:week`**: Public. The published guide for one week; 404 if not published; 400 outside 1-42. *Tables:* articles, content_reviews (read). *Documented errors:* 400, 404.

### 6.8 `daily-logs`

- **API-055 `GET /v1/daily-logs`**: Journal entries between from and to (<= 366 days), oldest first. *Tables:* daily_logs (read). *Documented errors:* 400, 401.
- **API-056 `GET /v1/daily-logs/:date`**: The entry for one calendar date; 404 if none. *Tables:* daily_logs (read). *Documented errors:* 400, 401, 404.
- **API-057 `PUT /v1/daily-logs/:date`**: Consent required; date not in the future (profile time zone). Upsert (unique per owner+date): symptoms (fixed vocabulary) and note replaced; mood, sleep, water, activity minutes, questions kept when omitted. DB CHECKs bound the numbers. *Tables:* daily_logs (upsert). *Documented errors:* 400, 401, 403.
- **API-058 `DELETE /v1/daily-logs/:date`**: Deletes the entry for that date; 404 if none. *Tables:* daily_logs (delete). *Documented errors:* 400, 401, 404.

### 6.9 `content`

- **API-059 `GET /v1/activities`**: Public. Published activities with safety notes, contraindications and stop signs; filters type, trimester, week, tag. *Tables:* articles (activity), content_reviews (read). *Documented errors:* 400.
- **API-060 `GET /v1/activities/:slug`**: Public. One published activity; 404 otherwise. *Tables:* articles, content_reviews (read). *Documented errors:* 404.
- **API-061 `GET /v1/articles`**: Optional auth. Paged published articles (kind=article), newest first; filters: category, trimester (includes all-pregnancy content), tag, locale. *Tables:* articles (read). *Documented errors:* 400.
- **API-062 `GET /v1/articles/:slug`**: Optional auth. One published article with its approving review (credentials, date). Premium bodies are null/locked unless the caller has an entitlement. Invalid credentials still 401. *Tables:* articles, content_reviews, subscriptions (read). *Documented errors:* 401, 404.
- **API-063 `GET /v1/meal-plans`**: Public. Published meal plans with their published recipes; filters trimester, diet. *Tables:* articles (meal_plan, recipe), content_reviews (read). *Documented errors:* 400.
- **API-064 `GET /v1/meal-plans/:slug`**: Public. One published meal plan with its recipes. *Tables:* articles, content_reviews (read). *Documented errors:* 404.
- **API-065 `GET /v1/readiness/tasks`**: Published checklist tasks (optionally by category) with the caller's progress; premium tasks locked without entitlement; `recommendedNow` from the active pregnancy's week window. Requires owner auth (not public). *Tables:* readiness_tasks, articles, user_task_progress, subscriptions, pregnancies (read). *Documented errors:* 400, 401.
- **API-066 `PUT /v1/readiness/tasks/:taskId/progress`**: Marks a published task complete/incomplete with an optional note; premium tasks need entitlement (403 PREMIUM_REQUIRED); consent required; keeps the original completion time on re-save. *Tables:* user_task_progress (create/update). *Documented errors:* 400, 401, 403, 404.
- **API-067 `GET /v1/recipes`**: Public. Published recipes with allergens and review info; filters slot, diet, excludeAllergens, trimester, tag; in-memory paging. *Tables:* articles (recipe), content_reviews (read). *Documented errors:* 400.
- **API-068 `GET /v1/recipes/:slug`**: Public. One published recipe; 404 otherwise. *Tables:* articles, content_reviews (read). *Documented errors:* 404.

### 6.10 `planning`

- **API-069 `GET /v1/activity-logs`**: Activities logged between from and to (<= 92 days). *Tables:* activity_logs (read). *Documented errors:* 400, 401.
- **API-070 `PUT /v1/activity-logs/:date/:activitySlug`**: Consent required; date not future; activity must be published; upsert with optional minutes (1-600). *Tables:* articles (read), activity_logs (upsert). *Documented errors:* 400, 401, 403, 404.
- **API-071 `DELETE /v1/activity-logs/:date/:activitySlug`**: Unmarks an activity; 404 if not logged. *Tables:* activity_logs (delete). *Documented errors:* 400, 401, 404.
- **API-072 `GET /v1/appointments`**: Appointments from now (or from/to, max one year), soonest first. *Tables:* appointments (read). *Documented errors:* 400, 401.
- **API-073 `POST /v1/appointments`**: Consent required. Creates an appointment (kind, title, startsAt with offset, location, notes, questions) linked to the active pregnancy if any; max 200. *Tables:* pregnancies (read), appointments (create). *Documented errors:* 400, 401, 403. **Note:** Appointments send nothing; reminders are separate.
- **API-074 `GET /v1/appointments/:id`**: One owned appointment; 404 otherwise. *Tables:* appointments (read). *Documented errors:* 400, 401, 404.
- **API-075 `PATCH /v1/appointments/:id`**: Consent required. Edits any field of an owned appointment. *Tables:* appointments (update). *Documented errors:* 400, 401, 403, 404.
- **API-076 `DELETE /v1/appointments/:id`**: Deletes an owned appointment (no consent needed). *Tables:* appointments (delete). *Documented errors:* 400, 401, 404.
- **API-077 `GET /v1/daily-plan`**: Read-only aggregation for 1 or 7 days in the profile zone: week-guide task, journal, hydration, planned meals, up to 2 activities for that day's week, up to 3 checklist items for the week, appointments at local time, reminders by weekday. Nothing is stored by reading. *Tables:* pregnancies, profiles, daily_logs, plan_task_completions, readiness_tasks, user_task_progress, appointments, reminders, articles, meal_logs, activity_logs (read). *Documented errors:* 400, 401. **Note:** Per-day activities fixed 2026-11-06.
- **API-078 `PUT /v1/daily-plan/:date/tasks/:key`**: Consent + active pregnancy required. Marks/clears the plan-owned task guide:w<1-42> for that week; returns the updated day. *Tables:* plan_task_completions (create/delete). *Documented errors:* 400, 401, 403, 404.
- **API-079 `GET /v1/me/exercise-plan`**: Published activities reviewed for the trimester and week of the requested date; none when restrictExercise is set (clinician_guidance); doneToday from activity logs; always includes a disclaimer. *Tables:* pregnancies, profiles, articles, content_reviews, activity_logs (read). *Documented errors:* 400, 401. **Note:** Requested-date week fixed 2026-11-06.
- **API-080 `GET /v1/me/meal-plan`**: Personal meal plan for 1 or 7 days: chooses a published plan reviewed for the trimester(s) of the requested days whose every recipe is published and passes diet pattern, allergies, intolerances, excluded foods and clinician restrictions; cuisine ranks; marks eaten meals. availability: available | no_pregnancy | clinician_guidance | none_published | none_matching. *Tables:* pregnancies, profiles, articles, content_reviews, meal_logs (read). *Documented errors:* 400, 401. **Note:** Requested-date trimester and plural food matching fixed 2026-11-06.
- **API-081 `GET /v1/meal-logs`**: Meals marked eaten between from and to (<= 92 days). *Tables:* meal_logs (read). *Documented errors:* 400, 401.
- **API-082 `PUT /v1/meal-logs/:date/:slot/:recipeSlug`**: Consent required; date not future; recipe must be published. Idempotent find-or-create (unique per owner/date/slot/recipe). *Tables:* articles (read), meal_logs (create). *Documented errors:* 400, 401, 403, 404.
- **API-083 `DELETE /v1/meal-logs/:date/:slot/:recipeSlug`**: Unmarks a meal; 404 if not logged. *Tables:* meal_logs (delete). *Documented errors:* 400, 401, 404.
- **API-084 `GET /v1/saved`**: Saved articles/recipes/activities/meal plans by slug, newest first; optional kind filter. *Tables:* saved_content (read). *Documented errors:* 400, 401.
- **API-085 `PUT /v1/saved/:kind/:slug`**: Bookmarks a published item (idempotent); max 500. *Tables:* articles (read), saved_content (create). *Documented errors:* 400, 401, 404.
- **API-086 `DELETE /v1/saved/:kind/:slug`**: Removes a bookmark; 404 if not saved. *Tables:* saved_content (delete). *Documented errors:* 400, 401, 404.
- **API-087 `GET /v1/shopping-list`**: Shopping items, unchecked first then by name. *Tables:* shopping_items (read). *Documented errors:* 401.
- **API-088 `POST /v1/shopping-list`**: Adds an item (trimmed, lower-cased; existing name returns the same item); max 300 per owner. *Tables:* shopping_items (create). *Documented errors:* 400, 401. **Note:** No consent check (not health data).
- **API-089 `DELETE /v1/shopping-list`**: Removes all checked items. 204. *Tables:* shopping_items (deleteMany). *Documented errors:* 401.
- **API-090 `PATCH /v1/shopping-list/:id`**: Checks/unchecks or changes quantity of an owned item; 404 otherwise. *Tables:* shopping_items (update). *Documented errors:* 400, 401, 404.
- **API-091 `DELETE /v1/shopping-list/:id`**: Removes an owned item. *Tables:* shopping_items (delete). *Documented errors:* 400, 401, 404.
- **API-092 `POST /v1/shopping-list/from-meal-plan`**: Adds every ingredient of the caller's personal meal plan for date..date+days not already listed; returns {added, items}. *Tables:* shopping_items (createMany), plus meal-plan reads. *Documented errors:* 400, 401.

### 6.11 `reminders`

- **API-093 `GET /v1/admin/reminder-deliveries/stats`**: Staff (support+). Delivery counts by status for the last 24 h and oldest pending time; no content or addresses. *Tables:* reminder_deliveries (groupBy). *Documented errors:* 401, 403.
- **API-094 `GET /v1/reminders`**: The caller's reminders (max 20). *Tables:* reminders (read). *Documented errors:* 401.
- **API-095 `POST /v1/reminders`**: Creates a reminder (kind, HH:MM local time, RRULE subset DAILY/WEEKLY;BYDAY, label, channel none|email). Email needs a registered, verified user and EMAIL_PROVIDER; schedules next_run_at in the profile zone. 409 over 20. *Tables:* reminders (create), profiles (read). *Documented errors:* 400, 401, 409.
- **API-096 `PATCH /v1/reminders/:id`**: Updates an owned reminder; cancels queued sends and reschedules. *Tables:* reminders (update), reminder_deliveries (update). *Documented errors:* 400, 401, 404, 409.
- **API-097 `DELETE /v1/reminders/:id`**: Deletes an owned reminder (deliveries cascade). *Tables:* reminders (delete). *Documented errors:* 400, 401, 404.
- **API-098 `GET /v1/reminders/delivery-options`**: Which channels this owner can use: ['email'] for users when email delivery is configured, plus emailVerified. *Tables:* -. *Documented errors:* 401.

### 6.12 `cycles`

- **API-099 `GET /v1/cycles`**: Paged list of recorded periods, newest first. *Tables:* cycles (read). *Documented errors:* 400, 401. **Note:** Preconception-era feature; not part of the pregnancy website.
- **API-100 `POST /v1/cycles`**: Records a period (consent required). Rejects future dates, end before start; DB EXCLUDE constraint rejects overlap (409) and CHECK limits length to 30 days (400). *Tables:* cycles (create). *Documented errors:* 400, 401, 403, 409.
- **API-101 `GET /v1/cycles/:id`**: One period, owner-scoped (404 for other owners). *Tables:* cycles (read). *Documented errors:* 400, 401, 404.
- **API-102 `PATCH /v1/cycles/:id`**: Edits start/end with the same validation (consent required). *Tables:* cycles (update). *Documented errors:* 400, 401, 403, 404, 409.
- **API-103 `DELETE /v1/cycles/:id`**: Deletes an owned period; 404 if not found. *Tables:* cycles (delete). *Documented errors:* 400, 401, 404.
- **API-104 `GET /v1/cycles/estimate`**: Next-period estimate ("calendar-average@1") from the last <=6 cycles: mean/stdev, confidence tier and limitations text. *Tables:* cycles (read). *Documented errors:* 401.

### 6.13 `admin`

- **API-105 `POST /v1/admin/activities`**: Creates an activity draft; requires at least one stop sign; fromWeek <= toWeek. *Tables:* articles (create), audit_events. *Documented errors:* 400, 401, 403, 409.
- **API-106 `GET /v1/admin/articles`**: All versions of all content kinds, paged; filters status, kind, category, slug, search. *Tables:* articles (read). *Documented errors:* 401, 403.
- **API-107 `POST /v1/admin/articles`**: Creates an article draft (new version if the slug only has archived/published versions; 409 if a working version exists or the slug belongs to another kind); audited. *Tables:* articles (create), audit_events. *Documented errors:* 400, 401, 403, 409.
- **API-108 `GET /v1/admin/articles/:id`**: One content version with its reviews. *Tables:* articles, content_reviews (read). *Documented errors:* 400, 401, 403, 404.
- **API-109 `PATCH /v1/admin/articles/:id`**: Edits a draft only (409 otherwise); structured sections validated against contracts; week guides cannot be premium; audited. *Tables:* articles (update), audit_events. *Documented errors:* 400, 401, 403, 404, 409.
- **API-110 `POST /v1/admin/articles/:id/archive`**: Archives any non-archived version (unpublishes it); audited. *Tables:* articles (update), audit_events. *Documented errors:* 400, 401, 403, 404, 409.
- **API-111 `POST /v1/admin/articles/:id/publish`**: approved -> published; archives the previously published version of the slug; meal plans require their recipes to be published (409); sets next review in 12 months; audited. *Tables:* articles (update/updateMany), audit_events. *Documented errors:* 400, 401, 403, 404, 409.
- **API-112 `POST /v1/admin/articles/:id/reviews`**: Clinical review of an in_review version: approved -> approved, changes_requested -> draft. Stores reviewer, credentials, sources, comments. Author or anyone who edited that version gets 403. *Tables:* content_reviews (create), articles (update), audit_events. *Documented errors:* 400, 401, 403, 404, 409. **Note:** Editor-cannot-approve check added 2026-11-06.
- **API-113 `POST /v1/admin/articles/:id/submit`**: draft -> in_review; re-validates structured sections and requires a category; non-empty body for articles; audited. *Tables:* articles (update), audit_events. *Documented errors:* 400, 401, 403, 404, 409.
- **API-114 `GET /v1/admin/audit-events`**: Administrator-only paged audit trail (filters action, actorUserId). Never contains health values. *Tables:* audit_events (read). *Documented errors:* 400, 401, 403.
- **API-115 `GET /v1/admin/content/coverage`**: Week guides 1-42 published/working state and version counts by kind/category/status. *Tables:* articles (read, groupBy). *Documented errors:* 401, 403.
- **API-116 `POST /v1/admin/meal-plans`**: Creates a meal-plan draft (1 or 7 days of recipe slugs, diet patterns, trimesters, hydration note). *Tables:* articles (create), audit_events. *Documented errors:* 400, 401, 403, 409.
- **API-117 `GET /v1/admin/readiness-tasks`**: All checklist tasks in every status. *Tables:* readiness_tasks (read). *Documented errors:* 401, 403.
- **API-118 `POST /v1/admin/readiness-tasks`**: Creates a draft task (unique key, 409 on duplicate) with category, sort order, premium, optional article and week window; audited in the same transaction. *Tables:* readiness_tasks (create), audit_events. *Documented errors:* 400, 401, 403, 409.
- **API-119 `PATCH /v1/admin/readiness-tasks/:id`**: Edits a task and returns it to draft (must be re-published); audited. *Tables:* readiness_tasks (update), audit_events. *Documented errors:* 400, 401, 403, 404, 409.
- **API-120 `POST /v1/admin/readiness-tasks/:id/archive`**: Archives a task (hides it from users); 409 if already archived; audited. *Tables:* readiness_tasks (update), audit_events. *Documented errors:* 400, 401, 403, 404, 409.
- **API-121 `POST /v1/admin/readiness-tasks/:id/publish`**: Clinical reviewer publishes a draft/in_review/approved task; row-locked; 403 if the reviewer created or edited it since it was last published; audited. *Tables:* readiness_tasks (update), audit_events. *Documented errors:* 400, 401, 403, 404, 409. **Note:** Separation of duties added 2026-11-06.
- **API-122 `POST /v1/admin/recipes`**: Creates a recipe draft; sections validated against RecipeSections (ingredients with allergens, steps, diet patterns, etc.). *Tables:* articles (create), audit_events. *Documented errors:* 400, 401, 403, 409.
- **API-123 `GET /v1/admin/users`**: Support/admin account lookup by email or staffOnly; no health data. *Tables:* users (read). *Documented errors:* 400, 401, 403.
- **API-124 `PATCH /v1/admin/users/:id/staff-role`**: Administrator grants/changes/removes a staff role (not their own: 403); revokes the target's sessions; audited with from/to. *Tables:* users (update), auth_sessions (deleteMany), audit_events. *Documented errors:* 400, 401, 403, 404.
- **API-125 `POST /v1/admin/week-guides`**: Creates a week-guide draft (slug pregnancy-week-N, never premium) through the same workflow. *Tables:* articles (create), audit_events. *Documented errors:* 400, 401, 403, 409.

---

## 7. Frontend integration mapping

Every backend operation against the website. A call was counted only after tracing it to a component that a page renders
and a user action or page load that triggers it. A URL string alone does not count. *UI evidence* says how the call was
confirmed: **Browser E2E** = the API logged the request while Playwright clicked through the real site;
**Code-traced + live** = the exact request the code sends was replayed successfully against the API;
**Code-traced** = wiring read in the source, flow not exercised by a browser test.

Classification: 1 Fully integrated · 2 Partially integrated · 3 Called but not correctly handled · 4 Implemented in frontend but not
connected · 5 Not integrated · 6 Backend API does not exist · 7 Integration blocked by configuration.

| API ID | Backend API | HTTP | Integrated? | Frontend file | Function / hook | UI page(s) | Status | UI evidence | Notes |
|---|---|---|---|---|---|---|---|---|---|
| API-001 | `/v1/health` | GET | No | — | — | — | 5. Not integrated | — | Infrastructure/internal: not meant for the UI |
| API-002 | `/v1/health/live` | GET | No | — | — | — | 5. Not integrated | — | Infrastructure/internal: not meant for the UI |
| API-003 | `/v1/anonymous-sessions` | POST | Yes | `components/session-provider.tsx:92` | startGuest() | / (guest button), /login, /signup | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-004 | `/v1/anonymous-sessions/current` | DELETE | Yes | `app/(app)/settings/account-sections.tsx:111` | deleteEverything() (guest) | /settings | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-005 | `/v1/anonymous-sessions/link` | POST | Yes | `components/session-provider.tsx:75` | linkGuest() after signUp/signIn/verifyTotp | /signup, /login | 3. Called but not correctly handled | Code-traced + same request verified live | Guest secret is cleared in `finally` even when linking fails (409/network) → guest data becomes unreachable. |
| API-006 | `/v1/auth/change-password` | POST | Yes | `app/(app)/settings/account-sections.tsx:487` | PasswordCard submit | /settings | 1. Fully integrated | Code-traced + same request verified live |  |
| API-007 | `/v1/auth/error` | GET | No | — | — | — | 5. Not integrated | — | Infrastructure/internal: not meant for the UI |
| API-008 | `/v1/auth/get-session` | GET | Yes | `app/(app)/settings/account-sections.tsx:400` | SessionsCard load() (current token) | /settings | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-009 | `/v1/auth/list-accounts` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-010 | `/v1/auth/list-sessions` | GET | Yes | `app/(app)/settings/account-sections.tsx:399` | SessionsCard load() | /settings | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-011 | `/v1/auth/ok` | GET | No | — | — | — | 5. Not integrated | — | Infrastructure/internal: not meant for the UI |
| API-012 | `/v1/auth/open-api/generate-schema` | GET | No | — | — | — | 5. Not integrated | — | Infrastructure/internal: not meant for the UI |
| API-013 | `/v1/auth/request-password-reset` | POST | No | — | — | — | 7. Blocked by configuration (and no UI) | — | Needs an email provider and a UI page; neither exists |
| API-014 | `/v1/auth/reset-password` | POST | No | — | — | — | 7. Blocked by configuration (and no UI) | — | Needs an email provider and a UI page; neither exists |
| API-015 | `/v1/auth/revoke-other-sessions` | POST | Yes | `app/(app)/settings/account-sections.tsx:459` | SessionsCard revoke("others") | /settings | 1. Fully integrated | Code-traced + same request verified live |  |
| API-016 | `/v1/auth/revoke-session` | POST | Yes | `app/(app)/settings/account-sections.tsx:446` | SessionsCard revoke() | /settings | 1. Fully integrated | Code-traced + same request verified live |  |
| API-017 | `/v1/auth/revoke-sessions` | POST | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-018 | `/v1/auth/send-verification-email` | POST | No | — | — | — | 7. Blocked by configuration (and no UI) | — | Needs an email provider and a UI page; neither exists |
| API-019 | `/v1/auth/sign-in/email` | POST | Yes | `components/session-provider.tsx:115` | signIn() | /login | 1. Fully integrated | Browser E2E (Playwright, real clicks) | TOTP handled; backup-code sign-in missing (verify-backup-code not called). |
| API-020 | `/v1/auth/sign-out` | POST | Yes | `components/session-provider.tsx:141` | signOut() | shell menu (all app pages) | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-021 | `/v1/auth/sign-up/email` | POST | Yes | `components/session-provider.tsx:101` | signUp() | /signup | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-022 | `/v1/auth/two-factor/disable` | POST | Yes | `app/(app)/settings/account-sections.tsx:603` | TwoFactorCard turn off | /settings | 1. Fully integrated | Code-traced + same request verified live |  |
| API-023 | `/v1/auth/two-factor/enable` | POST | Yes | `app/(app)/settings/account-sections.tsx:609` | TwoFactorCard set up | /settings | 1. Fully integrated | Code-traced + same request verified live |  |
| API-024 | `/v1/auth/two-factor/generate-backup-codes` | POST | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-025 | `/v1/auth/two-factor/get-totp-uri` | POST | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-026 | `/v1/auth/two-factor/verify-backup-code` | POST | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-027 | `/v1/auth/two-factor/verify-totp` | POST | Yes | `components/session-provider.tsx:128 + app/(app)/settings/account-sections.tsx:567` | verifyTotp(); TwoFactorCard confirm | /login, /settings | 1. Fully integrated | Code-traced + same request verified live |  |
| API-028 | `/v1/auth/update-session` | POST | No | — | — | — | 5. Not integrated | — | Infrastructure/internal: not meant for the UI |
| API-029 | `/v1/auth/update-user` | POST | Yes | `app/(app)/settings/account-sections.tsx:338` | NameCard save | /settings | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-030 | `/v1/auth/verify-email` | GET | No | — | — | — | 7. Blocked by configuration (and no UI) | — | Needs an email provider and a UI page; neither exists |
| API-031 | `/v1/auth/verify-password` | POST | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-032 | `/v1/me` | GET | Yes | `components/session-provider.tsx:40` | loadMe() in SessionProvider | every page (session) | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-033 | `/v1/me/consents` | GET | Yes | `app/(app)/settings/account-sections.tsx:177; app/(app)/onboarding/page.tsx:76` | useApi (ConsentsCard); onboarding | /settings, /onboarding | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-034 | `/v1/me/consents` | POST | Yes | `lib/consent.ts:23` | recordConsent() | /onboarding, /settings | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-035 | `/v1/me/profile` | GET | Yes | `app/(app)/settings/account-sections.tsx:29; onboarding:95; components/personal-panels.tsx:58,124; components/planning-panels.tsx:616` | useApi | /settings, /onboarding, /nutrition, /exercise | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-036 | `/v1/me/profile` | PUT | Yes | `app/(app)/settings/account-sections.tsx:45; app/(app)/onboarding/page.tsx:365` | ProfileCard save; onboarding confirm() | /settings, /onboarding, /nutrition (FoodPreferencesPanel) | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-037 | `/v1/me/entitlement` | GET | Yes | `app/(app)/settings/account-sections.tsx:251; app/(public)/articles/[slug]/premium-body.tsx:19` | useApi | /settings, /articles/[slug] | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-038 | `/v1/me/deletion` | POST | Yes | `app/(app)/settings/account-sections.tsx:105` | deleteEverything() (account) | /settings | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-039 | `/v1/me/export` | POST | Yes | `app/(app)/settings/account-sections.tsx:89` | export download | /settings | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-040 | `/v1/me/privacy-jobs` | GET | Yes | `app/(app)/settings/account-sections.tsx:70` | useApi (users only) | /settings | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-041 | `/v1/pregnancies` | GET | Yes | `components/outcome-note.tsx:15` | OutcomeNote (limit=1) | /postpartum, /birth-and-postpartum | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-042 | `/v1/pregnancies` | POST | Yes | `app/(app)/onboarding/page.tsx:368` | confirm() | /onboarding | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-043 | `/v1/pregnancies/current` | GET | Yes | `app/(app)/settings/pregnancy-section.tsx:31; app/(app)/tools/page.tsx:28; app/(app)/timeline/page.tsx:36; onboarding:80; weeks/[week]/your-week-note.tsx:11; components/personal-panels.tsx:59,123` | useApi | /settings, /tools, /timeline, /onboarding, /weeks/[week], /nutrition, /exercise | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-044 | `/v1/pregnancies/current` | PATCH | Yes | `app/(app)/settings/pregnancy-section.tsx:78` | DetailsForm save | /settings | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-045 | `/v1/pregnancies/current/birth-preferences` | GET | Yes | `components/planning-panels.tsx:970` | BirthPreferencesPanel | /birth-and-postpartum | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-046 | `/v1/pregnancies/current/birth-preferences` | PUT | Yes | `components/planning-panels.tsx:1007` | BirthPreferencesPanel save | /birth-and-postpartum | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-047 | `/v1/pregnancies/current/dating` | PUT | Yes | `app/(app)/settings/pregnancy-section.tsx:120` | RedateForm submit | /settings | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-048 | `/v1/pregnancies/current/dating-history` | GET | Yes | `app/(app)/settings/pregnancy-section.tsx:109` | useApi | /settings | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-049 | `/v1/pregnancies/current/end` | POST | Yes | `app/(app)/settings/pregnancy-section.tsx:207` | EndPregnancy | /settings | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-050 | `/v1/pregnancies/current/timeline` | GET | Yes | `app/(app)/timeline/page.tsx:37; app/(app)/dashboard/page.tsx:51` | useApi | /timeline, /dashboard | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-051 | `/v1/pregnancies/current/week` | GET | Yes | `app/(app)/dashboard/page.tsx:49; components/personal-panels.tsx:232` | useApi | /dashboard, /nutrition | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-052 | `/v1/pregnancies/current/weeks/:week` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-053 | `/v1/week-guides` | GET | Yes | `lib/public-api.ts:92` | getAllWeekGuides() (server) | /weeks, /nutrition, /exercise, /baby-care, /birth-and-postpartum | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-054 | `/v1/week-guides/:week` | GET | Yes | `lib/public-api.ts:59; app/(app)/timeline/page.tsx:77` | getWeekGuide() (server); useApi | /weeks/[week], /timeline | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-055 | `/v1/daily-logs` | GET | Yes | `app/(app)/journal/page.tsx:31; components/planning-panels.tsx:376` | useApi (history; SleepTracker 7 days) | /journal, /exercise | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-056 | `/v1/daily-logs/:date` | GET | Yes | `app/(app)/journal/page.tsx:127; tools:31; dashboard:55; components/planning-panels.tsx:291` | useApi | /journal, /tools, /dashboard, /nutrition | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-057 | `/v1/daily-logs/:date` | PUT | Yes | `app/(app)/journal/page.tsx:160; components/planning-panels.tsx:296` | JournalForm save(); useTodayLog save() (hydration/sleep) | /journal, /nutrition, /exercise | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-058 | `/v1/daily-logs/:date` | DELETE | Yes | `app/(app)/journal/page.tsx:178` | JournalForm remove() | /journal | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-059 | `/v1/activities` | GET | Yes | `lib/public-api.ts:114` | getActivities() (server) | /exercise | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-060 | `/v1/activities/:slug` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-061 | `/v1/articles` | GET | Yes | `lib/public-api.ts:54,106,121; app/(app)/dashboard/page.tsx:54` | getArticles/getArticleLibrary/getArticlesIn (server); useApi | /, /articles, /dashboard, topic pages | 1. Fully integrated | Browser E2E (Playwright, real clicks) | Homepage shows 4 invented fallback article cards when the list is empty or the API is down (see §11). |
| API-062 | `/v1/articles/:slug` | GET | Yes | `lib/public-api.ts:57; app/(public)/articles/[slug]/premium-body.tsx:18` | getArticle() (server); PremiumBody | /articles/[slug] | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-063 | `/v1/meal-plans` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-064 | `/v1/meal-plans/:slug` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-065 | `/v1/readiness/tasks` | GET | Yes | `app/(app)/checklist/page.tsx:18; tools:30; dashboard:52; components/personal-panels.tsx:180,269; components/planning-panels.tsx:1122` | useApi | /checklist, /tools, /dashboard, /nutrition, /exercise, /baby-care, /birth-and-postpartum, /postpartum | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-066 | `/v1/readiness/tasks/:taskId/progress` | PUT | Yes | `components/task-item.tsx:28` | TaskItem save() | same as above | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-067 | `/v1/recipes` | GET | Yes | `lib/public-api.ts:110` | getRecipes() (server) | /nutrition (RecipeBrowser) | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-068 | `/v1/recipes/:slug` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-069 | `/v1/activity-logs` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-070 | `/v1/activity-logs/:date/:activitySlug` | PUT | Yes | `components/planning-panels.tsx:727` | toggle() mark done | /exercise | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-071 | `/v1/activity-logs/:date/:activitySlug` | DELETE | Yes | `components/planning-panels.tsx:726` | toggle() unmark | /exercise | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-072 | `/v1/appointments` | GET | Yes | `components/planning-panels.tsx:836` | AppointmentsPanel | /birth-and-postpartum | 1. Fully integrated | Browser E2E (Playwright, real clicks) | List/create/delete only: no edit (PATCH) or detail view. |
| API-073 | `/v1/appointments` | POST | Yes | `components/planning-panels.tsx:856` | AppointmentsPanel submit | /birth-and-postpartum | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-074 | `/v1/appointments/:id` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-075 | `/v1/appointments/:id` | PATCH | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-076 | `/v1/appointments/:id` | DELETE | Yes | `components/planning-panels.tsx:878` | AppointmentsPanel delete | /birth-and-postpartum | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-077 | `/v1/daily-plan` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-078 | `/v1/daily-plan/:date/tasks/:key` | PUT | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-079 | `/v1/me/exercise-plan` | GET | Yes | `components/planning-panels.tsx:705` | ExercisePlanPanel | /exercise | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-080 | `/v1/me/meal-plan` | GET | Yes | `components/planning-panels.tsx:208` | MealPlanPanel | /nutrition | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-081 | `/v1/meal-logs` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-082 | `/v1/meal-logs/:date/:slot/:recipeSlug` | PUT | Yes | `components/planning-panels.tsx:139` | setEaten(eaten=true) | /nutrition | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-083 | `/v1/meal-logs/:date/:slot/:recipeSlug` | DELETE | Yes | `components/planning-panels.tsx:139` | setEaten(eaten=false) | /nutrition | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-084 | `/v1/saved` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-085 | `/v1/saved/:kind/:slug` | PUT | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-086 | `/v1/saved/:kind/:slug` | DELETE | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-087 | `/v1/shopping-list` | GET | Yes | `components/planning-panels.tsx:443` | ShoppingListPanel | /nutrition | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-088 | `/v1/shopping-list` | POST | Yes | `components/planning-panels.tsx:477` | add() | /nutrition | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-089 | `/v1/shopping-list` | DELETE | Yes | `components/planning-panels.tsx:494` | clearChecked() | /nutrition | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-090 | `/v1/shopping-list/:id` | PATCH | Yes | `components/planning-panels.tsx:484` | toggle() | /nutrition | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-091 | `/v1/shopping-list/:id` | DELETE | Yes | `components/planning-panels.tsx:489` | remove() | /nutrition | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-092 | `/v1/shopping-list/from-meal-plan` | POST | Yes | `components/planning-panels.tsx:466` | fromPlan() | /nutrition | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-093 | `/v1/admin/reminder-deliveries/stats` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-094 | `/v1/reminders` | GET | Yes | `app/(app)/reminders/page.tsx:35; tools:32; dashboard:53` | useApi | /reminders, /tools, /dashboard | 1. Fully integrated | Browser E2E (Playwright, real clicks) |  |
| API-095 | `/v1/reminders` | POST | Yes | `app/(app)/reminders/page.tsx:96` | NewReminder submit | /reminders | 2. Partially integrated | Browser E2E (Playwright, real clicks) | No channel picker: email delivery (built in the API) cannot be chosen; GET delivery-options unused. |
| API-096 | `/v1/reminders/:id` | PATCH | Yes | `app/(app)/reminders/page.tsx:227` | pause/resume | /reminders | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-097 | `/v1/reminders/:id` | DELETE | Yes | `app/(app)/reminders/page.tsx:242` | delete | /reminders | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-098 | `/v1/reminders/delivery-options` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-099 | `/v1/cycles` | GET | No | — | — | — | 5. Not integrated | — | Preconception cycle tracking: not part of the pregnancy website |
| API-100 | `/v1/cycles` | POST | No | — | — | — | 5. Not integrated | — | Preconception cycle tracking: not part of the pregnancy website |
| API-101 | `/v1/cycles/:id` | GET | No | — | — | — | 5. Not integrated | — | Preconception cycle tracking: not part of the pregnancy website |
| API-102 | `/v1/cycles/:id` | PATCH | No | — | — | — | 5. Not integrated | — | Preconception cycle tracking: not part of the pregnancy website |
| API-103 | `/v1/cycles/:id` | DELETE | No | — | — | — | 5. Not integrated | — | Preconception cycle tracking: not part of the pregnancy website |
| API-104 | `/v1/cycles/estimate` | GET | No | — | — | — | 5. Not integrated | — | Preconception cycle tracking: not part of the pregnancy website |
| API-105 | `/v1/admin/activities` | POST | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-106 | `/v1/admin/articles` | GET | Yes | `app/(app)/admin/content-tab.tsx:34` | ContentTab list | /admin | 2. Partially integrated | Code-traced (UI flow not exercised in browser tests) | Lists recipes/activities/meal plans too, but the UI types and editor only handle article \| week_guide. |
| API-107 | `/v1/admin/articles` | POST | Yes | `app/(app)/admin/content-tab.tsx:189` | Editor create (article) | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-108 | `/v1/admin/articles/:id` | GET | Yes | `app/(app)/admin/content-tab.tsx:338` | reload after review | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-109 | `/v1/admin/articles/:id` | PATCH | Yes | `app/(app)/admin/content-tab.tsx:218` | Editor save | /admin | 2. Partially integrated | Code-traced (UI flow not exercised in browser tests) | Structured sections (recipes, activities, meal plans) cannot be edited; a structured item opens in the article editor. |
| API-110 | `/v1/admin/articles/:id/archive` | POST | Yes | `app/(app)/admin/content-tab.tsx:201,298` | action("archive") | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-111 | `/v1/admin/articles/:id/publish` | POST | Yes | `app/(app)/admin/content-tab.tsx:201,289` | action("publish") | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-112 | `/v1/admin/articles/:id/reviews` | POST | Yes | `app/(app)/admin/content-tab.tsx:329` | ReviewForm | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-113 | `/v1/admin/articles/:id/submit` | POST | Yes | `app/(app)/admin/content-tab.tsx:201,284` | action("submit") | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-114 | `/v1/admin/audit-events` | GET | Yes | `app/(app)/admin/users-tab.tsx:142` | AuditLog | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-115 | `/v1/admin/content/coverage` | GET | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-116 | `/v1/admin/meal-plans` | POST | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-117 | `/v1/admin/readiness-tasks` | GET | Yes | `app/(app)/admin/tasks-tab.tsx:23` | TasksTab | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-118 | `/v1/admin/readiness-tasks` | POST | Yes | `app/(app)/admin/tasks-tab.tsx:120` | TaskForm create | /admin | 2. Partially integrated | Code-traced + same request verified live | No fromWeek/toWeek fields, so week-windowed checklist items cannot be authored. |
| API-119 | `/v1/admin/readiness-tasks/:id` | PATCH | Yes | `app/(app)/admin/tasks-tab.tsx:119` | TaskForm edit | /admin | 2. Partially integrated | Code-traced (UI flow not exercised in browser tests) | Same: week window not editable. |
| API-120 | `/v1/admin/readiness-tasks/:id/archive` | POST | Yes | `app/(app)/admin/tasks-tab.tsx:169` | archive | /admin | 1. Fully integrated | Code-traced + same request verified live |  |
| API-121 | `/v1/admin/readiness-tasks/:id/publish` | POST | Yes | `app/(app)/admin/tasks-tab.tsx:157` | publish | /admin | 1. Fully integrated | Code-traced + same request verified live |  |
| API-122 | `/v1/admin/recipes` | POST | No | — | — | — | 5. Not integrated | — | No frontend code calls it |
| API-123 | `/v1/admin/users` | GET | Yes | `app/(app)/admin/users-tab.tsx:29` | UsersTab | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-124 | `/v1/admin/users/:id/staff-role` | PATCH | Yes | `app/(app)/admin/users-tab.tsx:84` | RoleEditor | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |
| API-125 | `/v1/admin/week-guides` | POST | Yes | `app/(app)/admin/content-tab.tsx:193` | Editor create (week guide) | /admin | 1. Fully integrated | Code-traced (UI flow not exercised in browser tests) |  |


**No frontend call targets a non-existent backend route** (category 6 = 0) and no frontend feature is implemented against a
fake or stubbed client (category 4 = 0). All 83 operations the website calls exist and accept the bodies it sends.

### 7.1 Pages and the APIs they use

| UI page (`frontend/src/app/…`) | APIs called (via page or the components it renders) |
|---|---|
| `/` (`page.tsx`) | `GET /v1/articles` (server, ISR), `POST /v1/anonymous-sessions` (Continue as guest) |
| `/signup`, `/login` (`(auth)/…`) | `POST /v1/auth/sign-up/email`, `POST /v1/auth/sign-in/email`, `POST /v1/auth/two-factor/verify-totp`, `POST /v1/anonymous-sessions/link`, `GET /v1/me` |
| `/onboarding` | `GET/POST /v1/me/consents`, `GET/PUT /v1/me/profile`, `GET /v1/pregnancies/current`, `POST /v1/pregnancies` |
| `/dashboard` | `GET /v1/pregnancies/current/week`, `…/timeline`, `GET /v1/readiness/tasks`, `GET /v1/reminders`, `GET /v1/articles?limit=4`, `GET /v1/daily-logs/{today}` |
| `/timeline` | `GET /v1/pregnancies/current`, `…/current/timeline`, `GET /v1/week-guides/{week}` |
| `/journal` | `GET /v1/daily-logs?from&to`, `GET/PUT/DELETE /v1/daily-logs/{date}` |
| `/checklist`, `/tools` | `GET /v1/readiness/tasks`, `PUT /v1/readiness/tasks/{id}/progress`; tools also `GET /v1/pregnancies/current`, `GET /v1/daily-logs/{today}`, `GET /v1/reminders` |
| `/reminders` | `GET/POST /v1/reminders`, `PATCH/DELETE /v1/reminders/{id}` |
| `/settings` | profile, consents, entitlement, privacy jobs, export, deletion, guest deletion, pregnancy details/re-date/history/end, and Better Auth `update-user`, `list-sessions`, `get-session`, `revoke-session`, `revoke-other-sessions`, `change-password`, `two-factor/enable`, `two-factor/verify-totp`, `two-factor/disable` |
| `/admin` (staff) | admin articles (list/get/create/patch/submit/review/publish/archive), `POST /v1/admin/week-guides`, admin readiness tasks (list/create/patch/publish/archive), `GET /v1/admin/users`, `PATCH …/staff-role`, `GET /v1/admin/audit-events` |
| `/articles`, `/articles/[slug]` | `GET /v1/articles`, `GET /v1/articles/{slug}` (server); premium body re-read client-side with `GET /v1/me/entitlement` |
| `/weeks`, `/weeks/[week]` | `GET /v1/week-guides` (server), `GET /v1/week-guides/{week}` (server), `GET /v1/pregnancies/current` (your-week note) |
| `/nutrition` | `GET /v1/week-guides`, `GET /v1/articles`, `GET /v1/recipes` (server); `GET /v1/me/meal-plan`, `PUT/DELETE /v1/meal-logs/…`, `GET/PUT /v1/daily-logs/{today}` (hydration), shopping list ×6, `GET/PUT /v1/me/profile` (food preferences), `GET /v1/readiness/tasks`, `GET /v1/pregnancies/current(/week)` |
| `/exercise` | `GET /v1/week-guides`, `GET /v1/articles`, `GET /v1/activities` (server); `GET /v1/me/exercise-plan`, `PUT/DELETE /v1/activity-logs/…`, `GET /v1/daily-logs?from&to` + `PUT /v1/daily-logs/{today}` (sleep), `GET /v1/readiness/tasks`, `GET /v1/pregnancies/current`, `GET /v1/me/profile` |
| `/baby-care` | `GET /v1/week-guides`, `GET /v1/articles` (server); `GET /v1/readiness/tasks` + progress (newborn checklist) |
| `/birth-and-postpartum` | `GET /v1/week-guides` (server); `GET/POST/DELETE /v1/appointments`, `GET/PUT …/current/birth-preferences`, `GET /v1/readiness/tasks` + progress, `GET /v1/pregnancies?limit=1` |
| `/postpartum` | `GET /v1/articles` (server), `GET /v1/readiness/tasks` + progress, `GET /v1/pregnancies?limit=1` |
| `/journey`, `/about`, `/contact`, `/privacy`, `/terms`, `/goodbye` | none (static copy) |

### 7.2 Backend APIs not used by the website (42 of 125)

| Group | Operations | Assessment |
|---|---|---|
| Should be integrated | `GET /v1/daily-plan`, `PUT /v1/daily-plan/{date}/tasks/{key}`, `GET/PUT/DELETE /v1/saved…` (3), `PATCH /v1/appointments/{id}`, `GET /v1/appointments/{id}`, `GET /v1/pregnancies/current/weeks/{week}`, `GET /v1/meal-logs`, `GET /v1/activity-logs`, `GET /v1/recipes/{slug}`, `GET /v1/activities/{slug}`, `GET /v1/meal-plans`, `GET /v1/meal-plans/{slug}`, `GET /v1/reminders/delivery-options`, `POST /v1/auth/two-factor/verify-backup-code`, `POST /v1/auth/two-factor/generate-backup-codes` | Built, tested and safe to use; no UI exists. The daily plan and backup-code sign-in are the most valuable (§12). |
| Admin features without UI | `POST /v1/admin/recipes`, `/activities`, `/meal-plans`, `GET /v1/admin/content/coverage`, `GET /v1/admin/reminder-deliveries/stats` | Structured content can only be authored via API or `backend/apps/api/scripts/import-content.mjs`. |
| Password reset and email verification | `POST /v1/auth/request-password-reset`, `POST /v1/auth/reset-password`, `GET /v1/auth/verify-email`, `POST /v1/auth/send-verification-email` | Blocked: off with `EMAIL_PROVIDER=none`, and the website has no reset/verify pages (`/login` says reset "isn't available yet"). |
| Account extras | `POST /v1/auth/verify-password`, `POST /v1/auth/revoke-sessions`, `GET /v1/auth/list-accounts`, `POST /v1/auth/two-factor/get-totp-uri`, `POST /v1/auth/update-session` | Optional; `update-session` is a no-op and could be disabled. |
| Legacy preconception | `/v1/cycles` (6) | Working cycle tracking from the original product; not part of the pregnancy website. |
| Infrastructure | `GET /v1/health`, `GET /v1/health/live`, `GET /v1/auth/ok`, `GET /v1/auth/error`, `GET /v1/auth/open-api/generate-schema` | For load balancers, monitoring and docs; correctly not called by the UI. |

---

## 8. Feature-wise integration status

Legend: ✅ backend implemented and verified · 🌐 website integrated · ⚠️ partial / issue · ❌ missing

### Authentication
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Register | ✅ `POST /v1/auth/sign-up/email` | 🌐 `/signup` (browser-tested) | Client-side password check before the API call. |
| Login | ✅ `POST /v1/auth/sign-in/email` | 🌐 `/login` (browser-tested) | |
| Logout | ✅ `POST /v1/auth/sign-out` | 🌐 shell menu (browser-tested) | Guest "sign out" just forgets the secret. |
| Guest mode | ✅ `POST /v1/anonymous-sessions` + `Authorization: Anonymous` | 🌐 "Continue as guest" (browser-tested) | Secret kept in `localStorage` (`pregnancy-care.guest-secret`). |
| Guest account linking | ✅ `POST /v1/anonymous-sessions/link` (atomic; 409 when the account has health data) | ⚠️ called automatically after sign-up/sign-in | **Secret is deleted even if linking fails** → guest data stranded (§16 C-2). |
| Session handling | ✅ cookie or bearer; 30-day sessions; list/revoke | 🌐 `/settings` sessions card (code-traced + live) | Cookie auth works because site and API are same-site in dev; production must keep them on one registrable domain. |
| Profile retrieval | ✅ `GET /v1/me`, `GET/PUT /v1/me/profile` | 🌐 everywhere / `/settings`, `/onboarding` | |
| Two-factor auth | ✅ enable, verify, disable, backup codes (all verified live) | ⚠️ enable/verify/disable integrated | **No backup-code sign-in**, though backup codes are shown at setup (§16 C-1). |
| Password reset / email verification | ✅ when `EMAIL_PROVIDER` set (e2e-tested with memory provider) | ❌ no pages | Blocked by config and missing UI. |

### Pregnancy
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Create pregnancy (LMP, due date, ultrasound, IVF) | ✅ | 🌐 `/onboarding` (LMP path browser-tested) | Server computes the due date; the website never does. |
| Retrieve current pregnancy | ✅ | 🌐 dashboard, timeline, settings, topic pages | |
| Update details | ✅ `PATCH /v1/pregnancies/current` | 🌐 `/settings` (code-traced) | |
| Due-date calculation / re-dating + history | ✅ `PUT …/dating`, `GET …/dating-history` | 🌐 `/settings` (code-traced; history verified live) | |
| Timeline | ✅ | 🌐 `/timeline`, `/dashboard` (browser-tested) | |
| Week-by-week guides | ✅ public `GET /v1/week-guides(/week)` | 🌐 `/weeks`, `/weeks/[week]`, topic pages | Content: only local sample data; no clinically reviewed guides exist yet. |
| Week detail endpoint | ✅ `GET …/current/weeks/{week}` | ❌ not used | Website composes week pages from public guides instead. |
| Status and history (end, outcomes, list) | ✅ | 🌐 `/settings` end flow; `OutcomeNote` uses `GET /v1/pregnancies?limit=1` | |

### Daily health
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Daily journal | ✅ CRUD by date | 🌐 `/journal` (browser-tested) | |
| Symptoms | ✅ fixed vocabulary | 🌐 `/journal` | |
| Hydration | ✅ `waterGlasses` on daily logs | 🌐 `/nutrition` HydrationTracker (browser-tested) | |
| Sleep | ✅ `sleepMinutes` | 🌐 `/exercise` SleepTracker (browser-tested) | |
| Mood, activity minutes, questions for clinician | ✅ fields on daily logs | ❌ no UI | Kept when omitted, so the journal page doesn't wipe them. |
| Daily plan | ✅ `GET /v1/daily-plan` | ❌ not used | Dashboard builds its own summary instead. |

### Nutrition
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Meal plans (personal) | ✅ `GET /v1/me/meal-plan` | 🌐 `/nutrition` day and week (browser-tested) | Public catalog `GET /v1/meal-plans` unused. |
| Recipes | ✅ `GET /v1/recipes` | 🌐 `/nutrition` RecipeBrowser (server-fetched) | Detail endpoint unused (list carries full recipes). |
| Dietary preferences, food allergies, intolerances, excluded foods | ✅ profile fields; enforced in plan filtering | 🌐 FoodPreferencesPanel, `/settings` | |
| Meal completion | ✅ `PUT/DELETE /v1/meal-logs/…` | 🌐 `/nutrition` (browser-tested) | History list `GET /v1/meal-logs` unused. |
| Shopping list | ✅ 6 operations | 🌐 `/nutrition` (all 6 wired; 4 browser-tested) | Checkbox has no optimistic update (§9.4). |

### Exercise
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Exercise guides | ✅ public `GET /v1/activities` | 🌐 `/exercise` | |
| Trimester-based content | ✅ trimester/week windows; plan uses the requested date's week | 🌐 `ExercisePlanPanel` (browser-tested) | |
| Restrictions | ✅ `restrictExercise` → `clinician_guidance`, contraindications, stop signs | 🌐 `MovementGate`, `AvailabilityNote` | |
| Activity tracking | ✅ `PUT/DELETE /v1/activity-logs/…` | 🌐 (mark done browser-tested) | History `GET /v1/activity-logs` unused. |

### Baby development
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Weekly baby development, growth, size comparison | ✅ week-guide sections `baby`, `babyMilestones`, `sizeComparison` | 🌐 `/weeks/[week]`, `/baby-care` | Content is local sample data only. |
| Illustrations | ❌ no media in the API for this | 🌐 static SVG/illustrations in `frontend/public` (`WombArt`) | Decorative, keyed by week; not data. |

### Baby care
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Newborn preparation checklist | ✅ readiness tasks with newborn categories | 🌐 `/baby-care` PreparationChecklist | |
| Feeding, hygiene, safe sleep education | ✅ articles in `newborn_care`, `breastfeeding` categories | 🌐 `/baby-care` article lists | Sample articles only. |

### Birth preparation
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Hospital bag, birth preparation tasks | ✅ readiness tasks (`hospital_bag`, `birth`) | 🌐 `/birth-and-postpartum` | |
| Birth preferences | ✅ GET/PUT per pregnancy | 🌐 BirthPreferencesPanel (browser-tested) | |
| Appointments | ✅ full CRUD | ⚠️ list/add/delete only | No edit or detail view. |

### Postpartum
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Recovery guide | ❌ no week-by-week postpartum content type | ⚠️ `/postpartum` shows an honest "not published yet" note | Articles in `postpartum` category can cover it. |
| Newborn care, follow-up | ✅ articles + `postpartum_home`/`newborn_appointments` tasks | 🌐 `/postpartum` | |
| Outcome-aware messaging | ✅ pregnancy outcome | 🌐 `OutcomeNote` | |

### Other
| Feature | Backend | Website | Notes |
|---|---|---|---|
| Reminders | ✅ CRUD + email delivery (scheduler, retries, idempotency) | ⚠️ `/reminders` in-app only | No channel picker; email delivery unreachable from UI; **no push**. |
| Articles | ✅ | 🌐 `/articles` | Homepage fallback cards are invented (§11). |
| Profile | ✅ | 🌐 | |
| Consents | ✅ append-only | 🌐 onboarding + settings (withdrawal browser-tested) | |
| Privacy export | ✅ | 🌐 download (browser-tested) | |
| Account deletion | ✅ user + guest | 🌐 (account deletion browser-tested) | |
| Entitlements | ⚠️ read only; no payment provider writes subscriptions | 🌐 `/settings` and premium article lock | Premium can never be purchased. |
| Admin and clinical review | ✅ full workflow with separation of duties | ⚠️ `/admin` articles, week guides, tasks, users, audit | No UI for recipes/activities/meal plans, coverage, delivery stats, task week windows. |
| Saved / bookmarks | ✅ | ❌ | |

---

## 9. API verification and test results

### 9.1 Evidence sources (all run during this audit)

| Source | What it proves | Result |
|---|---|---|
| Backend unit tests (`pnpm test`) | Pure logic: dating, trimesters, estimates, food matching, plan choice, schedules, guards, error mapping, env, email senders, privacy/consent services | **22 files, 269 tests, 269 passed** |
| Backend integration + E2E (`pnpm test:e2e`, real Nest app over HTTP + real PostgreSQL `preconception_test`), with an HTTP recorder attached | Every request the suite makes, with route and status | **16 files, 377 tests, 377 passed; 1,962 requests recorded** |
| Backend combined coverage (`pnpm test:coverage`) | | 96.92 % statements, 87.11 % branches, 95.6 % functions, 97.69 % lines |
| Live website-flow script (cookies + Origin, like the browser) | Better Auth session/password/2FA flows, guest linking, CORS, frontend-only types | **33/33 PASS** |
| Live remaining-route script | Unused Better Auth routes, backup-code sign-in, admin task archive | **17/18 PASS** (`update-session` → 400 "No fields to update") |
| Frontend unit tests, typecheck, lint | | 20/20 passed; `tsc` clean; ESLint clean |
| Frontend Playwright (real Chromium → Next.js production build → API on `preconception_fe_e2e` with sample seed) | Real UI interactions call the API | **31/32 passed** (1 failure is a test-locator issue, §9.4) |
| TypeScript compatibility check (backend contract types assignable to frontend types) | Response-shape compatibility | **25/25 compatible** (§10) |

### 9.2 Per-operation results

| Result | Operations |
|---|---:|
| PASS | 104 |
| PASS (live) | 19 |
| NOT TESTED | 1 |
| PARTIAL | 1 |

- **Every one of the 99 Nest operations** is called by the backend E2E suite, and **98** were observed returning a success
  status. The 99th (`POST /v1/admin/readiness-tasks/{id}/archive`) only ever got 401/403/404 in the suite; it was verified
  live (200, task hidden, second archive 409).
- Every owner-scoped Nest route was called **without credentials and returned 401** (default-deny test), and the role matrix in
  `security.e2e-spec.ts` checks all 22 staff routes against 7 caller types.
- **43 operations were exercised by real browser interactions** on the website.
- The only operation not verified at all is `POST /v1/auth/send-verification-email` (the sign-up verification email is tested,
  this resend endpoint is not).

Per-operation status codes observed in the backend suite are in the *Verified* and *Test coverage* columns of §4. Cross-user
protection was verified for appointments, shopping items, reminders, cycles, daily logs and pregnancies (404 to other users and
guests, owner's data unchanged) in `security.e2e-spec.ts` and `platform.e2e-spec.ts`.

### 9.3 Live website-flow verification (all PASS)

CORS preflight from `http://localhost:3000` with credentials; unknown origin refused · guest session, `GET /v1/me` as anonymous,
consent, onboarding pregnancy body, journal body · sign-up sets a session cookie · guest link moves data (LinkResult shape) and
retires the guest secret · cookie session resolves `/v1/me` · `get-session` returns the token the sessions card needs ·
`update-user` name · second device sign-in, `list-sessions` (2), `revoke-session`, `revoke-other-sessions` · `change-password`
with `revokeOtherSessions:true` revokes other devices, keeps the current one, old password rejected, wrong current password
refused · 2FA `enable` → `verify-totp` (computed TOTP) → sign-in returns `twoFactorRedirect` without a session → wrong code refused
→ correct code completes sign-in → `disable` · `ThisWeek`, `DatingRecord[]`, `PrivacyJob[]` shapes · export download headers ·
`sign-out` ends the cookie session. Additionally: backup-code sign-in works and codes are single-use; `revoke-sessions`,
`verify-password`, `list-accounts` (no hash leaked), `get-totp-uri`, `generate-backup-codes`, `ok`, `error`, `generate-schema` work.

### 9.4 Frontend browser suite (Playwright)

| Run | Result | Cause |
|---|---|---|
| Against the test DB without sample content | 28/32 | 4 tests expect the backend's local sample seed (`prisma/seed.ts` + `seed-journey.ts`), e.g. the recipe "Spinach dal with rice". Test-data prerequisite, not a defect. |
| Seeded DB, first rebuild | 29/32 | Next.js fetch cache (`.next/cache/fetch-cache`) kept responses from the previous API; cleared. |
| Seeded DB, clean build | **31/32** | `topics.spec.ts:63` fails at `shop.getByRole("checkbox").first().check()`. |

**Root cause of the remaining failure (test, not product):** the shopping-list checkbox is a controlled input with no optimistic
update; it changes only after `PATCH /v1/shopping-list/{id}` returns (verified 200), and checked items move below unchecked
ones. Playwright's `.check()` asserts the state changes synchronously, so it fails. With the step changed to click-then-wait
(scratch copy, repository untouched) the whole planning flow passed, covering exercise plan, activity logging, appointments,
birth preferences, the shopping list and checklists. **UX note:** the checkbox gives no immediate feedback.

---

## 10. Frontend/backend contract compatibility

### 10.1 Response types (compiler-checked)

A TypeScript file asserted, for each shared type, that the backend contract type (`backend/packages/contracts`) is assignable
to the frontend's expected type (`frontend/src/lib/types.ts`), plus the reverse for `DatingInput` (request direction). A deliberately
mismatched pair was confirmed to fail, so the check is not vacuous.

**Compatible (25/25):** ErrorCode, PageInfo, StaffRole, Me, AnonymousSessionCreated, ConsentState, Profile, Entitlement, DailyLog,
ReadinessTask, ArticleSummary, Article, Reminder, DatingInput (both directions), Pregnancy, Timeline, WeekGuide, Recipe, Activity,
PersonalMealPlan, ExercisePlan, ShoppingItem, Appointment, BirthPreferences.

Frontend-only types checked against live responses: `ThisWeek`, `DatingRecord`, `PrivacyJob`, `LinkResult` match.
`AdminArticle.kind` is typed `"article" | "week_guide"` but the API returns `recipe | activity | meal_plan` too; `AdminTask` lacks
`fromWeek`/`toWeek`; `AdminArticle` lacks `category`, `trimester`, `tags` (not compile-checked: admin types have no contract).

### 10.2 Requests, auth and transport

| Check | Result |
|---|---|
| URL paths and HTTP methods | All 83 frontend operations match registered routes and methods. |
| Request bodies | Match the DTOs (whitelist + forbidNonWhitelisted would 400 any extra field): onboarding `{...details, dating, source}`, journal `{symptoms, note}`, reminders `{kind, localTime, recurrence, label, enabled}`, activity log `{minutes}` (null accepted), appointments, birth preferences, consents, task progress, change-password, 2FA bodies. Verified live for the auth and onboarding bodies and by the browser suite for the rest. |
| Query parameters | `limit/offset`, `from/to`, `date/days`, `category`, `kind/status` match DTOs. |
| List vs page shapes | Arrays: reminders, readiness tasks, daily logs, shopping list, appointments, admin tasks, privacy jobs, consents, week-guides list. Pages `{items,page}`: articles, pregnancies, admin articles/users/audit events, recipes, activities. The website expects exactly these. |
| Authentication | Accounts: Better Auth cookie (`credentials:"include"`), no bearer. Guests: `Authorization: Anonymous`. Auth calls opt out of the guest header (`asAccount`), because the API resolves the Anonymous header before the cookie. |
| CORS | `CORS_ORIGINS` must list the site origin; credentials allowed; `x-request-id` and `set-auth-token` exposed. Verified. |
| Cookies across origins | Works locally because `localhost:3000` → `localhost:4000` is same-site. **Production:** site and API must share a registrable domain (e.g. `www.example.com` + `api.example.com`) or the session cookie will not be sent; production cookies are `__Secure-` prefixed. |
| Error envelope | `toError()` handles both Nest `{error:{…}}` and Better Auth `{code,message}`; `details[]` shown per field; 429 has its own message. |
| Pagination | Admin lists request `limit=100`; `getArticleLibrary` reads one page of up to 100 (silently truncates beyond 100 published articles). |
| Dates and time zones | API computes "today" in the **profile** time zone; the website's planning panels use the **browser** date (`todayIso()` in 12 places). They agree when the profile zone equals the browser's (the default set at onboarding); a traveller or an edited zone can see the wrong day or a 400 "date cannot be in the future" near midnight. |
| Null handling | Nullable fields typed nullable on both sides; checked by the compiler. |

### 10.3 Contract issues found

| # | Issue | Severity | Location |
|---|---|---|---|
| K-1 | Admin types out of date with the 2026-11-03 content kinds (structured content opens in the article editor) | Medium | `frontend/src/lib/types.ts` (`AdminArticle`, `AdminTask`), `app/(app)/admin/content-tab.tsx:25` |
| K-2 | Browser-date vs profile-time-zone "today" | Low–Medium | `frontend/src/lib/dates.ts:10` and planning panels |
| K-3 | Article library capped at the first 100 | Low | `frontend/src/lib/public-api.ts:106` |
| K-4 | Hand-maintained type copy instead of importing `@preconception/contracts` (drift risk) | Low | `frontend/src/lib/types.ts` |
| K-5 | `POST /v1/auth/get-session` documented in OpenAPI but returns 405 | Low (docs) | `backend/docs/api/openapi.json` |

---

## 11. Mock data audit

Search covered hardcoded collections, "mock/dummy/fake/sample/placeholder/TODO", and every component that renders user data.
**No simulated authentication, fake pregnancy progress, static meal plans, dummy activities, fake reminders, hardcoded
appointments or static checklist completion was found:** each comes from the API.

| File | Feature | What it is | Backend API exists? | Action |
|---|---|---|---|---|
| `frontend/src/components/article-strip.tsx:33` (`FALLBACK_ARTICLES`) | Homepage "Helpful articles for you" | **Four invented article cards** ("Healthy Eating During Pregnancy", "5 min read", etc.) shown when no articles are published *or the API is unreachable*. They look like real articles but link to `/articles`. | Yes (`GET /v1/articles`) | **Remove**; show an empty or "articles coming soon" state. Used by `src/app/page.tsx:161` (the dashboard only renders the strip when real articles exist). |
| `frontend/src/app/(public)/journey/page.tsx:16,37` | Journey overview | Static trimester/milestone definitions (ACOG boundaries) | Timeline API exists for personal data | None: general education, not user data, consistent with the API. |
| `frontend/src/app/page.tsx:12–26` | Homepage marketing tiles | Static marketing copy | n/a | None. |
| `frontend/src/components/planning-panels.tsx:964–966` | Birth preferences options | Fixed option lists (settings, feeding, pain relief) | Values validated by API | None; keep in sync with API enums. |
| `frontend/src/app/(public)/postpartum/page.tsx:45` | Postpartum recovery guide | Honest `NotAvailable` notice, no sample data | No | Fine as is until content exists. |
| Backend `apps/api/prisma/seed.ts`, `seed-journey.ts` | All week guides, recipes, activities, meal plans, 50 tasks, 15 articles in local DBs | **Sample, not clinically reviewed** content, published with no review record; refuses non-local DBs | — | Never seed production. The website correctly shows "not clinically reviewed" when `review` is null (`UnreviewedNote`). |

---

## 12. Missing APIs and integration gaps

Prioritised. "BE" = backend work, "FE" = frontend work.

| # | Priority | Feature | Required API | BE | FE | Dependencies | Security / clinical considerations |
|---|---|---|---|---|---|---|---|
| G-1 | **Critical** | 2FA backup-code sign-in | `POST /v1/auth/two-factor/verify-backup-code` (exists) | No | Yes: "Use a backup code" on the 2FA step of `/login` | — | Staff must use 2FA; without this, a lost phone locks staff out (support has no reset path). |
| G-2 | **Critical** | Guest-link failure handling | `POST /v1/anonymous-sessions/link` (exists) | No | Yes: keep the secret on failure; explain 409; offer retry or to keep the guest data | — | Prevents silent loss of guest health records. |
| G-3 | **Critical (before launch)** | Clinically reviewed content | Admin workflow (exists) | No | Partly (see G-6) | Clinicians | All current content is unreviewed sample data. |
| G-4 | High | Password reset and email verification | 4 Better Auth routes (exist) | Config: `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `RESEND_API_KEY` | Yes: `/forgot-password`, `/reset-password?token=`, `/verify-email?token=` (links point at `APP_URL`) | Email provider account, sender domain | Tokens single-use, 30 min; no account enumeration. |
| G-5 | High | Payments / subscriptions | **Missing**: provider checkout + webhook writing `subscriptions`/`subscription_events` | Yes | Yes (purchase UI) | Payment provider (Stripe / App Store / Play) | Verify webhook signatures; idempotency via `(provider, providerEventId)` unique key already in schema. |
| G-6 | High | Admin authoring of recipes, activities, meal plans, task week windows, coverage | 5 admin APIs (exist) | No | Yes: structured editors in `/admin`; fix `AdminArticle`/`AdminTask` types | — | Structured content is validated server-side; UI must show validation `details`. |
| G-7 | High | Remove invented article cards | `GET /v1/articles` (exists) | No | Yes | — | Don't present fabricated content. |
| G-8 | Medium | Email reminders in UI | `GET /v1/reminders/delivery-options`, `channel` on reminders (exist) | No (needs G-4 config) | Yes: channel picker when available | Email provider, verified address | Labels default to non-health wording on lock screens. |
| G-9 | Medium | Daily plan view | `GET /v1/daily-plan`, `PUT …/tasks/{key}` (exist) | No | Yes | — | Read-only aggregation; nothing stored by viewing. |
| G-10 | Medium | Edit appointments; saved items; meal/activity history; mood/questions in journal | Existing APIs | No | Yes | — | Health data: consent already enforced by API. |
| G-11 | Medium | Push notifications | **Missing** (device registration + provider) | Yes | Yes | APNs/FCM/web-push | Lock-screen content must avoid health details. |
| G-12 | Medium | Time-zone-consistent "today" | Use `pregnancy.today` / profile zone | No | Yes | — | Avoids wrong-day writes. |
| G-13 | Low | Postpartum week-by-week guide | Content type or articles | Maybe | Yes | Clinicians | |
| G-14 | Low | Disable no-op `update-session`; fix OpenAPI `POST get-session`; refresh `API_INVENTORY.md`, `BACKEND_GAPS.md`, README counts | — | Yes (docs/config) | Yes (docs) | — | — |

---

## 13. Broken or partially working APIs

No endpoint is broken: every operation returned its documented success response in tests or live checks.

| Operation / feature | State | Detail |
|---|---|---|
| `POST /v1/auth/update-session` | Partial (no-op) | Always 400 "No fields to update"; no custom session fields configured. Recommend adding it to `DISABLED_AUTH_PATHS`. |
| `GET /v1/me/entitlement` + premium gating | Feature partial | Correctly reads subscriptions, but nothing creates them (no payment integration), so premium content is permanently locked. |
| Reminders delivery | Feature partial | Email delivery implemented and tested (scheduler, SKIP LOCKED, retries, idempotency key); push not implemented; email off by default. |
| 4 email auth routes | Unavailable by configuration | Disabled with `EMAIL_PROVIDER=none` (default). Tested end to end with the in-memory provider. |
| `POST /v1/auth/send-verification-email` | NOT TESTED | The automatic verification email at sign-up is tested; the resend endpoint is not. |
| Website: guest linking | Incorrectly handled | §16 C-2. |
| Website: shopping-list checkbox | Works, no optimistic update | §9.4. |

---

## 14. Security and authorization findings

**Verified controls** (tests and live checks during this audit and the 2026-11-06 QA run):

- Default deny: every non-public route returns 401 without credentials (all owner routes tested).
- Roles: 22 staff routes × 7 caller types (user, guest, editor, reviewer, admin, support, admin without 2FA) enforced; administrator passes all; staff without 2FA get 403.
- No IDOR: other users' and guests' ids return 404, indistinguishable from missing, for read/update/delete; owner data unchanged.
- Client-supplied `userId`, `staffRole`, `status` rejected (400) or ignored (Better Auth `input:false`).
- Separation of duties: authors and editors of a content version cannot approve it; task authors/editors cannot publish it.
- Sessions revoked on role change, sign-out, password change (others) and deletion; expired/tampered tokens 401.
- Rate limits: global 120/min/IP; guest sessions 10/h; sign-in 5/min; sign-up 10/h; export and deletion 3/h; 2FA verify 5/min.
- No leakage: 500s return a generic message; constraint errors don't echo values; account endpoints return no credential material; support staff see no health data; logs carry request id and error class only.
- CORS limited to `CORS_ORIGINS` with credentials; production config refuses http origins, disabled rate limiting or MFA, and `log` email.

**Findings:**

| # | Severity | Finding | Recommendation |
|---|---|---|---|
| S-1 | High | 2FA without backup-code sign-in in the website (G-1) | Add the backup-code path; consider an audited admin 2FA reset. |
| S-2 | Medium | Guest secret in `localStorage` is readable by any script on the site (XSS would expose guest health data) | Keep a strict CSP; consider moving guests to an httpOnly cookie. |
| S-3 | Medium | Production cookie requires same registrable domain for site and API | Decide domains before launch; test cross-origin sign-in on staging. |
| S-4 | Low | `update-session` exposed but useless | Disable. |
| S-5 | Low | Website public server fetches share one IP; rate-limit pressure on builds handled by retries | Exempt the website server or use a server key in production. |

The 2026-11-06 QA run already fixed: editor self-approval, task self-publication, duplicate reminder emails on retry, export jobs
stuck in `processing`, tests able to write to non-test databases (see `backend/docs/QA_REPORT_2026-11-06.md`).

---

## 15. Database interaction details

PostgreSQL schema: `backend/apps/api/prisma/schema.prisma` (5 migrations, applied from empty with no drift).

| Table (model) | Written by | Read by | Integrity |
|---|---|---|---|
| `users`, `auth_sessions`, `auth_accounts`, `auth_verifications`, `two_factors` (Better Auth) | `/v1/auth/*`, staff-role change, deletion | AuthGuard, admin users | unique email; cascade on user delete |
| `anonymous_sessions` | create/delete/link; guard slides expiry | AuthGuard | unique credential hash |
| `profiles` | `PUT /v1/me/profile`, link | profile, plans, clock | single-owner CHECK; size CHECKs; country format |
| `consent_records` | `POST /v1/me/consents`, link | consent gate | append-only; single owner |
| `pregnancies`, `pregnancy_datings`, `birth_preferences` | pregnancy routes, link | pregnancy, plans, daily plan, export | one active per owner (partial unique indexes); end-fields CHECK; cascade |
| `daily_logs` | daily-logs PUT/DELETE, link | journal, plans, daily plan | unique (owner, date); range CHECKs |
| `cycles` | cycles routes | estimate | EXCLUDE no-overlap; length CHECK |
| `articles`, `content_reviews` | admin content workflow | catalog, articles, week guides, plans | one published per slug+locale; per-kind shape CHECKs; versions kept |
| `readiness_tasks`, `user_task_progress` | admin tasks; progress PUT | checklist, daily plan | unique key; week window CHECK; unique (owner, task) |
| `reminders`, `reminder_deliveries` | reminders routes, pregnancy end, profile zone change, scheduler | reminders, daily plan, stats | ≤20 per owner (API); local-time format CHECK; unique (reminder, scheduledFor) |
| `appointments`, `meal_logs`, `activity_logs`, `saved_content`, `shopping_items`, `plan_task_completions` | planning routes, link | planning, daily plan, export | single-owner CHECKs; per-owner unique keys make writes idempotent; slot/minutes CHECKs |
| `subscriptions`, `subscription_events` | **nothing** | entitlements, export | unique (provider, externalId / eventId) |
| `privacy_jobs`, `audit_events` | export, deletion, every admin transition | privacy jobs, audit log, separation-of-duties checks | survive user deletion (user_id null) |

All 13 owner-scoped tables have the single-owner CHECK and `ON DELETE CASCADE` on both owner FKs (verified from `pg_constraint`).
Multi-step writes (pregnancy + dating, re-date, end + reminder pausing, guest link, deletion, every content transition + audit)
run in one transaction; rollback verified. Concurrency verified: 5 parallel pregnancy creations → 1 created, 4×409; 8 parallel
journal writes for one day → 1 row; parallel meal-log/shopping-item writes → 1 row.

---

## 16. Critical issues

| # | Issue | Where | Impact |
|---|---|---|---|
| C-1 | No backup-code sign-in for 2FA | `frontend/src/app/(auth)/login/page.tsx`, `session-provider.tsx` | Staff (2FA mandatory) and users who lose their authenticator are locked out. |
| C-2 | Guest data stranded when linking fails | `frontend/src/components/session-provider.tsx:71-87` (`finally { guestSecret.clear() }`) | A guest who signs into an account that already has health data (409), or hits a network error, permanently loses access to the guest records. |
| C-3 | No clinically reviewed content | content in local DBs is sample data | The product cannot launch with health guidance that has not been reviewed. |
| C-4 | Premium cannot be activated | no payment integration | Premium articles/tasks are permanently locked. |
| C-5 | No password reset | email provider off; no website pages | Users who forget their password cannot recover their account. |

## 17. Recommended fixes

Recommendations only; no application code was changed by this audit.

1. **C-2** In `linkGuest()`, clear the guest secret only after a successful link. On 409, tell the person the account already has
   pregnancy data and offer to keep using the guest session or export it; on network errors keep the secret and retry.
2. **C-1** Add "Use a backup code" to the two-factor step, calling `POST /v1/auth/two-factor/verify-backup-code` with `{code}` (verified working).
3. **G-7** Delete `FALLBACK_ARTICLES` and render an empty state.
4. **K-1/G-6** Update `AdminArticle`/`AdminTask` types; add recipe, activity and meal-plan editors that post to the existing admin endpoints and show validation `details`; add `fromWeek`/`toWeek` to the task form; restrict the content list's kind filter accordingly.
5. **C-5/G-4** Configure Resend (`EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `RESEND_API_KEY`, `APP_URL`) and add forgot-password, reset-password and verify-email pages.
6. **G-8** Offer the email channel on `/reminders` when `GET /v1/reminders/delivery-options` returns it.
7. **K-2** Use the API's `pregnancy.today` (or a profile-zone helper) instead of the browser date for writes.
8. Shopping list: optimistic checkbox update (and fix `topics.spec.ts:91` to click then assert).
9. Disable `update-session`; fix the OpenAPI `POST /v1/auth/get-session` entry; refresh `API_INVENTORY.md`, README counts and `BACKEND_GAPS.md`.
10. Document the frontend E2E prerequisite (seeded local DB, cleared `.next/cache/fetch-cache` when switching APIs).

## 18. Implementation roadmap

| Phase | Work | Owner |
|---|---|---|
| **1. Before any real users (1–2 weeks)** | C-2 guest-link handling · C-1 backup codes · remove fake article cards · decide production domains and test cookie auth on staging · configure email and build password reset/verification (C-5) | Frontend + DevOps |
| **2. Content readiness** | Admin editors for structured content and task windows (G-6) · clinicians author and review week guides 1–42, recipes, activities, meal plans, newborn/postpartum articles · use `/v1/admin/content/coverage` to track | Frontend + clinical team |
| **3. Engagement** | Email reminder channel (G-8) · daily plan page (G-9) · appointment edit, saved items, journal mood/questions, history views (G-10) · time-zone-consistent dates (G-12) | Frontend |
| **4. Monetisation and notifications** | Payment provider + webhook → subscriptions (G-5) · purchase UI · push notifications with device registration (G-11) | Backend + frontend |
| **5. Hardening** | CSP / httpOnly guest credential (S-2) · server-to-server key for public reads (S-5) · load tests for `/daily-plan` and `/me/meal-plan` · import contracts package in the frontend (K-4) | Both |

## 19. Source file references

**Backend** (`preconception-platform/backend/`)
- Wiring: `apps/api/src/app.module.ts`, `setup-app.ts`, `main.ts`, `openapi.ts`, `config/env.ts`
- Auth: `apps/api/src/auth/auth.guard.ts`, `auth.decorators.ts`, `owner.ts`, `better-auth.ts`, `anonymous.controller.ts`, `anonymous.service.ts`, `me.controller.ts`
- Errors/validation: `apps/api/src/common/filters/api-exception.filter.ts`, `common/errors.ts`, `common/validation.ts`, `common/pagination.ts`
- Controllers: see the *Evidence* column in §4 (28 controller classes)
- Business logic: `pregnancy/dating.ts`, `pregnancy/pregnancy.service.ts`, `content/catalog.ts`, `planning/personal-plans.service.ts`, `planning/daily-plan.service.ts`, `reminders/schedule.ts`, `reminders/reminder-delivery.service.ts`, `privacy/privacy.service.ts`, `admin/admin-content.service.ts`, `entitlements/entitlements.service.ts`, `cycles/estimate.ts`
- Data: `apps/api/prisma/schema.prisma`, `prisma/migrations/*`, `prisma/seed.ts`, `prisma/seed-journey.ts`
- Contracts: `packages/contracts/src/index.ts`
- Tests: `apps/api/src/**/*.spec.ts`, `apps/api/test/*.e2e-spec.ts`; QA report `docs/QA_REPORT_2026-11-06.md`

**Frontend** (`preconception-platform/frontend/`)
- API layer: `src/lib/api.ts`, `src/lib/use-api.ts`, `src/lib/public-api.ts`, `src/lib/consent.ts`, `src/lib/types.ts`, `src/lib/dates.ts`
- Session: `src/components/session-provider.tsx`
- Features: `src/components/planning-panels.tsx`, `personal-panels.tsx`, `task-item.tsx`, `outcome-note.tsx`, `article-strip.tsx`, `dating-form.tsx`
- Pages: `src/app/(app)/*` (signed-in), `src/app/(public)/*`, `src/app/(auth)/*`, `src/app/page.tsx`
- Tests: `src/lib/*.test.ts`, `e2e/*.spec.ts`, `playwright.config.ts`

## 20. Audit method, scope and reproduction

1. **Route inventory:** booted `apps/api/dist` (built from current source) against the test DB; read Express's router stack and
   Nest's module container (controller path + method metadata, `auth:requirement`, throttler metadata); listed Better Auth's
   endpoints from the live instance and requested each over HTTP to classify reachable/disabled.
2. **Documentation comparison:** diffed runtime operations against `docs/api/openapi.json` and existing docs.
3. **Backend verification:** ran the full backend E2E suite with an HTTP recorder (logs method, matched route, status, calling test
   file); ran unit tests and coverage.
4. **Live checks:** two scripts replaying the website's own request sequences (cookies, Origin header, TOTP computed from the
   enrolment URI) against fresh API instances on the test databases.
5. **Frontend:** read every API call site and traced it to the page rendering it; compiler-checked type compatibility; ran
   unit tests, typecheck and lint; built the production site against a seeded disposable API and ran Playwright while the API
   logged every request.
6. **Not done:** no production or staging system was contacted; no real email, push or payment provider was called (none is
   configured); load testing was not run; the website's responsive and accessibility behaviour was only covered by its own tests.
7. **Repository changes by this audit:** only this file. Temporary Playwright configs were created and removed; scratch scripts
   lived outside both repositories. Two local disposable databases were created (`preconception_test` already existed;
   `preconception_fe_e2e` new, seeded with sample content) and can be dropped.

---

## 21. Final summary dashboard

### Backend API Summary

| Metric | Actual Count |
|---|---:|
| Total unique paths | **97** (default config) · 101 with email provider |
| Total API operations | **121** (99 NestJS + 22 Better Auth) · 125 with email provider |
| GET | 54 |
| POST | 40 |
| PUT | 9 |
| PATCH | 8 |
| DELETE | 10 |
| Fully implemented | 120 of 121 (+4 email-only routes implemented, off by default) |
| Partially implemented | 1 (`update-session` no-op); feature-level: entitlements (no payment writer), reminders (no push) |
| Broken | 0 |
| Not tested | 1 (`POST /v1/auth/send-verification-email`) |

### Frontend Integration Summary (of 125 backend operations)

| Metric | Actual Count |
|---|---:|
| Backend API operations | 125 (121 with default config) |
| Integrated in the website | **83** |
| — Fully integrated | 77 |
| — Partially integrated | 5 |
| — Called but not correctly handled (incorrectly integrated) | 1 |
| Not integrated | 38 |
| Blocked by configuration | 4 |
| Frontend calls to non-existent APIs | 0 |
| Integrated operations exercised by real browser tests | 43 of 83 |

### Overall Health

- **Backend implementation:** complete for the pregnancy product. 120 of 121 default operations fully implemented and working; no broken endpoints. Missing: payments, push, postpartum guide content type.
- **Backend verification:** strong. 269 unit + 377 integration/E2E tests pass; 96.9 % statement / 87.1 % branch coverage; 123 of 125 operations verified with an observed success response; authorization, IDOR, rate limits and constraints tested.
- **Frontend integration:** 83 of 125 operations used (83 of the 110 that a pregnancy website could need, excluding 6 legacy cycle and 5 infrastructure routes); 31/32 browser tests pass, the one failure being a test locator.
- **Contract compatibility:** good. 25/25 shared response types compatible; all request bodies, methods, paths and list shapes match; admin types stale; browser-date vs profile-zone risk.
- **Critical issues:** C-1 backup-code sign-in, C-2 guest data loss on failed link, C-3 no reviewed content, C-4 no payments, C-5 no password reset.
- **Remaining work:** see §18.

### Answers

1. **How many APIs exist?** **121 operations on 97 unique paths** with the default configuration: 99 NestJS operations (75 paths) and 22 Better Auth operations. **125 operations on 101 paths** when an email provider is configured.
2. **What does each do?** §6 describes every operation's behaviour, validation, auth and tables; §4 lists request/response shapes and evidence.
3. **How many are working and verified?** **123 of 125** returned their success response under test (104 in the automated suites, 19 in live checks during this audit).
4. **Partially implemented or broken?** 1 partial (`POST /v1/auth/update-session`, no-op), 0 broken, 1 not tested (`send-verification-email`). Feature-level partials: entitlements (no payments) and reminders (no push).
5. **How many are integrated into the frontend?** **83** (77 fully, 5 partially, 1 incorrectly handled); 43 of them were exercised by real browser tests.
6. **Which pages use which APIs?** §7.1, and per operation in §7.
7. **Which APIs are missing from the frontend?** 42 operations, grouped in §7.2. The important ones are backup-code sign-in, password reset/verification, daily plan, saved items, appointment editing, email reminder channel and the admin editors for structured content.
8. **Which frontend features use dummy data?** Only the homepage's four fallback article cards (`components/article-strip.tsx:33`). All user data comes from the API. Note that all *content* in local databases is unreviewed sample seed data.
9. **What must be fixed before production?** C-1 to C-5 (§16), production domain/cookie setup (S-3), and recommendations 1–5 in §17.

