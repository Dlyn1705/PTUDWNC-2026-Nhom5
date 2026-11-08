import assert from 'node:assert/strict';
import { waitForApi } from './readiness.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const output = path.resolve(process.env.PERF_OUTPUT || 'build/issue85');
const fixture = JSON.parse(await readFile(path.join(output, 'fixtures.json'), 'utf8'));
const a = process.env.API_A || 'http://localhost:5085/api/v1';
const b = process.env.API_B || 'http://localhost:5086/api/v1';
const gateway = process.env.PERF_GATEWAY || 'http://localhost:8085/api/v1';
if (!process.env.PERF_PASSWORD) throw new Error('PERF_PASSWORD required');
await Promise.all([a, b].map(waitForApi));
const evidence = [];
async function request(base, method, route, body, expected, token, cookie, extra = {}) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie, Origin: 'http://localhost:8085' } : {}), ...extra },
    body: body === null ? undefined : JSON.stringify(body) });
  evidence.push({ target: base === a ? 'a' : base === b ? 'b' : 'gateway', method, route: route.replace(/\/[0-9a-f-]{36}/g, '/:id'), status: response.status });
  assert.equal(response.status, expected, `${method} ${route}`);
  return { data: expected === 204 ? null : (await response.json()).data,
    cookie: response.headers.get('set-cookie')?.split(';')[0], upstream: response.headers.get('x-perf-upstream') };
}
const session = await request(a, 'POST', '/auth/login', { email: fixture.emails[0], password: process.env.PERF_PASSWORD }, 200);
const token = session.data.accessToken;
await request(b, 'GET', '/auth/me', null, 200, token);
const rotated = await request(b, 'POST', '/auth/refresh', {}, 200, null, session.cookie);
await request(a, 'POST', '/auth/refresh', {}, 401, null, session.cookie);
await request(a, 'POST', '/auth/refresh', {}, 401, null, rotated.cookie);
const racing = await request(a, 'POST', '/auth/login', { email: fixture.emails[0], password: process.env.PERF_PASSWORD }, 200);
const race = await Promise.all([a, b].map(async target => {
  const response = await fetch(target + '/auth/refresh', { method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', Cookie: racing.cookie, Origin: 'http://localhost:8085' }, body: '{}' });
  await response.arrayBuffer();
  evidence.push({ target: target === a ? 'a' : 'b', method: 'POST', route: '/auth/refresh', phase: 'concurrent', status: response.status });
  return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}));
assert.deepEqual(race.map(r => r.status).sort(), [200, 401], 'Concurrent refresh must have one winner');
await request(a, 'POST', '/auth/refresh', {}, 401, null, race.find(r => r.status === 200).cookie);
const fresh = await request(a, 'POST', '/auth/login', { email: fixture.emails[0], password: process.env.PERF_PASSWORD }, 200);
const body = { title: `Issue85 scale ${Date.now()}`, description: 'Isolated multi-instance check', prepTime: 5, cookTime: 10,
  servings: 2, difficulty: 1, categoryId: fixture.categories[0].id,
  ingredients: [{ name: 'Gà', quantity: 1, unit: 'kg' }], steps: [{ title: 'Cook', description: 'Nấu chín' }] };
const created = await request(a, 'POST', '/recipes/', body, 201, fresh.data.accessToken);
try {
  await request(b, 'GET', `/recipes/${created.data.slug}`, null, 404);
  await request(a, 'PATCH', `/recipes/${created.data.id}/publish`, {}, 200, fresh.data.accessToken);
  const first = await request(b, 'GET', `/recipes/${created.data.slug}`, null, 200);
  assert.equal(first.data.title, body.title);
  await request(a, 'PUT', `/recipes/${created.data.id}`, { ...body, title: body.title + ' updated' }, 200, fresh.data.accessToken, null,
    { 'If-Match': `"${first.data.rowVersion}"` });
  const second = await request(b, 'GET', `/recipes/${created.data.slug}`, null, 200);
  assert.equal(second.data.title, body.title + ' updated');
  await request(a, 'PATCH', `/recipes/${created.data.id}/unpublish`, {}, 200, fresh.data.accessToken);
  await request(b, 'GET', `/recipes/${created.data.slug}`, null, 404);
} finally { await request(a, 'DELETE', `/recipes/${created.data.id}`, null, 204, fresh.data.accessToken); }
const upstreams = new Set();
for (let i = 0; i < 12; i++) {
  const r = await request(gateway, 'GET', '/recipes?page=1', null, 200);
  if (r.upstream) upstreams.add(r.upstream);
}
assert.equal(upstreams.size, 2, 'Gateway must serve through both instances');
await request(b, 'POST', '/auth/logout', {}, 204, null, fresh.cookie);
await request(a, 'POST', '/auth/refresh', {}, 401, null, fresh.cookie);
await writeFile(path.join(output, 'scale-summary.json'), JSON.stringify({ passed: true, upstreamCount: upstreams.size,
  checks: evidence, limitation: 'Auth/cache smoke only; Hangfire retry/crash and sustained failover require separate evidence.' }, null, 2));
console.log('Cross-instance auth, refresh replay/revoke, cache visibility and gateway distribution passed.');
