# Security penetration test report: Pregnancy Care API

| | |
| --- | --- |
| Date | 2026-11-08 |
| Target | NestJS API (`apps/api`), Better Auth under `/v1/auth`, PostgreSQL 17 |
| Code tested | Attack suite at commit `fa6d8f1`; browser tests at `1913bea` (identical except for the password minimum, see F-04) |
| Tester | Claude (automated, authorised by the owner) |
| Type | Authorised, local-only grey-box test: source available, attacks run against the running app |

> **This is not a full penetration test.** Automated tests prove that specific attacks fail
> or succeed. They cannot prove that no other attack works. An independent manual penetration
> test is still required before real patient data is handled (see section 18).

---

## 1. Executive summary

43 controlled attacks across 9 classes were run against the API, plus browser tests and a
negative control. **40 were blocked; 3 succeeded.** Two further weaknesses were confirmed
outside the attack suite: one in the browser run, and one introduced by an owner decision
during this test.

**No attack reached another person's health data, bypassed login, or escalated a normal user
to staff or admin.**

- Every IDOR attempt (another user, another guest, 200 guessed ids) returned 404.
- Every admin operation (24) refused a normal user.
- Every forged, expired, tampered or replayed session token was refused.
- SQL-, NoSQL- and HTML-injection payloads were stored as plain data or refused.
- Cross-site requests with a stolen cookie context were refused.

Confirmed weaknesses:

| ID | Severity | Finding |
| --- | --- | --- |
| F-01 | Medium | A TOTP code can be **replayed** in a second sign-in within its 30-second window |
| F-02 | Medium | A **deeply nested JSON body** (5,000 levels) causes a stack overflow and a 500 on validated routes |
| F-03 | Low | **Sign-up reveals** whether an email address already has an account (422 "User already exists") |
| F-04 | Low | **Breached passwords of 8–11 characters are accepted** (for example `Pass@123`) after the owner lowered the minimum to 8 |
| F-05 | Low | A **CORS preflight** from a refused origin still carries `Access-Control-Allow-Credentials: true` |

Fix first: F-02 (an unauthenticated resource-consumption risk on the same pipe as every write),
then F-01 (2FA replay on staff accounts), then F-04/F-03 (credential attacks).

## 2. Testing scope

- **In scope:** the API at `http://localhost:4000` and in-process instances on loopback
  ports; the website at `http://localhost:3000` (browser tests only); the disposable database
  `preconception_e2e`.
- **Scope guard:** `test/pentest/support/scope.ts` refuses any target other than localhost,
  127.0.0.1 or ::1, and any database not named `*_test`, `*_e2e` or `*_dev` on a local host. It
  is asserted at the start of every attack and has its own tests (16 cases, including
  `host.docker.internal`, private IPs and production-looking hosts, all refused).
- **Out of scope:** third-party hosts, production, real users, real email delivery, and
  denial of service.

## 3. Environment tested

| Item | Value |
| --- | --- |
| Machine | Apple Silicon laptop, macOS, Node 22.17.1, pnpm 11.17.0 |
| Database | PostgreSQL 17 in Docker (`preconception-db`, port 5434). Database `preconception_e2e`, reset to empty at the start of this pass. Verified with `pg_stat_activity` that the API used only this database |
| API mode | Development for the browser and attack runs (`NODE_ENV=test` in-process); production mode for header, docs and error tests (HDR-*, DIS-*) |
| Email | `memory` or `none` provider: no email left the machine |
| Secrets | Generated locally, never printed; test fixtures only |

## 4. Tools and methods

- Vitest + supertest attack suite (`apps/api/test/pentest`, 43 attacks, `pnpm --filter api test:pentest`).
  Every attack records the expected outcome, the observed outcome and redacted evidence.
- Existing security suites (`apps/api/test/security`, `test/security.e2e-spec.ts`) and the
  functional flows (`test/e2e-flow`, 21 tests), all passing at the time of the pass.
- Google Chrome driven by Playwright (visible window) against the website and API.
- `pnpm audit --prod`: 0 advisories at any severity.
- Negative control: the CSRF check was disabled on a throwaway branch (section 19.3).
- **Not run:** the OWASP ZAP passive scan (the owner stopped it), and semgrep/CodeQL.

## 5. Attack surface inventory

| Surface | Count | Notes |
| --- | ---: | --- |
| Documented operations (OpenAPI) | 145 | 117 paths |
| Nest operations | 122 | Default-deny guard |
| — reachable without credentials | 17 | Reviewed allow-list: health (2), guest creation, published content reads (12), symptom-check vocabulary and triage. Verified at runtime: every other Nest route answers 401 without credentials |
| — staff (`/v1/admin`) | 24 | Role and 2FA required |
| Better Auth operations | 23 | Undocumented Better Auth routes answer 404/405 (tested) |
| File upload | 0 | None exists |
| External integrations | Resend (email, off in tests); Have I Been Pwned (opt-in, off) | |
| Controls | Global guard, per-route rate limits, sign-in lockout, CSRF origin check, Helmet headers, CORS allow-list, global validation pipe, field encryption, redacting logger, append-only audit trigger | |

## 6. Authentication findings

| Attack | Result |
| --- | --- |
| AUTH-01 brute force (50 guesses) | **Blocked.** Locked at attempt 6 (429). The right password is refused while locked |
| AUTH-02 enumeration via sign-in and reset | **Blocked.** Identical bodies; median timing gap 25 ms |
| AUTH-03 session reuse after sign-out | **Blocked.** Bearer and cookie both 401 |
| AUTH-04 session fixation | **Blocked.** New token issued; the planted value is 401 |
| AUTH-05 forged, tampered, unsigned and oversized tokens | **Blocked.** All 401 |
| AUTH-06 guest secret tampering | **Blocked.** All 401, generic body |
| Browser: sign-up with `Pass@123` under the 12-character rule | **Refused** (client and API, 400 `PASSWORD_TOO_SHORT`) |
| Browser: duplicate sign-up through the API | **Weakness F-03:** 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` |
| Browser: sign-up with `Pass@123` under the 8-character rule | **Weakness F-04:** accepted (200) though it is a known breached password |

## 7. Authorization and IDOR findings

| Attack | Result |
| --- | --- |
| AUTHZ-01 user B reads, updates and deletes user A's appointments, reminders, shopping items, cycles and journal | **Blocked.** All 404; A's data unchanged |
| AUTHZ-02 guest A uses guest B's ids | **Blocked.** 404 |
| AUTHZ-03 200 guessed ids next to a real UUIDv7 | **Blocked.** 0 hits |
| AUTHZ-04 normal user on all 24 admin operations | **Blocked.** All 403 |
| AUTHZ-05 editor publishes unreviewed content or a task; reviewer manages users or roles; support reads the audit log | **Blocked.** 409/403; nothing published |
| AUTHZ-06 mass assignment (`staffRole`, `status`, `userId`, `ownerId`) | **Blocked.** 400; stored role unchanged |
| AUTHZ-07 administrator changes their own role | **Blocked.** 403 |
| BIZ-04 re-date or end someone else's pregnancy | **Blocked.** 404; owner unchanged |

## 8. Injection testing results

| Attack | Result |
| --- | --- |
| INJ-01 SQL-looking text in journal and shopping fields | **Blocked.** Stored verbatim (shopping names are lower-cased by design) |
| INJ-02 SQL-looking query filters and slugs (36 requests) | **Blocked.** 400/404, no error text |
| INJ-03 NoSQL operator objects | **Blocked.** 400 |
| INJ-04 path traversal (24 requests) | **Blocked.** 400/404 |
| INJ-05 oversized and deeply nested JSON | 200 kB → 413 (blocked). **5,000-deep → 500 (F-02).** The server stayed up |
| INJ-06 wrong content type, malformed JSON | **Blocked.** 415 / generic 400 |
| XSS-01/02 script, `onerror`, `javascript:`, iframe, `data:` in bodies, titles and recipe sections | **Blocked.** Refused at write (400), so nothing can be published |

## 9. Rate limiting results (bounded, local)

| Attack | Result |
| --- | --- |
| RATE-01 15 guest creations | 10 × 201, then 429 |
| RATE-02 credential stuffing with rotating `X-Forwarded-For` | 5 × 401, then 429: spoofed IPs do not reset the limit |
| RATE-03 repeated export and deletion | 3 allowed, then 429 each |
| RATE-04 70 journal writes | 60 × 200, 10 × 429, no 5xx, healthy afterwards |
| Pagination above 100 | 400 on every list endpoint (security suite) |

No production capacity is claimed from these local runs.

## 10. Database security results

- Raw SQL only through parameterised tagged templates (test-enforced). SQL payloads were
  stored as data.
- Passwords: scrypt N=2^15, r=8, p=3 with a constant-time comparison.
- Field encryption (AES-256-GCM) for journal notes and questions, checklist notes, appointment
  notes and questions, and birth-plan notes: the raw columns hold ciphertext (security suite).
- `audit_events` is append-only (database trigger). UPDATE, DELETE and TRUNCATE fail for the
  app role.
- Statement timeout: a 5 s query is cancelled under a 500 ms limit.
- **Potential:** Better Auth stores session tokens unhashed (P-01).

## 11. Healthcare data privacy results

- No private record was reachable without credentials (section 5), or by another user, guest
  or staff role.
- Support staff lookups return no health data (security suite).
- Health writes need `health_data_processing` consent (403 `CONSENT_REQUIRED`, functional
  flows).
- Logs: a failed sign-in and a forced 500 logged no email, password, note or token (security
  suite).
- Export is owner-only (`/v1/me/export`), sent as an attachment with no-store.
- Deletion requires the exact confirmation string and leaves no row referencing the person;
  audit references are anonymised.
- Guest linking into an account with health data is refused (409) and nothing moves (BIZ-03).

## 12. Admin and clinical workflow results

Draft → submit → review by a different person → publish works. Unreviewed publishing is
refused (409). An author cannot review their own work (403). Editors cannot publish readiness
tasks (403). Drafts are never served publicly (404). Unsafe markup is refused before review
(XSS-01/02).

## 13. API security results (OWASP API Top 10)

| Risk | Result |
| --- | --- |
| API1 BOLA | No failures (AUTHZ-01..03, BIZ-04) |
| API2 Broken authentication | 2FA replay (F-01) and sign-up enumeration (F-03); everything else held |
| API3 Property-level authorization / excessive exposure | No credential or hash fields in responses (security suite); mass assignment refused |
| API4 Unrestricted resource consumption | Limits held; **deep nesting → 500 (F-02)** |
| API5 BFLA | No failures (AUTHZ-04/05/07, 2FA-04) |
| API8 Security misconfiguration | Headers, docs off in production and generic errors held; **CORS credentials header (F-05)** |

## 14. Security configuration findings

- **Production mode** (HDR-*, DIS-*):
  - HSTS (1 year, subdomains), `nosniff`, `X-Frame-Options: DENY`, `no-referrer`;
  - CSP `default-src 'none'` on every response, including the Better Auth error redirect;
  - no `X-Powered-By` or `Server` header;
  - `/docs`, `/docs-yaml` and the auth schema return 404;
  - a forced 500 returns a generic message, and the health endpoints return status only.
- Session cookies: `HttpOnly` and `SameSite=Lax`, plus `Secure` with the `__Secure-` prefix in
  production (tested). In development they are not `Secure` because the site is served over
  http (expected).
- The boot guard refuses unsafe production settings (18 cases tested).
- Dependencies: `pnpm audit --prod` reports 0. All dependencies: 1 moderate (development only).

## 15. End-to-end attack scenarios

| Scenario | Starting privilege | Endpoints | Outcome | Control |
| --- | --- | --- | --- | --- |
| A Unauthorized visitor | none | All 105 non-public Nest operations | **Blocked** (401 everywhere) | Default-deny guard |
| B User attacks user | user | appointments, reminders, shopping, cycles, journal, pregnancy dating/end | **Blocked** (404) | Owner scoping |
| C Guest abuse | guest | `/v1/me`, records, link | **Blocked** (401/404/409) | Hashed secret, owner scoping, link checks |
| D Privilege escalation | user, editor, reviewer, support, admin | 24 admin operations, role change | **Blocked** (403/409) | Role guard, staff 2FA, self-change check |
| E Authentication abuse | none / password holder | sign-in, 2FA | Brute force and stuffing **blocked**; **TOTP replay succeeded (F-01)** | Lockout and limits; no replay protection |
| F Malicious input | user | journal, shopping, filters, paths, bodies | **Blocked**, except **deep nesting → 500 (F-02)** | Validation, parameterised SQL |
| G Clinical content abuse | editor, reviewer | publish, review, tasks, drafts | **Blocked** | Separation of duties, content checks |
| H Resource abuse | none / user | guest creation, sign-in, export, deletion, journal, races | **Blocked**; races consistent (1 pregnancy; shopping de-duplicated) | Rate limits, unique constraints |

## 16. Confirmed vulnerabilities

### F-01: TOTP code can be replayed within its window (Medium)

- **Endpoint:** `POST /v1/auth/two-factor/verify-totp`
- **Preconditions:** the attacker has the password and a code the victim just used (shoulder
  surfing, a phishing proxy, malware), within about 30–60 s.
- **Reproduce:** sign in and verify with code C (200). Start a second sign-in with the
  password and verify again with the same C.
- **Actual:** 200, so a second session is created.
- **Expected:** the second use of the same time-step is refused.
- **Evidence:** 2FA-01 "first use → 200; same code in a new sign-in attempt → 200".
- **Impact:** weakens 2FA for staff accounts, which control clinical content.
- **Root cause:** Better Auth 1.7.10's TOTP verify (`plugins/two-factor/totp`) keeps no record
  of the last used step.
- **Remediation:** a before-hook that stores the last accepted TOTP step per user and refuses
  a step that isn't newer; or upgrade if Better Auth adds replay protection.
- **Regression test:** 2FA-01 (fails today).

### F-02: Deeply nested JSON triggers a stack overflow (500) (Medium)

- **Endpoints:** demonstrated on `POST /v1/shopping-list` and `POST /v1/me/consents`. The same
  global `ValidationPipe` runs on every route with a validated body, including the public
  `POST /v1/anonymous-sessions` and `POST /v1/symptom-checks`. That those two are reachable
  without credentials is inferred from the code, not separately tested (P-07).
- **Reproduce:** send `{"a":{"a":…}}` nested 5,000 levels (about 35 kB, under the 100 kB limit).
- **Actual:** 500 `INTERNAL_ERROR`, with `RangeError` in the log; the server stays up.
- **Expected:** 400.
- **Root cause:** `class-transformer` `plainToInstance` recursion. The global pipe in
  `src/common/validation.ts` uses `transform: true` and recurses into unknown nested
  properties before validation can reject them (reproduced in isolation).
- **Impact:** each request burns a deep recursion; repeated requests consume CPU, and a 500
  is logged per request. No data exposure.
- **Remediation:** reject bodies nested deeper than about 32 levels before Nest's pipes (a
  middleware or a JSON reviver depth check).
- **Regression test:** INJ-05 (fails today).

### F-03: Sign-up reveals existing accounts (Low)

- **Endpoint:** `POST /v1/auth/sign-up/email`
- **Reproduce:** sign up with an email that already has an account.
- **Actual:** 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` ("User already exists. Use another
  email."), observed in the Chrome run.
- **Expected:** the same response whether or not the address is registered, for example
  "check your email to continue", with a notice emailed to the existing owner.
- **Mitigation in place:** 10 sign-ups per hour per IP.
- **Impact:** an attacker can confirm that a person uses a pregnancy app, which is itself
  sensitive, and target credential attacks.
- **Remediation:** an after-hook mapping this error to a generic success response, plus an
  "account exists" email. Needs the email provider in production.
- **Regression test:** none yet (AUTH-02 covers sign-in and reset only).

### F-04: Breached 8–11 character passwords accepted (Low, owner decision)

- **Endpoint:** sign-up, change and reset password.
- **Context:** during this test the owner lowered the minimum from 12 to 8 characters and
  chose to keep the breached list at 12+ characters (commit `1913bea`).
- **Evidence:** `Pass@123` (entry #21,622 in the NCSC breached list) was accepted at sign-up
  (200) and signs in, in the Chrome run.
- **Impact:** credential stuffing with common passwords becomes more likely to succeed.
  Account lockout (5 failures) and the per-IP limits reduce, but don't remove, the risk.
- **Remediation:** regenerate the bundled list for 8+ characters, or enable
  `PASSWORD_BREACH_CHECK=hibp`.

### F-05: CORS preflight returns Allow-Credentials for refused origins (Low)

- **Endpoint:** any `OPTIONS` preflight.
- **Evidence:** CORS-02 "status 204; ACAO=none; ACAC=true".
- **Impact:** none practical: without `Access-Control-Allow-Origin`, browsers block the
  response. Hardening only.
- **Root cause:** the `cors` package sets the credentials header unconditionally when
  `credentials: true` (`src/setup-app.ts`).
- **Remediation:** an origin callback that omits credentials for refused origins, or strip
  the header in a small middleware.

## 17. Potential vulnerabilities (not demonstrated)

| ID | Severity if real | Risk |
| --- | --- | --- |
| P-01 | Medium | Better Auth stores session tokens unhashed in `auth_sessions`. Anyone with database read access could use them. Not exploitable through the API |
| P-02 | Low | 2FA backup codes are stored encrypted (XChaCha20-Poly1305), not hashed. A leaked `BETTER_AUTH_SECRET` plus a database copy reveals them |
| P-03 | Low | Cookies use `__Secure-`, not `__Host-`, so a compromised sibling subdomain could set cookies. Depends on the deployment domains |
| P-04 | Info | `TRUST_PROXY` must match the real proxy chain in deployment. Too broad lets clients spoof IPs (the default `false` is safe) |
| P-05 | Info | Under heavy local parallel load (about 30 app instances against one Postgres limited to 100 connections), readiness checks timed out and pool connections failed with 500s. An availability consideration for pool sizing, not a vulnerability |
| P-07 | Medium | F-02 on public routes without credentials (inferred, not separately run) |

## 18. Blocked and untested areas

- **OWASP ZAP passive scan:** not run (the owner stopped it).
- **semgrep / CodeQL static analysis:** not run.
- **Real deployment:** TLS, cookie domains, reverse proxy, WAF, secret manager, backups.
- **Real email** (Resend) flows end to end: only the in-memory provider was used.
- **2FA with a real authenticator app** (codes were generated in the test).
- **Frontend XSS:** beyond the API's refusal of unsafe content.
- **Mobile clients.**
- **Load and capacity:** only bounded tests.
- **Clinical correctness of content:** not a security test.
- **A manual penetration test** should cover business-logic chains, session handling across
  real domains, the website, infrastructure, and social-engineering paths.

## 19. Evidence and safe reproduction

1. **Attack suite:** `pnpm --filter api test:pentest` (needs `TEST_DATABASE_URL` pointing at a
   `*_e2e` database). Results, redacted, are written to `apps/api/coverage/pentest/results.jsonl`.
2. **Browser:** a Playwright script drove Chrome on `http://localhost:3000`.
   - Under the 12-character rule: sign-up → "Use at least 12 characters", and the API returned
     400 `PASSWORD_TOO_SHORT`; sign-in → "Invalid email or password" (401).
   - After the change to 8: sign-up 200 → onboarding; sign-in 200 → onboarding; duplicate
     sign-up through the API → 422 (F-03).
3. **Negative control:** with the CSRF check disabled on a throwaway branch, CSRF-01 failed.
   Cross-site requests then succeeded, including a forged account deletion (204). Back on
   `main` it passes, and the branch was deleted.
4. **Test data:** test accounts (including `testdev@gmail.com`) and records exist only in
   `preconception_e2e`. Nothing was deleted, as required. To clean up, drop and recreate that
   disposable database (`DROP DATABASE preconception_e2e WITH (FORCE)`), then run
   `prisma migrate deploy`.

## 20. Severity distribution

| Severity | Confirmed findings | Potential findings |
| --- | ---: | ---: |
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 2 | 2 |
| Low | 3 | 2 |
| Informational | 0 | 2 |

| Metric | Value |
| --- | ---: |
| Total endpoints inspected | 145 operations (117 paths) |
| Endpoints tested | 145 (every Nest operation for auth enforcement; every admin operation for role enforcement; every documented auth operation for serving; targeted attacks on 30+ endpoints) |
| Endpoints passed | 141 |
| Endpoints failed | 4 named (`verify-totp`, `sign-up/email`, `POST /shopping-list` and `POST /me/consents` for deep nesting), plus two class-wide issues: deep nesting on all validated-body routes, and the CORS preflight header |
| Endpoints not tested | 0 for authentication enforcement; behavioural attacks did not cover every operation |
| Attack scenarios attempted | 8 (A–H), 43 automated attacks, 4 browser runs, 1 negative control |
| Attacks blocked | 40 of 43 |
| Confirmed successful attacks | 3 automated (2FA-01, INJ-05, CORS-02) + 2 from the browser and policy runs (F-03, F-04) |

## 21. Prioritised remediation

1. **F-02:** a depth limit on JSON bodies before validation (small change; protects every
   write route, including public ones).
2. **F-01:** TOTP replay protection (last-used step per user).
3. **F-04:** extend the breached-password check to 8+ characters, or enable HIBP.
4. **F-03:** a generic sign-up response for existing emails (needs the email flow).
5. **F-05:** drop Allow-Credentials for refused origins.
6. **P-01 to P-03:** track Better Auth support for hashed session tokens and `__Host-`
   cookies; consider hashed backup codes.
7. **Before real patient data:** an independent manual penetration test, the ZAP scan, static
   analysis, and a deployment review (TLS, domains, proxy, backups).
