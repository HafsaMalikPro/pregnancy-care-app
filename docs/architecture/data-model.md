# Data model

Source of truth: `apps/api/prisma/schema.prisma` plus hand-written SQL in
`apps/api/prisma/migrations/*/migration.sql`.

## Tables

| Table                  | Purpose                                         | Owner                   |
| ---------------------- | ----------------------------------------------- | ----------------------- |
| users                  | Registered identities, lifecycle, staff role    | —                       |
| auth_sessions          | Better Auth sessions                            | user                    |
| auth_accounts          | Better Auth credentials / OAuth links           | user                    |
| auth_verifications     | Email verification and reset tokens             | —                       |
| two_factors            | Better Auth TOTP secret + backup codes (staff)  | user                    |
| anonymous_sessions     | Installation-scoped anonymous use (hashed key)  | —                       |
| profiles               | Time zone, locale, planning horizon             | user or anonymous       |
| pregnancies            | Due date, dating method, details, restrictions, outcome | user or anonymous |
| pregnancy_datings      | Append-only due-date history and its inputs     | pregnancy               |
| cycles                 | Period history (DATE start/end)                 | user or anonymous       |
| daily_logs             | Optional symptoms (fixed vocabulary) and notes  | user or anonymous       |
| readiness_tasks        | Reviewed preparation task catalog               | content                 |
| user_task_progress     | Task completion and private notes               | user or anonymous       |
| articles               | Versioned, localized educational content        | content                 |
| content_reviews        | Reviewer, credentials, sources, decision, dates | content                 |
| consent_records        | Append-only consent history per purpose         | user or anonymous       |
| reminders              | Local-notification preferences                  | user or anonymous       |
| subscriptions          | Verified entitlements per store/web             | user                    |
| subscription_events    | Webhook idempotency (provider, event id)        | —                       |
| privacy_jobs           | Export and deletion job status                  | user (nullable)         |
| audit_events           | Minimal security audit trail                    | —                       |

## Rules enforced in the database

- **Single owner:** `num_nonnulls(user_id, anonymous_session_id) = 1` on every user-owned table.
- **Valid periods:** `period_end >= period_start` and at most 30 days long.
- **No overlapping periods** for the same owner (GiST exclusion on a daterange; an open-ended
  period counts as its start day). The API should map this violation to `409 CONFLICT`.
  Corrections are edits of the existing row, not new rows.
- **One published version** per article slug and locale (partial unique index). Week guides are
  articles of kind `week_guide` with slug `pregnancy-week-<1-42>` and structured `sections`.
- **One active pregnancy** per owner (partial unique indexes); an ended pregnancy must have an
  outcome and end date.
- **Webhook idempotency:** unique `(provider, provider_event_id)`.
- Reminder `local_time` must be `HH:MM`.

## Deletion

- Deleting a user or anonymous session cascades to all of its health records, consent history,
  reminders and subscriptions.
- `privacy_jobs.user_id` is set to NULL so the job record outlives the deletion it performed.
- `content_reviews.reviewer_id` is `RESTRICT`: a reviewer account must be reassigned or
  anonymised before deletion, so published content keeps its review trail.
- Still to define (Day 9): backup retention window, and propagation to email, billing and
  monitoring providers.

## Never

- Store cycle dates, symptoms or notes in `audit_events.metadata` or analytics.
- Enable Prisma query logging in any environment (parameters contain health data).
