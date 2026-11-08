import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const fixture = JSON.parse(open(__ENV.FIXTURES || '/results/fixtures.json'));
const base = (__ENV.BASE_URL || 'http://localhost:8085').replace(/\/$/, '') + '/api/v1';
const mode = __ENV.MODE || 'smoke';
const supported = ['smoke', 'warm', 'cold', 'mixed', 'stress', 'soak', 'login'];
if (!supported.includes(mode)) throw new Error('Unsupported MODE');
if (!__ENV.PERF_PASSWORD) throw new Error('PERF_PASSWORD required');
const api = new Trend('api_latency', true);
const reads = new Trend('get_latency', true);
const transaction = new Trend('transaction_latency', true);
const errors = new Rate('unexpected_response');
const correctness = new Counter('correctness_errors');
const counts = new Counter('endpoint_samples');
const thresholds = {
  checks: ['rate==1'], unexpected_response: ['rate<0.01'], correctness_errors: ['count==0'],
};
if (['warm', 'mixed', 'soak'].includes(mode)) {
  thresholds.api_latency = ['p(95)<=500', 'p(99)<=1000'];
  thresholds.get_latency = ['p(50)<=150'];
  for (const endpoint of ['list', 'detail', 'search', 'category', ...(mode === 'mixed' ? ['create', 'update', 'publish', 'unpublish', 'delete'] : [])]) {
    thresholds[`api_latency{endpoint:${endpoint}}`] = ['p(95)<=500', 'p(99)<=1000'];
    thresholds[`endpoint_samples{endpoint:${endpoint}}`] = ['count>=1000'];
  }
}
if (mode === 'stress') thresholds.unexpected_response = [{ threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' }];
if (mode === 'login') {
  thresholds.api_latency = ['p(95)<=500', 'p(99)<=1000'];
  thresholds['endpoint_samples{endpoint:login}'] = ['count>=1000'];
}
const stages = mode === 'stress'
  ? [{ duration: '1m', target: 100 }, { duration: '5m', target: 100 }, { duration: '1m', target: 150 },
    { duration: '5m', target: 150 }, { duration: '1m', target: 200 }, { duration: '5m', target: 200 }, { duration: '1m', target: 0 }]
  : [{ duration: '1m', target: 100 }, { duration: mode === 'soak' ? '45m' : '15m', target: 100 }, { duration: '1m', target: 0 }];
export const options = {
  setupTimeout: '10m',
  scenarios: { workload: mode === 'smoke' || mode === 'login'
    ? { executor: 'constant-vus', vus: mode === 'smoke' ? 2 : 5, duration: __ENV.DURATION || (mode === 'smoke' ? '1m' : '5m') }
    : { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '30s' } },
  thresholds, summaryTrendStats: ['min', 'med', 'p(95)', 'p(99)', 'max', 'count'],
  // Excludes request bodies/credentials; fixture IDs and static route names only.
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response'],
};

let token;
let refreshCookie;
let loginAt = 0;
let sequence = 0;
function valid(ok, message) { if (!ok) { correctness.add(1); fail(message); } }
function request(method, path, body, endpoint, expected = 200, authenticated = false, extra = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: 'http://localhost:8085', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  const response = http.request(method, base + path, body === null ? null : JSON.stringify(body),
    { headers, tags: { name: endpoint }, redirects: 0, timeout: '10s', responseCallback: http.expectedStatuses(expected) });
  api.add(response.timings.duration, { endpoint }); counts.add(1, { endpoint });
  if (method === 'GET') reads.add(response.timings.duration);
  const ok = check(response, { [`${endpoint}: expected HTTP ${expected}`]: r => r.status === expected });
  errors.add(!ok); valid(ok, `${endpoint}: unexpected status ${response.status}`);
  return response;
}
function data(response) { try { return response.json().data; } catch (_) { valid(false, 'Invalid response JSON'); } }
function login() {
  const response = request('POST', '/auth/login', {
    email: fixture.emails[(__VU || 1) % fixture.emails.length], password: __ENV.PERF_PASSWORD,
  }, 'login');
  refreshCookie = response.cookies.culinary_refresh_token?.[0]?.value;
  token = data(response).accessToken; loginAt = Date.now(); valid(!!token, 'Missing access token');
}
function ensureSession() {
  if (!token) return login();
  if (Date.now() - loginAt > 8 * 60 * 1000) {
    const response = request('POST', '/auth/refresh', {}, 'refresh', 200, false,
      { Cookie: `culinary_refresh_token=${refreshCookie}` });
    refreshCookie = response.cookies.culinary_refresh_token?.[0]?.value;
    token = data(response).accessToken;
    loginAt = Date.now(); valid(!!token, 'Missing refreshed access token');
  }
}
function publicRead(index, variant = index % 4) {
  const category = fixture.categories[index % fixture.categories.length];
  switch (variant) {
    case 0: valid(Array.isArray(data(request('GET', `/recipes?page=${1 + index % 5}&pageSize=12&sortBy=createdAt&sortOrder=desc`, null, 'list'))), 'List must be array'); break;
    case 1: valid(!!data(request('GET', `/recipes/${fixture.slugs[index % fixture.slugs.length]}`, null, 'detail')).slug, 'Missing detail slug'); break;
    case 2: valid(Array.isArray(data(request('GET', `/recipes/search?q=${encodeURIComponent(Math.floor(index / 4) % 2 ? 'phở' : 'pho')}&page=1&pageSize=12`, null, 'search'))), 'Search must be array'); break;
    case 3: valid(!!data(request('GET', `/categories/${category.slug}?page=1&pageSize=12`, null, 'category')).category, 'Missing category'); break;
  }
}
function writeFlow() {
  ensureSession();
  const title = `Issue85 ${__ENV.RUN_ID || 'run'} ${__VU} ${Date.now()} ${sequence++}`;
  const body = { title, description: 'Performance isolated transaction', instructions: null, prepTime: 5,
    cookTime: 10, servings: 2, difficulty: 1, categoryId: fixture.categories[0].id,
    steps: [{ title: 'Cook', description: 'Nấu chín nguyên liệu', timerMinutes: 5 }],
    ingredients: [{ name: 'Gà', quantity: 1, unit: 'kg', notes: null }] };
  const created = data(request('POST', '/recipes/', body, 'create', 201, true));
  try {
    valid(!!created.id && !!created.rowVersion, 'Missing create version');
    const updated = data(request('PUT', `/recipes/${created.id}`, { ...body, title: title + ' updated' }, 'update', 200, true,
      { 'If-Match': `"${created.rowVersion}"` }));
    valid(!!updated.rowVersion, 'Missing update version');
    request('PATCH', `/recipes/${created.id}/publish`, {}, 'publish', 200, true);
    const published = data(request('GET', `/recipes/${updated.slug}`, null, 'verify-published'));
    valid(published.title === title + ' updated', 'Stale or incorrect public title');
    request('PATCH', `/recipes/${created.id}/unpublish`, {}, 'unpublish', 200, true);
    request('GET', `/recipes/${updated.slug}`, null, 'verify-hidden', 404);
  } finally {
    request('DELETE', `/recipes/${created.id}`, null, 'delete', 204, true);
  }
}
export function setup() {
  correctness.add(0);
  // Warm outside timed workload. Cold mode deliberately skips warm-up; operator resets isolated Redis first.
  if (mode !== 'cold' && mode !== 'login') for (let i = 0; i < fixture.slugs.length * 2; i++) {
    const c = fixture.categories[i % fixture.categories.length];
    for (const path of [`/recipes/${fixture.slugs[i % fixture.slugs.length]}`,
      `/recipes?page=${1 + i % 5}&pageSize=12&sortBy=createdAt&sortOrder=desc`,
      `/recipes/search?q=${encodeURIComponent(i % 2 ? 'phở' : 'pho')}&page=1&pageSize=12`,
      `/categories/${c.slug}?page=1&pageSize=12`]) {
      const r = http.get(base + path, { tags: { name: 'warmup' }, timeout: '10s' });
      if (r.status !== 200) throw new Error(`Warm-up failed: ${r.status}`);
    }
  }
  sleep(3);
  console.log("ISSUE85_MEASUREMENT_START");
}
export default function () {
  const start = Date.now();
  if (mode === 'login') login();
  else if (mode === 'smoke' || mode === 'mixed' && __ITER % 10 === 9) writeFlow();
  else {
    const index = (__VU * 17 + __ITER) % fixture.slugs.length;
    publicRead(index, mode === 'mixed' ? (__ITER % 10 === 8 ? 2 : [0, 1, 3][__ITER % 3]) : index % 4);
  }
  if (mode === 'smoke') publicRead(__ITER % 4);
  transaction.add(Date.now() - start);
  sleep(1);
}
export function handleSummary(summary) {
  return { '/results/k6-summary.json': JSON.stringify({ mode, runId: __ENV.RUN_ID, timing: 'HTTP duration excludes DNS/connect/TLS; transaction includes HTTP steps, excludes think time', summary }, null, 2) };
}
