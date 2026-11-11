// k6 load test for the Preconception Platform API.
//
// Only endpoints that exist today are exercised (see docs/API_INVENTORY.md). There are no
// authenticated or write endpoints yet, so the workload cannot include them; add scenarios here
// as modules land instead of simulating behaviour the API does not have.
//
// Usage (see tests/load/README.md):
//   k6 run -e SCENARIO=sustained -e BASE_URL=http://localhost:4100 tests/load/api-load.js
//
// Never point this at production.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://localhost:4100').replace(/\/$/, '');
const SCENARIO = __ENV.SCENARIO || 'smoke';
// Think time between requests of one simulated user, in seconds (uniform min..max).
const THINK_MIN = Number(__ENV.THINK_MIN ?? 1);
const THINK_MAX = Number(__ENV.THINK_MAX ?? 3);
const VUS = Number(__ENV.VUS ?? 1000);

const unexpectedStatus = new Counter('unexpected_status');

const SCENARIOS = {
  // Sanity check before any heavier run.
  smoke: { executor: 'constant-vus', vus: 5, duration: '30s' },

  // Gradual ramp to the target, sustained hold, ramp down.
  sustained: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: VUS / 2 },
      { duration: '1m', target: VUS },
      { duration: '5m', target: VUS },
      { duration: '30s', target: 0 },
    ],
    gracefulRampDown: '10s',
  },

  // Baseline traffic, sudden jump to the target, then back to baseline to observe recovery.
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: VUS / 10 },
      { duration: '10s', target: VUS },
      { duration: '1m', target: VUS },
      { duration: '10s', target: VUS / 10 },
      { duration: '1m', target: VUS / 10 },
      { duration: '10s', target: 0 },
    ],
    gracefulRampDown: '10s',
  },

  // Long hold at the target to look for memory growth or connection leaks.
  soak: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: VUS },
      { duration: __ENV.SOAK_DURATION || '10m', target: VUS },
      { duration: '30s', target: 0 },
    ],
    gracefulRampDown: '10s',
  },

  // Capacity probe: the same users with no think time, to find the throughput ceiling.
  // Run with THINK_MIN=0 THINK_MAX=0.
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: VUS },
      { duration: '2m', target: VUS },
      { duration: '15s', target: 0 },
    ],
    gracefulRampDown: '10s',
  },
};

if (!SCENARIOS[SCENARIO]) throw new Error(`Unknown SCENARIO "${SCENARIO}"`);

export const options = {
  scenarios: { [SCENARIO]: SCENARIOS[SCENARIO] },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  // Proposed acceptance targets (docs/LOAD_TEST_REPORT.md). The stress scenario is a capacity
  // probe and is expected to breach latency targets; it still reports them.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    unexpected_status: ['count<1'],
    'http_req_duration{endpoint:live}': ['p(95)<500'],
    'http_req_duration{endpoint:ready}': ['p(95)<500'],
    'http_req_duration{endpoint:not_found}': ['p(95)<500'],
  },
  // Treat the deliberate 404 as an expected response so it does not count as a failure.
  noConnectionReuse: false,
};

http.setResponseCallback(http.expectedStatuses(200, 404));

// Workload mix per request: 50% readiness (one DB round-trip, stands in for a DB-backed read),
// 40% liveness (framework overhead only), 10% unknown route (error path through the filter).
function pickEndpoint() {
  const r = Math.random();
  if (r < 0.5) return { name: 'ready', path: '/v1/health', status: 200 };
  if (r < 0.9) return { name: 'live', path: '/v1/health/live', status: 200 };
  return { name: 'not_found', path: '/v1/load-test-unknown-route', status: 404 };
}

export default function () {
  const ep = pickEndpoint();
  const res = http.get(`${BASE_URL}${ep.path}`, {
    tags: { endpoint: ep.name },
    timeout: '10s',
  });
  const ok = check(res, {
    'status as expected': (r) => r.status === ep.status,
    'has request id': (r) => !!r.headers['X-Request-Id'],
  });
  if (!ok) unexpectedStatus.add(1, { endpoint: ep.name, status: String(res.status) });

  const think = THINK_MIN + Math.random() * (THINK_MAX - THINK_MIN);
  if (think > 0) sleep(think);
}

export function handleSummary(data) {
  const out = __ENV.RESULT_FILE || `tests/load/results/${SCENARIO}-${Date.now()}.json`;
  return {
    [out]: JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const fmt = (v) => (v === undefined ? 'n/a' : `${v.toFixed(1)}ms`);
  const lines = [`scenario=${SCENARIO} base=${BASE_URL}`];
  lines.push(
    `requests=${m.http_reqs.values.count} rps=${m.http_reqs.values.rate.toFixed(1)} ` +
      `failed=${(m.http_req_failed.values.rate * 100).toFixed(3)}% ` +
      `vus_max=${m.vus_max.values.max} unexpected=${m.unexpected_status?.values.count ?? 0}`,
  );
  for (const key of Object.keys(m).filter((k) => k.startsWith('http_req_duration'))) {
    const v = m[key].values;
    lines.push(
      `${key}: p50=${fmt(v.med)} p90=${fmt(v['p(90)'])} p95=${fmt(v['p(95)'])} ` +
        `p99=${fmt(v['p(99)'])} max=${fmt(v.max)}`,
    );
  }
  for (const [name, t] of Object.entries(data.metrics)) {
    if (t.thresholds) {
      for (const [expr, res] of Object.entries(t.thresholds)) {
        lines.push(`threshold ${name} ${expr}: ${res.ok ? 'PASS' : 'FAIL'}`);
      }
    }
  }
  return lines.join('\n') + '\n';
}
