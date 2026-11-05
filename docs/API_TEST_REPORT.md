# API Test Report

Run date: 2026-10-18 · Node 22.17.1 · Vitest 4.1.12 · PostgreSQL 17 (local Docker) · Better Auth 1.7.10

## Results (actual runner output, JSON reporter)

| Suite | Command | Files | Tests | Passed | Failed | Skipped |
|---|---|---|---|---|---|---|
| Unit | `pnpm --filter @preconception/api test` | 10 | 115 | 115 | 0 | 0 |
| Integration (e2e, real Postgres) | `pnpm --filter @preconception/api test:e2e` | 9 | 175 | 175 | 0 | 0 |
| **Total** | | **19** | **290** | **290** | **0** | **0** |

Also passing: `pnpm build`, `pnpm lint` (0 warnings), `pnpm typecheck` (all 11 workspace tasks),
the Prisma migration-drift check, and `pnpm audit --prod --audit-level high`. The 2 high
findings are the pre-existing exceptions recorded in `pnpm-workspace.yaml`; the 1 moderate is the
pre-existing Expo `uuid` advisory. `pnpm format:check` flags only `apps/{web,admin}/next-env.d.ts`,
which Next.js generates.

### Coverage (v8, `src/**` excluding the generated Prisma client and spec files)

| Suite | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| Unit (`test:cov`) | 26.59% (242/910) | 37.57% (180/479) | 21.83% (50/229) | 25.78% (221/857) |
| E2E (`test:e2e:cov`) | 95.71% (871/910) | 81.21% (389/479) | 96.50% (221/229) | 97.31% (834/857) |

The runs are reported separately, not merged. Unit coverage is low on purpose: controllers and
services are tested through HTTP against a real database, and unit tests target pure logic
(estimate algorithm, guard decisions, error mapping, credentials, entitlements). Not 100%.

## Test environment

- E2E uses a dedicated database, `preconception_test` (see setup below), never the dev database.
  CI uses its own ephemeral Postgres service.
- Each file boots the real `AppModule` + `setupApp()` (Better Auth mounted, global guard,
  validation pipe, filter) through `test/helpers.ts`. Users are created through the real
  sign-up endpoint with unique emails; anonymous sessions through the real endpoint.
- Rate limiting is off in e2e (`RATE_LIMIT_ENABLED=false`) because every request comes from one
  IP; `rate-limit.e2e-spec.ts` turns it on and tests it.
- Staff roles are granted directly in the DB by the helper (normally an audited admin action),
  with `twoFactorEnabled` set, to avoid driving a TOTP flow in every test.

```sh
docker exec preconception-local-postgres-1 psql -U preconception -d preconception -c "CREATE DATABASE preconception_test"   # once
export DATABASE_URL=postgresql://preconception:preconception_local@localhost:5434/preconception_test
pnpm --filter @preconception/api exec prisma migrate deploy
pnpm --filter @preconception/api test:e2e        # or test:e2e:cov
```

## What is covered

### Unit (115)

| File | Tests | Focus |
|---|---|---|
| `cycles/estimate.spec.ts` | 12 | Insufficient history, regular/irregular cycles, window width, implausible gaps skipped, 6-cycle cap, overdue notice, order/duplicate insensitivity, never above "moderate", mandatory limitations |
| `auth/auth.guard.spec.ts` | 18 | Default deny, public/optional/user/staff requirements, inactive accounts, anonymous lookup **by hash only**, expired/linked sessions, sliding retention at most daily, role matrix, 2FA enforcement and override |
| `common/filters/api-exception.filter.spec.ts` | 20 | Status → code mapping, `CONSENT_REQUIRED` / `PREMIUM_REQUIRED`, DB errors mapped **without echoing row values**, structured validation details, parser errors, generic 5xx, log content |
| `config/env.spec.ts` | 13 | Defaults, coercion, flags, every invalid variable named **without its value** |
| `auth/anonymous-credentials.spec.ts` | 13 | Secret entropy/format, hashing, header parsing edge cases, `ownerWhere` |
| `common/errors.spec.ts` | 12 | Prisma/Postgres code mapping (P2002, P2003, P2025, 23P01, 23514), unknown errors fall through, nested validation paths |
| `common/middleware/request-id.middleware.spec.ts` | 10 | Safe/unsafe upstream ids |
| `entitlements/entitlements.service.spec.ts` | 9 | Anonymous → none, state/expiry matrix, live subscription wins |
| `database/prisma.service.spec.ts` | 4 | Readiness timeout |
| `health/health.controller.spec.ts` | 4 | Probes |

### Integration (175)

| File | Tests | Focus |
|---|---|---|
| `health-data.e2e-spec.ts` | 55 | Consent gate (none, granted, withdrawn; reads still allowed), cycles CRUD, **409 overlap with no date leakage**, 400 future / impossible / >30-day / unknown-field, malformed and unknown ids, **cross-user access → 404 for get/patch/delete/list**, anonymous owners, pagination (totals, last page, beyond end, `limit` 0/101/-1/abc/1.5), estimate end-to-end, daily logs (vocabulary, duplicates, note length, date params, range limits, future dates, privacy between users), profile validation, reminders (formats, 20-item cap → 409, cross-user) |
| `identity.e2e-spec.ts` | 36 | **Sweep: every non-public documented route → 401 without credentials**, bad credentials (bearer, anonymous, scheme), sign-up/in via bearer and cookie, wrong password, short password, duplicate email, self-escalation at sign-up and via `update-user` blocked, sign-out revokes, inactive account, no password hashes in responses, **8 disabled Better Auth endpoints → 404**, anonymous sessions (hash-only storage, validation, expiry, retention refresh, user-only routes 403, delete cascade), linking (moves data, retires secret, audits, 409 when account has data, 404/400 secrets, user required) |
| `content-admin.e2e-spec.ts` | 29 | Staff gate for users/anonymous, **2FA required**, role matrix, full article workflow, changes requested, **no self-review**, versioning archives the previous version, one working copy, archive unpublishes, draft validation incl. https-only references and nested error paths, audit trail per transition, premium locking for visitor/anonymous/free user, unlock by active subscription and re-lock on expiry, invalid credentials on public route → 401, readiness tasks (reviewer-only publish, locked premium, consent, private progress, `PREMIUM_REQUIRED`, unpublished → 404, edit returns to draft, duplicate key 409), user admin (no health data, role change revokes sessions and audits, no self-change, validation) |
| `http-contract.e2e-spec.ts` | 29 | Response contracts, HEAD, request ids, malformed/oversized/charset/encoding bodies, CORS, no `X-Powered-By`, **every registered route documented**, security schemes, **served spec equals committed `docs/api/openapi.json`**, no secrets in spec |
| `app.e2e-spec.ts` | 7 | Original foundation tests and DB constraints |
| `privacy.e2e-spec.ts` | 7 | Export contents (own data only, headers, job record), anonymous export, confirmation phrase, **deletion removes all rows and sessions** while job and audit rows survive, linked anonymous sessions removed, staff deletion 409, **no health values in audit metadata** |
| `rate-limit.e2e-spec.ts` | 4 | Global 120/min → 429, anonymous creation 10/h, Better Auth sign-in limiting, health never throttled |
| `database-down.e2e-spec.ts` | 4 | Real refused connection → readiness 503 within timeout |
| `production-mode.e2e-spec.ts` | 4 | Docs hidden in production |

### Security checklist

| Check | Status |
|---|---|
| Auth bypass / missing auth on any route | Covered by the default-deny sweep over the whole spec |
| Access to another person's records | Cycles, daily logs, reminders, task progress, export: 404 / not included |
| Privilege escalation | Sign-up and `update-user` can't set role/status/2FA; role change admin-only, not self; staff need 2FA |
| Injection / unsafe input | Strict DTOs (unknown fields rejected), enums, regex-validated slugs/keys/times/RRULEs, https-only references, parameterised queries (Prisma) |
| Sensitive data leaks | DB constraint messages (contain dates) never returned; audit metadata has no health values; export is `no-store`; no hashes in auth responses; no secrets in spec |
| Rate limiting / oversized requests | 429 paths and 413 covered |
| File uploads | N/A, none exist |

## Not covered (needs work outside this codebase or not implemented)

- Two-factor enrolment end to end (TOTP code generation in tests). The plugin is enabled, and
  the guard's 2FA enforcement is tested via the `twoFactorEnabled` flag.
- Store webhooks and receipt verification (not implemented; see `API_INVENTORY.md`).
- Load tests for the new endpoints: `tests/load/api-load.js` still exercises only health. See
  next steps in the final summary.
