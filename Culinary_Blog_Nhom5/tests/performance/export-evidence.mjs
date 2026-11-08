import { readdir, readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = path.join(repo, 'build/issue85');
const target = path.join(repo, 'Culinary_Blog_Nhom5/docx/Spec/evidence/issue85/20261105-local');
await mkdir(target, { recursive: true });
async function exists(file) { try { await access(file); return true; } catch { return false; } }
for (const file of ['fixtures.json', 'fixture-verification.json', 'query-plans.json', 'scale-summary.json',
  'failover-summary.json', 'ttl-summary.json', 'browser-budget.json', 'tool-audit.json'])
  if (await exists(path.join(source, file))) await copyFile(path.join(source, file), path.join(target, file));
const runs = [];
for (const entry of await readdir(source, { withFileTypes: true })) {
  const from = path.join(source, entry.name);
  if (!entry.isDirectory() || !await exists(path.join(from, 'k6-summary.json'))) continue;
  const to = path.join(target, entry.name); await mkdir(to, { recursive: true });
  for (const file of ['k6-summary.json', 'cache-summary.json', 'manifest.json', 'scenario-hash.json',
    'fixture-verification.json', 'images.json', 'resource-limits.jsonl', 'scenarios.js', 'termination.json', 'metrics-before.txt', 'metrics-after.txt'])
    if (await exists(path.join(from, file))) await copyFile(path.join(from, file), path.join(to, file));
  const run = JSON.parse(await readFile(path.join(from, 'k6-summary.json'), 'utf8'));
  const cache = await exists(path.join(from, 'cache-summary.json')) ? JSON.parse(await readFile(path.join(from, 'cache-summary.json'), 'utf8')) : null;
  const aborted = await exists(path.join(from, 'termination.json'));
  const verification = await exists(path.join(from, 'fixture-verification.json'));
  const metrics = run.summary.metrics;
  const thresholdsPass = Object.values(metrics).every(m => !m.thresholds || Object.values(m.thresholds).every(t => t.ok));
  runs.push({ runId: entry.name, mode: run.mode, fixtureVerified: verification,
    aborted,
    eligibility: aborted ? 'aborted for cache concurrency fix; incomplete duration' : run.mode === 'smoke' ? 'functional smoke only' : verification ? 'local measurement; shared host' : 'excluded: synthetic image jobs contaminated fixture',
    thresholdsPass, cacheGatePass: cache?.cacheGatePass, cacheWindowValid: cache?.valid, hitRate: cache?.hitRate,
    api: metrics.api_latency?.values, get: metrics.get_latency?.values, checks: metrics.checks?.values });
}
await writeFile(path.join(target, 'runs-summary.json'), JSON.stringify(runs, null, 2));
const manifestPath = path.join(source, 'lighthouse/manifest.json');
if (await exists(manifestPath)) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const grouped = {};
  for (const item of manifest) {
    const file = path.isAbsolute(item.jsonPath) ? item.jsonPath : path.join(source, 'lighthouse', item.jsonPath);
    const report = JSON.parse(await readFile(file, 'utf8'));
    const url = report.requestedUrl || report.finalDisplayedUrl || report.finalUrl;
    grouped[url] ??= { url, lighthouseVersion: report.lighthouseVersion, lcpMs: [], cls: [] };
    grouped[url].lcpMs.push(report.audits['largest-contentful-paint'].numericValue);
    grouped[url].cls.push(report.audits['cumulative-layout-shift'].numericValue);
  }
  const median = a => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
  await writeFile(path.join(target, 'lighthouse-summary.json'), JSON.stringify(Object.values(grouped).map(r => ({
    ...r, medianLcpMs: median(r.lcpMs), medianCls: median(r.cls),
    passed: r.lcpMs.length >= 3 && median(r.lcpMs) <= 2500 && median(r.cls) <= 0.1,
  })), null, 2));
}
const tests = [];
const testsDir = path.join(source, 'tests');
if (await exists(testsDir)) for (const file of await readdir(testsDir)) {
  if (!file.endsWith('.trx')) continue;
  const xml = await readFile(path.join(testsDir, file), 'utf8');
  const attributes = /<Counters\s+([^>]+)\/?\s*>/.exec(xml)?.[1];
  if (attributes) tests.push({ file, counters: Object.fromEntries([...attributes.matchAll(/(\w+)="(\d+)"/g)].map(m => [m[1], Number(m[2])])) });
}
await writeFile(path.join(target, 'tests-summary.json'), JSON.stringify(tests, null, 2));
for (const [from, name] of [
  ['Culinary_Blog_Nhom5/culinary-blog-web/build/lab6-recipe-editor-e2e/issue92-a11y-report.json', 'editor-a11y-report.json'],
  ['Culinary_Blog_Nhom5/culinary-blog-web/build/accessibility/result-chromium.json', 'accessibility-chromium.json'],
]) if (await exists(path.join(repo, from))) await copyFile(path.join(repo, from), path.join(target, name));
console.log(`Exported review evidence to ${target}. Raw time series and HTML stay in build/issue85 or CI artifacts.`);
