import assert from 'node:assert/strict';
import { waitForApi } from './readiness.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
const exec = promisify(execFile);
const compose = ['compose', '-p', 'issue85', '--env-file', 'build/issue85.env', '-f', 'compose.performance.yml'];
const gateway = 'http://localhost:8085/api/v1/recipes?page=1&pageSize=12';
const results = [];
async function sample(phase, times) {
  for (let i = 0; i < times; i++) {
    const started = performance.now();
    try {
      const response = await fetch(gateway, { signal: AbortSignal.timeout(4000) });
      const body = response.status === 200 ? await response.json() : null;
      if (response.status === 200) assert.ok(Array.isArray(body.data));
      results.push({ phase, at: new Date().toISOString(), status: response.status,
        ms: performance.now() - started, upstream: response.headers.get('x-perf-upstream') });
    } catch (error) { results.push({ phase, at: new Date().toISOString(), status: 0, ms: performance.now() - started, error: error.name }); }
    await setTimeout(200);
  }
}
await Promise.all(['http://localhost:5085', 'http://localhost:5086'].map(waitForApi));
await sample('before', 10);
try {
  await exec('docker', [...compose, 'stop', '-t', '5', 'api-a'], { windowsHide: true, timeout: 20000 });
  await sample('a-stopped', 50);
} finally {
  await exec('docker', [...compose, 'up', '-d', '--no-build', 'api-a'], { windowsHide: true, timeout: 60000 });
}
await waitForApi('http://localhost:5085');
await setTimeout(6000);
await sample('recovered', 30);
const stopped = results.filter(r => r.phase === 'a-stopped');
const recovered = results.filter(r => r.phase === 'recovered');
const passed = results.filter(r => r.phase === 'before').every(r => r.status === 200) && stopped.some(r => r.status === 200) && recovered.every(r => r.status === 200)
  && new Set(recovered.map(r => r.upstream)).size === 2;
await writeFile(path.resolve(process.env.PERF_OUTPUT || 'build/issue85', 'failover-summary.json'), JSON.stringify({
  passed, results, limitation: 'Fault drill outside steady-state SLO. Proxy deliberately avoids replaying mutations; passive health may produce transient 502 responses.',
}, null, 2));
assert.ok(passed, 'Recovery must serve correct responses through both API instances');
