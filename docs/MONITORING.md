# Monitoring and alerting

## Request ids

Every response carries `x-request-id`: the caller's id when it is a well-formed 8–64
character token, otherwise a new UUID. Error bodies repeat it (`error.requestId`), log lines
include it, and security events store it. Give support the request id from an error, and it
leads to the matching log line and event.

## Security events

Written to `audit_events` with a `security.` action (`src/audit/security-events.service.ts`).
They are queryable with `GET /v1/admin/audit-events?action=…` (administrators) or by SQL on
a read replica. Emails and IPs are never stored: `accountRef` (`acct_…`) and `ipRef`
(`ip_…`) are keyed pseudonyms, the same for the same value. That shows patterns ("one IP
across 200 accounts") without storing who.

| Action | Written when | Metadata |
| --- | --- | --- |
| `security.sign_in_failed` | A wrong email/password combination | `accountRef`, `ipRef` |
| `security.sign_in_locked` | A failure starts an account or IP lock | `accountRef`, `ipRef`, `lockSeconds` |
| `security.two_factor_failed` | A wrong TOTP or backup code | `method` (`totp` or `backup_code`), `status`, `ipRef`; actor when known |
| `security.rate_limited` | Any 429 (throttler, Better Auth limiter, lockout); once per client and route per minute | `route`, `ipRef` |
| `security.staff_access_denied` | A staff route refuses the caller | `route`, `reason` (`role`, `two_factor_required`, `not_an_account`); actor |
| `security.csrf_rejected` | A cookie-authenticated write from a disallowed origin; once per client and route per minute | `route`, `ipRef` |

Other audited actions, all in `audit_events`: staff role changes (`user.staff_role_changed`),
the content workflow (`article.created`, `article.updated`, `article.submitted`,
`article.review.<decision>`, `article.published`, `article.archived`,
`readiness_task.published`), exports (`privacy.export`), account deletion
(`account.deleted`, under a pseudonym) and guest linking (`anonymous_session.linked`).

Each event is checked by `test/security/logging.e2e-spec.ts` and
`test/security/rate-limit-events.e2e-spec.ts`.

## Alerts

Route these to the on-call channel. The numbers are starting points; tune them after a few
weeks of real traffic.

| Severity | Condition | Why |
| --- | --- | --- |
| Page | More than 20 `security.sign_in_failed` for staff accounts in 10 minutes. Join `accountRef` against the refs of staff emails, computed with the same key | Targeted attack on privileged accounts |
| Page | Any `security.staff_access_denied` with `reason = two_factor_required` from an administrator outside a planned change | Staff account without 2FA, or tampering |
| Page | Any `user.staff_role_changed` outside working hours, or more than 3 in an hour | Privilege escalation |
| Page | Readiness (`/v1/health`) failing for 2 minutes | Database unreachable |
| Ticket | More than 200 `security.sign_in_failed` in 10 minutes overall, or more than 50 distinct `accountRef` from one `ipRef` | Credential stuffing |
| Ticket | More than 100 `security.sign_in_locked` in an hour | Lockout abuse (denial of service on accounts) |
| Ticket | More than 50 `security.csrf_rejected` in an hour | A page trying cross-site writes |
| Ticket | Sustained `security.rate_limited` on `/v1/me/export` or `/v1/me/deletion` | Abuse of expensive privacy endpoints |
| Ticket | 5xx rate above 1% for 5 minutes (from logs: `"level":"error"` with `ApiException`) | Regression or outage |
| Ticket | Any log line `Could not decrypt a value` (FieldDecryptionError) | Missing key after rotation, or tampering |

Example queries (SQL, read-only role):

```sql
-- Failed sign-ins per IP pseudonym in the last 10 minutes
SELECT metadata->>'ipRef' AS ip_ref, count(*) AS failures,
       count(DISTINCT metadata->>'accountRef') AS accounts
FROM audit_events
WHERE action = 'security.sign_in_failed' AND created_at > now() - interval '10 minutes'
GROUP BY 1 ORDER BY failures DESC LIMIT 20;

-- Staff-route denials today
SELECT created_at, actor_user_id, actor_role, metadata->>'route', metadata->>'reason'
FROM audit_events
WHERE action = 'security.staff_access_denied' AND created_at > date_trunc('day', now())
ORDER BY created_at DESC;
```

## Health endpoints

- `GET /v1/health/live`: `{"status":"ok"}` while the process runs.
- `GET /v1/health`: `{"status":"ok","database":"up"}`, or 503 when the database doesn't
  answer within 2 s.

Both are public. They expose no version, uptime, hostname or dependency detail.
