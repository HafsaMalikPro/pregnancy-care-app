# Deployment Recommendations

Date: 2026-10-18. These are recommendations only. Nothing here has been provisioned, and no
deployment platform has been chosen (`infra/deployment/` is empty). They are provider-neutral;
pick the equivalents on whatever platform you adopt.

## 1. Topology

- Run at least **2 API instances** behind a load balancer or reverse proxy that terminates TLS.
  One process per vCPU (Node uses one core per process; measured at 107–111% CPU when saturated).
- The app is stateless and needs no sticky sessions.
- Run `prisma migrate deploy` as a one-off release step before new instances take traffic,
  never from each instance at boot.
- Never expose Swagger in production. It is already disabled when `NODE_ENV=production`. Run
  staging with `NODE_ENV=staging` if staging should serve docs.

## 2. Load balancer and health checks

| Check | Endpoint | Suggested settings |
|---|---|---|
| Liveness (restart on failure) | `GET /v1/health/live` | every 10 s, timeout 2 s, 3 failures |
| Readiness (remove from rotation) | `GET /v1/health` | every 5–10 s, timeout 3 s (readiness answers within 2 s), 2 failures; healthy after 2 successes |

- Set the Node server's `keepAliveTimeout` **above** the load balancer's idle timeout, or the
  LB can reuse a socket Node has just closed and return a 502. Node's default is 5 s, lower than
  many LB defaults. This needs a small change in `main.ts` once the LB is known.
- Configure `trust proxy` to match the proxy hops (see `SCALABILITY_REVIEW.md` §5). Without it,
  rate limiting puts all users in one bucket.
- Graceful deploys: on SIGTERM, fail readiness, wait one health-check interval, then close.
  Set the platform's termination grace period above that interval.
- Restrict `/v1/health` to the LB or internal network if the platform allows it (it costs a DB
  query). Keep `/v1/health/live` cheap and dependency-free.

## 3. Observability (current state → recommendation)

| Concern | Today | Recommendation |
|---|---|---|
| Request ids | ✅ `x-request-id` issued or accepted, returned on every response including parser errors (fixed in this audit) | Forward from the LB; include in every log line |
| Error logs | ✅ 5xx log line has only method, route pattern, error class and request id. Bodies are never logged | Keep. Add stack traces to a **private** error tracker with body/header scrubbing |
| Structured logs | ❌ Nest's default text logger, no access log | JSON logger (e.g. `nestjs-pino`) with redaction of `authorization`, `cookie` and all bodies; access log = method, route pattern (not raw URL), status, duration, request id |
| Metrics | ❌ none | HTTP duration histogram by route pattern and status; event-loop delay; pg pool `totalCount`/`idleCount`/`waitingCount`; process RSS/CPU |
| Error tracking | ❌ none | Sentry or similar, with `sendDefaultPii: false` and request bodies dropped in `beforeSend` |
| Alerts | ❌ none | 5xx rate > 1% for 5 min; p95 > 500 ms for 10 min; pool waiting > 0 sustained; readiness failures; DB connections > 80% of max |

**Never log** passwords, tokens, session cookies, request bodies, cycle dates, symptoms, notes,
or other pregnancy- or fertility-related details. This repeats the rule in the root README.
The existing code follows it. Prisma query logging is deliberately off.

## 4. Configuration

| Variable | Default | Production guidance |
|---|---|---|
| `NODE_ENV` | development | `production` (disables Swagger) |
| `PORT` | 4000 | Platform-provided |
| `DATABASE_URL` | — | From the secret store. Require TLS (`sslmode=require` or stricter) |
| `CORS_ORIGINS` | empty | Exact web and admin origins only |
| `DATABASE_POOL_MAX` | 10 | Keep instances × value + PgBouncer/admin headroom below `max_connections`. Raising it did **not** improve throughput in local tests |
| `DATABASE_POOL_TIMEOUT_MS` | 5000 | Keep below the LB/request timeout so requests fail fast instead of piling up |

Also set a Postgres `statement_timeout` on the application role (e.g. 5–10 s) so a runaway query
can't hold a pool connection indefinitely.

## 5. Load testing before launch

Re-run `tests/load` against **staging** (its own DB, synthetic data, written approval) once auth
and cycle endpoints exist. Add authenticated read/write scenarios for those endpoints to
`api-load.js`, exempt the load-generator IP from throttling, and sign off on the thresholds in
`LOAD_TEST_REPORT.md`. Never point load tests at production without explicit authorization.

## 6. Security baseline for the deployment

- TLS everywhere: client→LB, LB→API if crossing hosts, API→DB.
- Security headers (HSTS, `X-Content-Type-Options`, frame denial) at the LB or via `helmet`.
  This audit already removed `X-Powered-By`.
- Secrets only from the platform's secret store; `.env` files are for local development.
- Keep the CI gates already defined: format, lint, typecheck, unit, migration drift, e2e,
  `pnpm audit`, gitleaks.
