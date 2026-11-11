# Load Test Report

Date: 2026-10-18 · Tool: k6 v2.3.0 · Scripts: `tests/load/` · Raw results: `tests/load/results/`

## Verdict

- **[Verified, local]** A 1,000-concurrent-user test **was executed** against the two endpoints
  that exist, in sustained, spike and closed-loop stress shapes. The API stayed stable: **0 failed
  requests, 0 timeouts, 0 connection errors, 0 server error log lines** in every valid run.
- **[Not verified]** The soak (memory-leak) test was attempted twice. Both attempts were
  **invalid** because the laptop went into system sleep (lid closed, battery 4%). See §5.
- **[Estimate]** This does **not** show the product can serve 1,000 real users. Only health
  endpoints exist; real endpoints will cost far more per request. Re-run on staging as modules ship.

## 1. Environment (and why it limits the conclusions)

| Item | Value |
|---|---|
| Machine | Apple M1 MacBook Air, 8 cores, 8 GB RAM, fanless. **k6, the API and Postgres all on the same machine** |
| API | `node apps/api/dist/main.js`, `NODE_ENV=production`, one process |
| DB | PostgreSQL 17 in Docker Desktop, dedicated `preconception_test` database, `max_connections` 100 |
| Background noise | iCloud Drive sync (`fileproviderd`, `cloudd`, `bird`) measured at ~2.7 cores during the baseline; Chrome, VS Code, other Docker stacks running |
| Network | Loopback to the API; Docker Desktop VM hop to Postgres |

Same-host load generation and background CPU usage make tail latency noisy. Use these numbers
for relative comparisons and stability, not capacity sign-off.

## 2. Workload model

One VU = one client. Each iteration sends one GET, then waits a **uniform 1–3 s think time** (mean
2 s). At 1,000 VUs this offers about 400–500 req/s, **not** 1,000 req/s.

| Request | Share |
|---|---|
| `GET /v1/health` (readiness, one `SELECT 1`) | 50% |
| `GET /v1/health/live` (no dependency) | 40% |
| `GET /v1/load-test-unknown-route` (404 error path; counted as an expected response) | 10% |

No authenticated or create/update scenarios: **no such endpoints exist.** Creating fake ones would
measure behaviour the API does not have.

| Scenario | Shape | Duration |
|---|---|---|
| sustained | 0→500 VUs (1 m) → 1000 (1 m), hold 1000 for 5 m, ramp down 30 s | 7 m 30 s |
| spike | 100 VUs 30 s → **1000 in 10 s**, hold 1 m → 100 in 10 s, hold 1 m (recovery) | 3 m |
| stress | 0→1000 in 30 s, hold 2 m, **no think time** (closed-loop capacity probe) | 2 m 45 s |
| soak | 1000 VUs for 10 m | invalid (§5) |

**Proposed acceptance targets:** error rate < 1%; p95 < 500 ms per lightweight endpoint; no
sustained memory growth; recovery after spike. No exceptions were needed: there are no
expensive endpoints. The stress run is a capacity probe and is not held to the latency target.

## 3. Results

"Baseline" = original code. "After" = code after this audit's fixes (error filter, request-id
order, readiness timeout, pool acquire timeout; pool size unchanged at 10).

### Throughput and errors

| Run | Max VUs | Total requests | RPS | Failed | Timeouts / conn errors | Thresholds |
|---|---|---|---|---|---|---|
| sustained · baseline | 1000 | 167,908 | 371.4 | 0.000% | 0 | **FAIL** (p95, see §4) |
| sustained · after | 1000 | 187,908 | 415.2 | 0.000% | 0 | PASS |
| spike · after | 1000 | 39,961 | 220.1 | 0.000% | 0 | PASS |
| stress · baseline | 1000 | 838,531 | 5,081.8 | 0.000% | 0 | ready p95 FAIL |
| stress · after (pool 10) | 1000 | 1,048,220 | 6,352.8 | 0.000% | 0 | PASS |
| stress · after (pool 20) | 1000 | 898,723 | 5,446.7 | 0.000% | 0 | PASS |

### Latency (ms)

| Run | Endpoint | p50 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|
| sustained · baseline | live | 0.5 | 203.3 | 696.9 | 3,180.3 | 5,573.2 |
| | ready | 1.8 | 543.7 | 2,073.1 | 5,497.7 | 8,124.8 |
| | all | 1.3 | 330.4 | 1,279.8 | 4,535.6 | 8,124.8 |
| **sustained · after** | live | 0.4 | 1.0 | 1.4 | 4.4 | 65.0 |
| | ready | 1.4 | 2.9 | 3.7 | 11.6 | 181.3 |
| | **all** | **0.9** | **2.3** | **3.0** | **8.2** | 181.3 |
| spike · after | live | 0.5 | 1.2 | 1.7 | 4.6 | 55.1 |
| | ready | 1.7 | 3.3 | 4.2 | 13.5 | 109.8 |
| stress · baseline | live | 4.0 | 7.7 | 10.0 | 18.6 | 2,705.2 |
| | ready | 316.5 | 469.5 | 552.7 | 1,254.5 | 3,689.8 |
| stress · after (pool 10) | live | 3.4 | 6.2 | 7.6 | 12.6 | 111.4 |
| | ready | 276.3 | 384.7 | 428.8 | 529.2 | 825.4 |
| stress · after (pool 20) | live | 8.7 | 13.4 | 16.1 | 24.9 | 133.7 |
| | ready | 326.3 | 411.7 | 456.2 | 563.5 | 747.3 |

The 404 path tracked liveness within ±0.3 ms in every run (in the JSON results).

### Resources (sampled every 2 s by `monitor.sh`)

| Run | API CPU avg / max | API RSS max | DB connections max |
|---|---|---|---|
| sustained · baseline | 19% / 41% | 159 MB | 10 |
| sustained · after | 20% / 100% | 215 MB | 10 |
| spike · after | 14% / 38% | 222 MB | 10 |
| stress · baseline | 102% / 132% | 314 MB | 10 |
| stress · after (pool 10) | 111% / 136% | 338 MB | 10 |
| stress · after (pool 20) | 107% / 132% | 350 MB | 20 |

RSS stayed level through the 5-minute hold of the sustained run (second-quarter vs.
fourth-quarter average 100.7 vs 97.2 MB). Cache hit rate: N/A, no cache exists. DB query latency is
not instrumented server-side; readiness latency is the closest proxy.

### Spike recovery

**[Verified]** Going from 100 to 1000 VUs in 10 s produced no errors. Latency during and after
the spike matched the sustained run (ready p99 13.5 ms over the whole run). There was no
degradation to recover from at this load.

## 4. Analysis

1. **The baseline sustained failure was the environment, not the code.** Slow requests came in
   10–20 s bursts. A diagnostic run showed in-process event-loop stalls up to 425 ms while the
   longest GC pause (`--trace-gc`) was 67 ms. At the same time iCloud sync used about 2.7 cores.
   Connect time was ~0 and the listen queue never overflowed. **The "after" improvement
   (p95 1,280 → 3 ms) must not be credited to the code changes.** None of them targets that path.
   The fixes in this audit are correctness and resilience fixes, not performance optimisations.
2. **Throughput ceiling (closed loop):** about 5,000–6,300 RPS total on one process, with one core
   saturated (CPU ~110%). Run-to-run variance (5,082 vs 6,353 for the same pool size) is within
   environmental noise on this machine.
3. **The DB path is the first limit.** Readiness p50 rose to ~276–326 ms while liveness stayed at
   ~3–9 ms on the same process, with DB connections pinned at the pool maximum.
4. **A bigger pool does not help.** Pool 20 was *slower* than pool 10 (5,447 vs 6,353 RPS;
   ready p50 326 vs 276 ms). The cost is per-query overhead in the single event loop and the
   Docker network hop, not waiting for a connection. The default stays at 10. This is the
   before/after benchmark for the only pool change considered, and it was rejected on evidence.

## 5. Soak test: not validly executed

Two 10-minute soak attempts ran for 7,281 s and 9,249 s of wall-clock time. The monitor shows
repeated ~904 s gaps. `pmset` logs show *"Entering Sleep state due to 'Maintenance Sleep' …
Using Batt (Charge:4%) 904 secs"* with the lid closed. `caffeinate -i` cannot prevent sleep
with the lid closed on battery. The results (1 and 6 unexpected statuses; "max latency" of
900 s, above the 10 s request timeout) are artifacts of sleep and are kept only in
`tests/load/results/invalid/`. **No conclusion about memory growth over time is claimed.**

To run it: machine on power, lid open (or on a staging host), then
`tests/load/run-local.sh soak run` or, against staging, `SOAK_DURATION=30m`.

## 6. Reproduce

See `tests/load/README.md`. Short version:

```sh
pnpm db:up && pnpm build
tests/load/run-local.sh sustained mylabel
tests/load/run-local.sh spike mylabel
THINK_MIN=0 THINK_MAX=0 tests/load/run-local.sh stress mylabel
```

For a capacity sign-off, run k6 from a separate host against **staging** (own DB, synthetic data,
written approval), with the load generator exempt from per-IP throttling, and capture server-side
metrics. Add authenticated read/write scenarios as soon as those endpoints exist.

## 7. User journeys (2026-10-29)

Script `tests/load/journeys.js`, run with `tests/load/run-journeys.sh full -e USERS=150 -e HOLD=2m`.
Raw results: `tests/load/results/journeys-full.*`.

**Setup.** Same laptop as §1 (k6, API and Docker Postgres on one M1 machine; the website dev
server was also running). One API process, `NODE_ENV=staging`, `DATABASE_POOL_MAX=10`,
`RATE_LIMIT_ENABLED=false` (all traffic comes from one IP). A disposable database with
migrations, the sample seed and 150 test accounts, each with an active pregnancy.

**Traffic model (assumed, not measured from real users).** Ramp 30 s, hold 2 min, ramp down
15 s:

| Scenario | Load | Per iteration |
| --- | --- | --- |
| visitors | up to 100 VUs | a week guide + an article list page, think 1–3 s, an article, think 1–3 s |
| members | up to 100 VUs | dashboard bundle of 5 GETs; 1 in 4 also saves a journal entry and a checklist tick; think 2–5 s |
| sign-ins | 2 per second | password sign-in |

**Results.** All thresholds passed.

| Group | What | p50 | p95 | p99 | max | Target (p95) |
| --- | --- | --- | --- | --- | --- | --- |
| public reads | week guides, article lists and pages | 3.1 ms | 13.1 ms | 34.4 ms | 197 ms | < 300 ms |
| dashboard reads | authenticated | 9.3 ms | 31.2 ms | 73.4 ms | 279 ms | < 300 ms |
| writes | journal + checklist | 5.8 ms | 17.3 ms | 47.3 ms | 195 ms | < 500 ms |
| sign-in | password hashing | 82.3 ms | 114.6 ms | 149.8 ms | 228 ms | < 1 s |

- 34,012 requests at 187 req/s average, **0 failed** (`http_req_failed` 0.00%), checks
  12,592 / 12,592, **0 error lines** in the server log.
- API process: CPU averaged 48% of one core, peaked at 94%; RSS peaked at 310 MB. Postgres
  connections for the database never exceeded 10 (the pool size).

**What this shows and doesn't.** About 200 concurrent active users at this request mix are
comfortably within one API process on this hardware, with CPU the first resource to run out.
It is not evidence for any higher number, for production hardware, or for real traffic
patterns, and there is no soak or spike run for these journeys yet. A first run of the
same test reported a 1.03% failure rate. That was the expected `404` for "no journal entry
today" being counted as a failure. The script now marks that 404 as expected; the server
logged no errors in either run.
