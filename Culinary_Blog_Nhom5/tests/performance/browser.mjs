import { chromium } from 'playwright';
import { readFile, mkdir, writeFile, copyFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
const require = createRequire(import.meta.url);
const output = path.resolve(process.env.PERF_OUTPUT || '../../../build/issue85');
const fixture = JSON.parse(await readFile(path.join(output, 'fixtures.json'), 'utf8'));
const base = process.env.FRONTEND_URL || 'http://localhost:8085';
const vitalsPath = path.join(path.dirname(require.resolve('web-vitals')), 'web-vitals.attribution.iife.js');
const vitals = await readFile(vitalsPath, 'utf8');
await mkdir(output, { recursive: true });
const startedUtc = new Date().toISOString();
const reportPath = path.join(output, 'browser-budget.json');
try {
  await access(reportPath); await mkdir(path.join(output, 'browser-history'), { recursive: true });
  await copyFile(reportPath, path.join(output, 'browser-history', startedUtc.replaceAll(':', '-') + '.json'));
} catch { }
await writeFile(reportPath, JSON.stringify({ status: 'running', startedUtc, results: [] }));
let browser; let failure;
const results = [];
try {
  browser = await chromium.launch();
  for (const route of ['/', '/recipes', `/recipes/${fixture.slugs[0]}`, '/search?q=pho', `/categories/${fixture.categories[0].slug}`, '/auth/login']) {
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150,
        downloadThroughput: 1_600_000 / 8, uploadThroughput: 750_000 / 8 });
      await page.addInitScript({ content: `${vitals}\nwindow.__inp=[]; webVitals.onINP(m => window.__inp.push({value:m.value, rating:m.rating, attribution:{target:m.attribution?.interactionTarget, type:m.attribution?.interactionType, inputDelayMs:m.attribution?.inputDelay, processingMs:m.attribution?.processingDuration, presentationMs:m.attribution?.presentationDelay}}), {reportAllChanges:true});` });
      const scripts = new Map(); const pending = []; const captureErrors = []; let collecting = true;
      page.on('response', response => {
        if (collecting && response.request().resourceType() === 'script') pending.push((async () => {
          if (!response.ok()) throw new Error(`JS failed: ${response.status()}`);
          // Response.body is decoded; gzip each unique loaded resource using the same level.
          scripts.set(response.url(), gzipSync(await response.body(), { level: 9 }).length);
        })().catch(error => { captureErrors.push(error.message); }));
      });
      const response = await page.goto(base + route, { waitUntil: 'networkidle', timeout: 60000 });
      if (response.status() !== 200) throw new Error(`Route failed ${route}: ${response.status()}`);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      if (route.includes('/recipes/')) {
        if (!/phở gà performance/i.test(await page.locator('h1').first().innerText())) throw new Error('Seed recipe detail was not rendered');
      } else if (route !== '/auth/login') {
        try {
          await page.locator('a[href^="/recipes/issue85-recipe-"]').first().waitFor({ state: 'attached', timeout: 15000 });
        } catch {
          await writeFile(path.join(output, 'missing-seed-page.html'), await page.content());
          await page.screenshot({ path: path.join(output, 'missing-seed-page.png'), fullPage: true });
          throw new Error(`Seed results missing from ${route}`);
        }
      }
      await Promise.all(pending);
      collecting = false;
      if (captureErrors.length) throw new Error('Could not measure loaded scripts: ' + captureErrors.join('; '));
      // Let hydration and route prefetch work settle before the measured
      // interaction. This keeps lab INP focused on the page controls instead
      // of a trailing Next.js startup task under 4x CPU slowdown.
      await page.waitForTimeout(1000);
      // Freeze first-load bytes before user interaction.
      const firstLoadScripts = [...scripts.keys()];
      const bytes = [...scripts.values()].reduce((a, b) => a + b, 0);
      // A real mobile-menu interaction on every public route, followed by search/login input where available.
      const menu = page.getByRole('button', { name: /mở.*menu|mở.*điều hướng|open.*menu|toggle.*menu/i });
      if (await menu.count()) { await menu.first().tap(); await page.waitForTimeout(300); }
      const input = page.locator('input:visible').first();
      if (await input.count()) { await input.tap(); await input.pressSequentially('pho', { delay: 20 }); }
      await page.waitForTimeout(1000);
      const inpSample = await page.evaluate(() => window.__inp.at(-1) ?? null);
      const inp = inpSample?.value ?? null;
      results.push({ route, run, firstLoadGzipBytes: bytes, inpMs: inp, inpAttribution: inpSample?.attribution, scripts: firstLoadScripts,
        jsPass: bytes <= 200000, inpPass: inp !== null && inp <= 200 });
      await writeFile(reportPath, JSON.stringify({ status: 'running', startedUtc, results }, null, 2));
      await context.close();
    }
  }
} catch (error) { failure = error; } finally { if (browser) await browser.close(); }
await writeFile(reportPath, JSON.stringify({
  status: failure ? 'error' : 'complete', startedUtc, error: failure?.message,
  profile: { browser: 'Chromium', browserVersion: browser?.version(), nodeVersion: process.version, viewport: '375x812', cpuSlowdown: 4, latencyMs: 150, downloadBps: 1600000 },
  limitation: 'Lab interactions only, not field p75 INP. Missing INP samples fail the gate.', results,
}, null, 2));
if (failure) throw failure;
if (results.length !== 18 || results.some(r => !r.jsPass || !r.inpPass)) process.exitCode = 1;
