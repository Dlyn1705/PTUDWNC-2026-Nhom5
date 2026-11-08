import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const dir = path.resolve(process.argv[2]);
function counters(text) {
  const totals = { hit: 0, miss: 0, bypass: 0, error: 0 };
  const series = new Map();
  for (const line of text.split('\n')) {
    if (!/^public_cache_reads(?:_total)?\{/.test(line)) continue;
    const outcome = /cache_outcome="(hit|miss|bypass|error)"/.exec(line)?.[1];
    const value = Number(line.slice(line.lastIndexOf('}') + 1).trim().split(/\s+/)[0]);
    if (outcome && Number.isFinite(value)) {
      totals[outcome] += value;
      series.set(line.slice(0, line.lastIndexOf('}') + 1), value);
    }
  }
  return { totals, series };
}
const before = counters(await readFile(path.join(dir, 'metrics-before.txt'), 'utf8'));
const after = counters(await readFile(path.join(dir, 'metrics-after.txt'), 'utf8'));
const delta = Object.fromEntries(Object.keys(before.totals).map(k => [k, after.totals[k] - before.totals[k]]));
const reset = [...before.series].some(([key, value]) => !after.series.has(key) || after.series.get(key) < value);
const valid = !reset && Object.values(delta).every(n => n >= 0) && delta.hit + delta.miss > 0;
const hitRate = valid ? delta.hit / (delta.hit + delta.miss) : null;
const run = JSON.parse(await readFile(path.join(dir, 'k6-summary.json'), 'utf8'));
const gate = ['warm', 'soak', 'mixed'].includes(run.mode);
const result = { window: 'After warm-up marker through run end; includes ramp and drain', delta, hitRate,
  valid, counterReset: reset, cacheGatePass: !gate || valid && hitRate >= 0.8 && delta.bypass === 0 && delta.error === 0,
  caveat: 'Application data reads only, not Redis version lookups. Counter resets invalidate the window. GET p50 is warm workload, not individually proven hits.' };
await writeFile(path.join(dir, 'cache-summary.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (!result.cacheGatePass) process.exitCode = 1;
