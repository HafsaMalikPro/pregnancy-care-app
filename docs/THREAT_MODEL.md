# Threat model (API)

Scope: the NestJS API in `apps/api`, its PostgreSQL database, and the Better Auth endpoints it
mounts at `/v1/auth`. The website and future mobile apps are clients. Controls and the tests
that prove them are listed in `docs/SECURITY_CHECKLIST.md`.

Written 2026-11-08, before the production-hardening phases. Revisit when a new kind of data,
actor or integration is added.

## Assets

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| Health data: pregnancy dating, journal (symptoms, mood, notes, questions), symptom checks, kick counts, contractions, weight, appointments, birth preferences | owner tables (`daily_logs`, `pregnancies`, `appointments`, …) | Special-category data (GDPR art. 9). Disclosure harms the person; tampering could mislead them about their own pregnancy |
| Credentials | `auth_accounts.password` (scrypt), `two_factor.secret` and backup codes (AEAD-encrypted), session tokens (`auth_sessions`), reset/verification tokens (`auth_verifications`, hashed) | Account takeover gives full read/write access to health data and, for staff, to clinical content |
| Guest secrets | client only; `anonymous_sessions.credential_hash` (SHA-256 of a 256-bit secret) | Bearer credential for a guest's health data |
| Exports | generated on request, streamed once, never stored | Contain all of an owner's health data in one file |
| Clinical content and its review trail | `articles`, `content_reviews` | Tampered guidance (warning signs, nutrition, triage rules) can cause harm at scale |
| Audit log | `audit_events` | Evidence of staff actions; must not be editable by the actors it records |
| Secrets and keys | environment / secret manager (`BETTER_AUTH_SECRET`, `FIELD_ENCRYPTION_KEYS`, `RESEND_API_KEY`) | Compromise defeats session integrity and field encryption |

## Actors

| Actor | Can legitimately | Main threats from / to them |
| --- | --- | --- |
| Anonymous visitor | Read published content, run the symptom checker | Enumeration, scraping, brute force, abuse of public writes |
| Guest (anonymous session) | Own health data under a secret held in the browser | Secret theft (XSS, shared device); exhaustion by mass guest creation |
| User | Own health data, export, delete | Victim of takeover, CSRF, IDOR; may try to read others' data |
| Support | Look up accounts (no health data) | Curious insider reading health data |
| Content editor | Draft content | Publishing unreviewed clinical content |
| Clinical reviewer | Review and publish | Approving own work (separation of duties) |
| Administrator | Manage staff roles, everything an editor/reviewer can | Self-escalation, covering tracks in the audit log |
| Network attacker | Observe or modify traffic | Session theft over http, downgrade, mixed content |
| Attacker with a stolen session | Whatever the session allows | Long-lived reuse, privilege use, data export |
| Malicious insider (staff or operator with DB access) | Varies | Bulk read of health data, audit tampering, key misuse |

## Trust boundaries

1. **Internet → TLS terminator / CDN → API.** Everything from the client is untrusted:
   bodies, headers (including `X-Forwarded-For`), cookies, path parameters. Client IP is only
   trusted from configured proxy hops (`TRUST_PROXY`).
2. **Browser origin → API.** Credentialed CORS only for the exact origins in `CORS_ORIGINS`.
   Cookie-authenticated state changes must come from those origins (CSRF).
3. **Unauthenticated → authenticated → staff.** The global guard denies by default.
   `@Public()` is an explicit, reviewed exception. Staff routes need a role and 2FA.
4. **Owner A → owner B.** Every owner query is scoped by the caller's owner id. Another owner's
   id is indistinguishable from a missing one (404).
5. **API → PostgreSQL.** The API connects with an application role. The audit table refuses
   UPDATE and DELETE at the database level, and sensitive free text is encrypted before it
   reaches the database.
6. **API → email provider (Resend).** Only the recipient, subject and body leave. Links carry
   single-use tokens; no health data is put in email.
7. **Build → runtime.** Dependencies and container images are pinned and scanned; secrets
   come from the environment at runtime, never from the image or the repository.

## Main threats and the controls against them

| Threat (STRIDE) | Controls |
| --- | --- |
| Credential stuffing / brute force (S) | Per-IP and per-account sign-in limits, progressive lockout, breached-password rejection, generic errors, constant-time unknown-email path, 2FA for staff |
| Session theft and replay (S) | HttpOnly, Secure, SameSite cookies; 30-day absolute and 7-day idle lifetime; rotation on sign-in, role change and password change; no tokens in logs |
| CSRF (T) | SameSite=Lax plus an Origin/Referer allow-list on every cookie-authenticated state-changing request |
| IDOR / horizontal escalation (I, E) | Owner scoping on every query; IDOR tests for every owner resource |
| Vertical escalation (E) | Default-deny guard, role matrix tests, staff 2FA, no self role change, separation of duties for publishing |
| Injection and stored XSS via content (T) | DTO/zod validation with length and size limits, parameterised SQL only, markdown/link sanitising (no HTML, no `javascript:`/`data:` URLs) |
| Data disclosure in responses, logs and errors (I) | Response field deny-list test, redacted structured logs, generic error envelope, no stack traces |
| Data at rest disclosure (I) | Encrypted volumes and backups (deployment), AES-256-GCM field encryption for free-text health notes with key ids |
| Audit tampering (R) | Append-only trigger on `audit_events`; anonymisation is the only allowed change |
| Resource exhaustion (D) | Global and per-route rate limits, body size limit, request timeout, statement timeout, per-owner record caps, guest-creation limits |
| Supply chain (T) | Lock files, dependency audit, secret scanning, pinned base images, static analysis in CI |

## Out of scope / assumptions

- Hosting provider, TLS termination, WAF and secret manager are chosen at deployment; this
  repository documents requirements (`docs/DEPLOYMENT_SECURITY.md`) but cannot enforce them.
- Client-side threats (XSS in the website, device theft) are handled in the frontend repo; the
  API limits their impact (HttpOnly cookies, short challenge cookies, export rate limits).
- An independent penetration test is required before real patient data is handled.
