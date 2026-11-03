/* eslint-disable @typescript-eslint/no-require-imports -- Real production smoke and banner accessibility. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
async function main() {
  assert.ok(process.env.RELIABILITY_API_URL);
  const root = path.resolve(__dirname, "..");
  const reserve = http.createServer(); await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const now = Date.now();
  const notice = { announcedAt: new Date(now - 3600000).toISOString(), startsAt: new Date(now + 72 * 3600000).toISOString(), endsAt: new Date(now + 73 * 3600000).toISOString(), message: "Kiểm tra backup và bảo trì hệ thống" };
  const env = { ...process.env, API_INTERNAL_URL: process.env.RELIABILITY_API_URL, MAINTENANCE_NOTICE_JSON: JSON.stringify(notice) };
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: root, env, windowsHide: true, stdio: "pipe" });
  let output = ""; server.stdout.on("data", data => { output = (output + data).slice(-5000); }); server.stderr.on("data", data => { output = (output + data).slice(-5000); });
  let browser;
  try {
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* Startup */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, output);
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
    const context = await browser.newContext({ viewport: { width: 320, height: 812 } });
    const page = await context.newPage();
    for (const route of ["/", "/auth/login", "/recipes", "/recipes/reliable-recipe", "/status"]) {
      const response = await page.goto(origin + route, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200, route);
      await page.getByRole("complementary", { name: "Thông báo bảo trì" }).waitFor();
      assert.equal(await page.locator("time").first().getAttribute("datetime"), notice.startsAt);
    }
    const result = await new AxeBuilder({ page }).include('[aria-label="Thông báo bảo trì"]').analyze();
    assert.deepEqual(result.violations, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(origin + "/recipes", { waitUntil: "domcontentloaded" });
    await page.getByRole("complementary", { name: "Thông báo bảo trì" }).waitFor();
    const out = path.join(root, "build/reliability"); fs.mkdirSync(out, { recursive: true });
    await page.screenshot({ path: path.join(out, "maintenance-mobile.png") });
    for (const route of ["/health/live", "/health/ready"]) assert.ok((await fetch(process.env.RELIABILITY_API_URL + route)).ok);
    console.log("PASS production home/login/list/detail/status, API health, 48h notice, banner axe and 320px.");
  } finally {
    if (browser) await browser.close(); server.kill();
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
