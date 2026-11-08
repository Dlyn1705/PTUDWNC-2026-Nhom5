import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = new URL('./summarize.mjs', import.meta.url);
async function run(before, after) {
  const dir = await mkdtemp(path.join(tmpdir(), 'issue85-summary-'));
  try {
    await writeFile(path.join(dir, 'metrics-before.txt'), before);
    await writeFile(path.join(dir, 'metrics-after.txt'), after);
    await writeFile(path.join(dir, 'k6-summary.json'), JSON.stringify({ mode: 'warm' }));
    const process = spawnSync(globalThis.process.execPath, [fileURLToPath(script), dir]);
    return { exit: process.status, result: JSON.parse(await readFile(path.join(dir, 'cache-summary.json'), 'utf8')) };
  } finally {
    const resolved = await realpath(dir);
    const relative = path.relative(await realpath(tmpdir()), resolved);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && path.basename(resolved).startsWith('issue85-summary-'));
    await rm(resolved, { recursive: true, force: true });
  }
}
const metric = (hit, miss, bypass = 0) => `public_cache_reads_total{cache_kind="detail",cache_outcome="hit",service_instance_id="a"} ${hit}\npublic_cache_reads_total{cache_kind="detail",cache_outcome="miss",service_instance_id="a"} ${miss}\npublic_cache_reads_total{cache_kind="detail",cache_outcome="bypass",service_instance_id="a"} ${bypass}\n`;
test('uses window deltas, not lifetime Redis version hits', async () => {
  const value = await run(metric(1000, 1000), metric(1090, 1010) + 'redis_keyspace_hits 999999\n');
  assert.equal(value.exit, 0); assert.equal(value.result.hitRate, 0.9);
});
test('missing samples, counter reset and cache bypass fail warm acceptance', async () => {
  for (const [before, after] of [['', ''], [metric(100, 20), metric(1, 1)], [metric(0, 0), metric(90, 10, 1)]]) {
    const value = await run(before, after); assert.equal(value.exit, 1);
  }
});

test('one instance reset cannot be hidden by another instance increasing', async () => {
  const before = metric(100, 10) + metric(100, 10).replaceAll('id="a"', 'id="b"');
  const after = metric(10, 1) + metric(1000, 100).replaceAll('id="a"', 'id="b"');
  const value = await run(before, after); assert.equal(value.exit, 1); assert.equal(value.result.counterReset, true);
});
