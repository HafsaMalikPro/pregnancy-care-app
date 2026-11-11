# Load tests (k6)

Two scripts:

- `journeys.js` (with `run-journeys.sh`): what the website does. Anonymous readers (week
  guides, article pages), signed-in members (dashboard bundle, journal and checklist writes)
  and password sign-ins. See the header of `journeys.js` for the traffic model and thresholds.
  Needs seeded content on a disposable database:

  ```sh
  createdb … preconception_load && DATABASE_URL=… pnpm --filter @preconception/api exec prisma migrate deploy
  (cd apps/api && DATABASE_URL=… pnpm dlx tsx prisma/seed.ts)
  pnpm build && DATABASE_URL=… tests/load/run-journeys.sh mylabel
  ```

- `api-load.js` (with `run-local.sh`): health endpoints only, for framework overhead at up to
  1,000 virtual users. The rest of this file describes it.

**Never run these against production.** `run-local.sh` refuses a non-local `DATABASE_URL`.

## Files

| File | Purpose |
|---|---|
| `api-load.js` | k6 script. `SCENARIO` = `smoke`, `sustained`, `spike`, `soak`, `stress` |
| `run-local.sh` | Starts the built API in production mode on the test DB, samples resources, runs k6, stops the API |
| `monitor.sh` | Samples API CPU %, RSS and Postgres connections (total/active) to CSV every 2 s |
| `results/` | JSON summaries, resource CSVs and server logs of the runs in `docs/LOAD_TEST_REPORT.md` |

## Workload model

One VU = one simulated client. Each iteration sends one request, then waits 1–3 s
(uniform, mean 2 s) of think time. 1,000 VUs therefore offer about 1000 / (2 s + latency)
≈ 500 req/s, not 1,000 req/s.

| Request | Share | Why |
|---|---|---|
| `GET /v1/health` | 50% | One DB round-trip; stands in for DB-backed reads |
| `GET /v1/health/live` | 40% | Pure framework/middleware overhead |
| `GET /v1/load-test-unknown-route` | 10% | Error path through the exception filter (expected 404) |

| Scenario | Shape |
|---|---|
| `smoke` | 5 VUs, 30 s |
| `sustained` | 0→500 (1 m) → 1000 (1 m), hold 5 m, ramp down 30 s |
| `spike` | 100 VUs 30 s → **1000 in 10 s**, hold 1 m → back to 100, observe 1 m recovery |
| `soak` | 1000 VUs for `SOAK_DURATION` (default 10 m) |
| `stress` | 1000 VUs, run with `THINK_MIN=0 THINK_MAX=0` → closed-loop capacity probe |

Thresholds (proposed targets): `http_req_failed < 1%`, no unexpected statuses, p95 < 500 ms per
endpoint.

## Run locally

```sh
brew install k6                          # or see https://grafana.com/docs/k6/latest/set-up/install-k6/
pnpm db:up && pnpm build
# one-time test DB (see docs/API_TEST_REPORT.md)
tests/load/run-local.sh smoke check
tests/load/run-local.sh sustained mylabel
THINK_MIN=0 THINK_MAX=0 tests/load/run-local.sh stress mylabel
DATABASE_POOL_MAX=20 tests/load/run-local.sh stress pool20
```

A laptop running k6, the API, Docker Postgres and desktop apps together gives noisy tail
latencies (see the report). Use it for relative before/after comparisons, not for capacity
sign-off.

## Run against staging

Run k6 from a separate machine in the same region as the staging load balancer:

```sh
k6 run -e SCENARIO=sustained -e BASE_URL=https://staging-api.example.internal tests/load/api-load.js
```

Before running:
1. Get written approval and tell whoever owns the staging infrastructure.
2. Staging must use its own database with synthetic data only.
3. Exempt the load generator's IP from the per-IP throttle, or the run measures the
   rate limiter: 1,000 VUs from one IP far exceed 120 req/min. Health routes are already exempt.
4. Collect server-side CPU, memory, DB connections and query latency from the platform's
   monitoring during the run.
