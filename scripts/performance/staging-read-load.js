import http from 'k6/http';
import { check, sleep } from 'k6';

// Baseline only: login plus representative reads, no booking/cargo/finance writes.
// Requires explicit staging marker and test-only credentials. Never point at prod.
const base = (__ENV.STAGING_BASE_URL || '').replace(/\/$/, '');
let users = [];
try { users = JSON.parse(__ENV.STAGING_TEST_USERS || '[]'); } catch { /* rejected below */ }
const tripDate = __ENV.STAGING_TRIP_DATE || '';
const tripId = __ENV.STAGING_TRIP_ID || '';
const explicitStaging = __ENV.DISTRICT_ALLOW_STAGING_TESTS === 'CONFIRM-STAGING-ONLY';
let parsedBase;
try { parsedBase = new URL(base); } catch { /* rejected below */ }
const host = parsedBase?.hostname.toLowerCase() || '';
const hostLabels = host.split('.');
const stagingHost = hostLabels.includes('staging') || hostLabels.includes('preview');
const approvedHost = (__ENV.STAGING_APPROVED_HOST || '').toLowerCase();
const productionLabel = hostLabels.some((label) => ['prod', 'production', 'live'].includes(label));
const distinctUsers = new Set(users.map((user) => user?.username).filter(Boolean));

if (!base || !parsedBase || !['http:', 'https:'].includes(parsedBase.protocol)
    || parsedBase.username || parsedBase.password || parsedBase.search || parsedBase.hash || parsedBase.pathname !== '/') {
  throw new Error('Refusing run: STAGING_BASE_URL must be a clean HTTP(S) origin without credentials, path, query, or fragment.');
}
if (!base.startsWith('https://')) {
  throw new Error('Refusing run: remote staging URL must use HTTPS.');
}
if (!explicitStaging || !stagingHost || productionLabel || !approvedHost || host !== approvedHost) {
  throw new Error('Refusing run: require the exact owner-approved HTTPS staging hostname and explicit staging marker; production-like hosts are rejected.');
}
if (!tripDate || !/^\d{4}-\d{2}-\d{2}$/.test(tripDate) || !/^\d+$/.test(tripId)) {
  throw new Error('Refusing run: provide the date and ID of a verified synthetic staging trip.');
}
if (users.length < 50 || distinctUsers.size !== users.length
    || users.some((user) => typeof user?.username !== 'string' || !user.username
      || typeof user?.password !== 'string' || !user.password)) {
  throw new Error('Refusing run: provide at least 50 distinct synthetic staging accounts as STAGING_TEST_USERS JSON.');
}

export const options = {
  stages: [
    { duration: __ENV.STAGE_DURATION || '2m', target: 10 },
    { duration: __ENV.STAGE_DURATION || '2m', target: 20 },
    { duration: __ENV.STAGE_DURATION || '2m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:read}': ['p(95)<500', 'p(99)<1000'],
    'http_req_duration{kind:login}': ['p(95)<1000'],
  },
  summaryTrendStats: ['avg', 'med', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

let loggedIn = false;
const account = users[(__VU - 1) % users.length];
function call(path, params = {}, expectedStatuses = [200]) {
  const response = http.get(`${base}${path}`, {
    tags: { kind: 'read' },
    timeout: '15s',
    redirect: 0,
    ...params,
  });
  check(response, { [`${path} expected status (${expectedStatuses.join('/')})`]: (r) => expectedStatuses.includes(r.status) });
  return response;
}

export default function () {
  if (!loggedIn) {
    const login = http.post(`${base}/api/login`, JSON.stringify({ username: account.username, password: account.password }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { kind: 'login' },
      timeout: '15s',
      redirect: 0,
    });
    check(login, { 'login succeeds': (r) => r.status === 200 });
    if (login.status !== 200) return;
    loggedIn = true;
  }

  call('/api/me');
  const trips = call(`/api/trips?date=${encodeURIComponent(tripDate)}`);
  let listedTrips = [];
  try { listedTrips = JSON.parse(trips.body).trips || []; } catch { /* caught by the check below */ }
  const syntheticTripPresent = listedTrips.some((trip) => String(trip.id) === tripId && trip.travel_date === tripDate);
  if (!check(syntheticTripPresent, { 'configured synthetic trip is present for every VU': Boolean })) return;
  call(`/api/bookings?page=1&pageSize=50&tripId=${encodeURIComponent(tripId)}`);
  call(`/api/cargo?date=${encodeURIComponent(tripDate)}`);
  call('/api/admin/dashboard?scope=dashboard');
  call('/api/admin/dashboard?scope=customers');

  // Permission denials are classified separately; k6 does not count this
  // endpoint's expected 403 as an HTTP failure. Unexpected statuses fail checks.
  if (account.accountsView === true) call('/api/admin/dashboard?scope=accounts');
  else {
    const denied = call('/api/admin/dashboard?scope=accounts', {
      responseCallback: http.expectedStatuses(200, 403),
      tags: { kind: 'permission_probe' },
    }, [403]);
    check(denied, { 'accounts denial is exactly 403': (r) => r.status === 403 });
  }
  sleep(Number(__ENV.THINK_TIME_SECONDS || 2));
}

export function handleSummary(data) {
  const metric = (name) => data.metrics[name]?.values || {};
  const durations = metric('http_req_duration');
  return {
    stdout: `${JSON.stringify({
      virtual_users_max: 50,
      requests: metric('http_reqs').count || 0,
      requests_per_second: metric('http_reqs').rate || 0,
      http_error_rate: metric('http_req_failed').rate || 0,
      latency_ms: { p50: durations['p(50)'], p95: durations['p(95)'], p99: durations['p(99)'] },
      checks_passed: metric('checks').passes || 0,
      checks_failed: metric('checks').fails || 0,
      thresholds: data.root_group?.checks || [],
    }, null, 2)}\n`,
  };
}
