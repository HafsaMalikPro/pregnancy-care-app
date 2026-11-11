// k6 user-journey load test for the endpoints the website uses.
//
//   k6 run -e BASE_URL=http://localhost:4100 -e USERS=150 tests/load/journeys.js
//
// Run only against a local or staging API on a disposable database (see run-journeys.sh),
// with RATE_LIMIT_ENABLED=false: every k6 request comes from one IP, so the per-IP limits
// would otherwise be what gets measured.
//
// Traffic model (assumption, not a measurement of real users):
//   visitors  - up to 100 concurrent anonymous readers: a week guide, then an article page,
//               with 1-3 s think time
//   members   - up to 100 concurrent signed-in users: the dashboard bundle (current week,
//               timeline, checklist, today's log, reminders) then 2-5 s think time; 1 in 4
//               visits also saves a journal entry and ticks a checklist task
//   sign-ins  - 2 password sign-ins per second (password hashing is the costliest call)
import { check, sleep } from 'k6';
import http from 'k6/http';

const BASE = __ENV.BASE_URL || 'http://localhost:4100';
const USERS = Number(__ENV.USERS || 150);
const HOLD = __ENV.HOLD || '2m';
const PASSWORD = 'load-test-passphrase-1234';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const options = {
  setupTimeout: '5m',
  scenarios: {
    visitors: {
      executor: 'ramping-vus',
      exec: 'visitor',
      stages: [
        { duration: '30s', target: 100 },
        { duration: HOLD, target: 100 },
        { duration: '15s', target: 0 },
      ],
    },
    members: {
      executor: 'ramping-vus',
      exec: 'member',
      stages: [
        { duration: '30s', target: 100 },
        { duration: HOLD, target: 100 },
        { duration: '15s', target: 0 },
      ],
    },
    signins: {
      executor: 'constant-arrival-rate',
      exec: 'signIn',
      rate: 2,
      timeUnit: '1s',
      duration: HOLD,
      startTime: '30s',
      preAllocatedVUs: 10,
      maxVUs: 30,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{group:public}': ['p(95)<300'],
    'http_req_duration{group:dashboard}': ['p(95)<300'],
    'http_req_duration{group:write}': ['p(95)<500'],
    'http_req_duration{group:signin}': ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

export function setup() {
  const run = Date.now();
  const users = [];
  for (let i = 0; i < USERS; i++) {
    const email = `load-${run}-${i}@example.test`;
    const res = http.post(
      `${BASE}/v1/auth/sign-up/email`,
      JSON.stringify({ email, password: PASSWORD, name: 'Load Test' }),
      { headers: JSON_HEADERS },
    );
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status}`);
    // Bearer tokens only: a leftover session cookie without an Origin header is (rightly)
    // rejected by Better Auth's CSRF check.
    http.cookieJar().clear(BASE);
    const auth = { ...JSON_HEADERS, Authorization: `Bearer ${res.headers['Set-Auth-Token']}` };
    http.post(
      `${BASE}/v1/me/consents`,
      JSON.stringify({
        purpose: 'health_data_processing',
        granted: true,
        policyVersion: '2026-10-01',
        source: 'load',
      }),
      { headers: auth },
    );
    const preg = http.post(
      `${BASE}/v1/pregnancies`,
      JSON.stringify({ dating: { method: 'lmp', lmpDate: daysAgo(70 + (i % 140)) } }),
      { headers: auth },
    );
    if (preg.status !== 201) throw new Error(`pregnancy failed: ${preg.status}`);
    users.push({ email, auth });
  }
  const tasks = http.get(`${BASE}/v1/readiness/tasks`, { headers: users[0].auth }).json();
  const articles = http
    .get(`${BASE}/v1/articles?limit=20`)
    .json()
    .items.map((a) => a.slug);
  if (tasks.length === 0 || articles.length === 0) {
    throw new Error('seed content first: tasks and articles are required');
  }
  return { users, taskIds: tasks.map((t) => t.id), articles };
}

export function visitor(data) {
  const week = 6 + Math.floor(Math.random() * 11); // seeded guides: weeks 6-16
  const page = Math.floor(Math.random() * 2);
  const res = http.batch([
    ['GET', `${BASE}/v1/week-guides/${week}`, null, { tags: { group: 'public' } }],
    ['GET', `${BASE}/v1/articles?limit=9&offset=${page * 9}`, null, { tags: { group: 'public' } }],
  ]);
  check(res, { 'public reads ok': (r) => r.every((x) => x.status === 200) });
  sleep(1 + Math.random() * 2);
  const slug = data.articles[Math.floor(Math.random() * data.articles.length)];
  check(http.get(`${BASE}/v1/articles/${slug}`, { tags: { group: 'public' } }), {
    'article ok': (r) => r.status === 200,
  });
  sleep(1 + Math.random() * 2);
}

export function member(data) {
  const user = data.users[(__VU - 1) % data.users.length];
  const params = { headers: user.auth, tags: { group: 'dashboard' } };
  const today = iso(new Date());
  const res = http.batch([
    ['GET', `${BASE}/v1/pregnancies/current/week`, null, params],
    ['GET', `${BASE}/v1/pregnancies/current/timeline`, null, params],
    ['GET', `${BASE}/v1/readiness/tasks`, null, params],
    ['GET', `${BASE}/v1/reminders`, null, params],
    // 404 until today's entry is saved: an expected answer, not a failure.
    [
      'GET',
      `${BASE}/v1/daily-logs/${today}`,
      null,
      { ...params, responseCallback: http.expectedStatuses(200, 404) },
    ],
  ]);
  check(res, {
    // Today's log is 404 until one is saved.
    'dashboard ok': (r) =>
      r.slice(0, 4).every((x) => x.status === 200) && [200, 404].includes(r[4].status),
  });

  if (Math.random() < 0.25) {
    const write = { headers: user.auth, tags: { group: 'write' } };
    const log = http.put(
      `${BASE}/v1/daily-logs/${today}`,
      JSON.stringify({ symptoms: ['fatigue'], note: null }),
      write,
    );
    const task = data.taskIds[Math.floor(Math.random() * data.taskIds.length)];
    const progress = http.put(
      `${BASE}/v1/readiness/tasks/${task}/progress`,
      JSON.stringify({ completed: Math.random() < 0.5, note: null }),
      write,
    );
    check(null, {
      'writes ok': () => log.status === 200 && progress.status === 200,
    });
  }
  sleep(2 + Math.random() * 3);
}

export function signIn(data) {
  const user = data.users[Math.floor(Math.random() * data.users.length)];
  const res = http.post(
    `${BASE}/v1/auth/sign-in/email`,
    JSON.stringify({ email: user.email, password: PASSWORD }),
    { headers: JSON_HEADERS, tags: { group: 'signin' } },
  );
  check(res, { 'sign-in ok': (r) => r.status === 200 });
  http.cookieJar().clear(BASE);
}
