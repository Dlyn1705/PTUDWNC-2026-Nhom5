/* eslint-disable @typescript-eslint/no-require-imports -- Isolated production route against real API/PostgreSQL. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const fixture = path.join(root, "build/search-fullstack-fixture");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function write(name, value) {
  const target = path.join(fixture, name);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value);
}
function run(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", part => { output = (output + part).slice(-24000); });
  child.stderr.on("data", part => { output = (output + part).slice(-24000); });
  const exited = new Promise(resolve => { child.once("exit", resolve); child.once("error", error => { output += error.message; resolve(-1); }); });
  return { child, exited, output: () => output };
}
async function stop(process, graceful = false) {
  if (!process || process.child.exitCode !== null) return;
  if (graceful) process.child.stdin.end("stop\n"); else process.child.kill();
  const completed = await Promise.race([process.exited.then(() => true), delay(15000).then(() => false)]);
  if (!completed) { process.child.kill(); throw new Error("Test process did not stop; check isolated test DB cleanup."); }
}
async function main() {
  assert.ok(process.env.SEARCH_TEST_CONNECTION, "Set SEARCH_TEST_CONNECTION for an isolated test PostgreSQL server.");
  fs.mkdirSync(fixture, { recursive: true });
  write("package.json", JSON.stringify({ name: "search-fullstack-fixture", private: true }));
  write("tsconfig.json", JSON.stringify({ compilerOptions: {
    target: "ES2022", lib: ["dom", "dom.iterable", "esnext"], strict: true, noEmit: true,
    esModuleInterop: true, module: "esnext", moduleResolution: "bundler", jsx: "react-jsx", skipLibCheck: true,
    paths: { "@/*": [root.replaceAll("\\", "/") + "/*"] },
  }, include: ["**/*.tsx", ".next/types/**/*.ts"], exclude: ["node_modules"] }));
  write("next.config.mjs", `export default {images:{unoptimized:true},webpack(c){c.resolve.alias['@']=${JSON.stringify(root)};return c;}}`);
  for (const name of ["postcss.config.mjs", "app/globals.css"]) write(name, fs.readFileSync(path.join(root, name), "utf8"));
  write("app/layout.tsx", "import './globals.css'; export default function Layout({children}:{children:React.ReactNode}){return <html lang='vi'><body><main>{children}</main></body></html>}");
  write("app/page.tsx", "export default function Page(){return <h1>Search test ready</h1>}");
  write("app/search/page.tsx", "export {default} from '@/app/search/page';");
  for (const name of ["loading", "error"]) write(`app/search/${name}.tsx`, fs.readFileSync(path.join(root, `app/search/${name}.tsx`), "utf8"));
  const api = run("dotnet", ["run", "--no-launch-profile", "--project", "tests/CulinaryBlog.Search.E2E"], path.dirname(root), process.env);
  let frontend, browser;
  try {
    let apiUrl;
    for (let i = 0; i < 900; i++) {
      apiUrl = api.output().match(/SEARCH_E2E_READY (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (apiUrl || api.child.exitCode !== null) break;
      await delay(200);
    }
    assert.ok(apiUrl, api.output());
    const env = { ...process.env, API_INTERNAL_URL: apiUrl, NEXT_PUBLIC_API_URL: apiUrl, NEXT_TELEMETRY_DISABLED: "1" };
    const build = run(process.execPath, [require.resolve("next/dist/bin/next"), "build", "--webpack"], fixture, env);
    assert.equal(await build.exited, 0, build.output());
    const reservation = http.createServer();
    await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
    const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    frontend = run(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], fixture, env);
    let ready = false;
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* starting */ }
      if (frontend.child.exitCode !== null) break;
      await delay(200);
    }
    assert.ok(ready, frontend.output());
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(15000);
    const category = "11111111-1111-4111-8111-111111111111";
    const query = `q=pho%20bo&categoryId=${category}&difficulty=1&maxCookTime=40&servings=2&sortBy=cookTime&sortOrder=asc&pageSize=5`;
    await page.goto(`${origin}/search?${query}`);
    await page.getByRole("heading", { name: "31 công thức cho “pho bo”" }).waitFor();
    const cards = () => page.locator('#search-results a[href^="/recipes/"]').evaluateAll(nodes => [...new Set(nodes.map(n => n.getAttribute("href")))]);
    const first = await cards(); assert.equal(first.length, 5);
    await page.getByRole("link", { name: "Trang 2", exact: true }).click();
    await page.waitForURL(url => url.searchParams.get("page") === "2");
    await page.getByText("Trang 2 / 7", { exact: true }).waitFor();
    const second = await cards(); assert.equal(second.length, 5); assert.ok(second.every(id => !first.includes(id)));
    for (const [key, value] of Object.entries({ q: "pho bo", categoryId: category, difficulty: "1", maxCookTime: "40", minServings: "2", maxServings: "2", sortBy: "cookTime", sortOrder: "asc", pageSize: "5" })) assert.equal(new URL(page.url()).searchParams.get(key), value);
    await page.reload(); await page.getByText("Trang 2 / 7", { exact: true }).waitFor(); assert.deepEqual(await cards(), second);
    await page.goBack(); await page.waitForURL(url => url.searchParams.get("page") !== "2");
    await page.getByText("Trang 1 / 7", { exact: true }).waitFor();
    assert.deepEqual(await cards(), first);
    await page.goForward(); await page.waitForURL(url => url.searchParams.get("page") === "2");
    await page.getByText("Trang 2 / 7", { exact: true }).waitFor();
    await page.locator('[name="maxCookTime"]').fill("35");
    await page.getByRole("button", { name: "Áp dụng tìm kiếm và bộ lọc" }).click();
    await page.waitForURL(url => url.searchParams.get("maxCookTime") === "35" && url.searchParams.get("page") === "1");
    await page.getByRole("heading", { name: "26 công thức cho “pho bo”" }).waitFor();
    await page.locator('[name="minCookTime"]').fill("40");
    await page.getByRole("button", { name: "Áp dụng tìm kiếm và bộ lọc" }).click();
    assert.equal(await page.locator('[name="maxCookTime"]').evaluate(el => el.validity.customError), true);
    assert.equal(new URL(page.url()).searchParams.get("minCookTime"), null);
    await page.locator('[name="minCookTime"]').fill("");
    await page.getByRole("button", { name: "Áp dụng tìm kiếm và bộ lọc" }).click();
    const input = page.getByRole("textbox", { name: "Từ khóa tìm kiếm" });
    await input.dispatchEvent("compositionstart"); await input.fill("phở bò");
    await delay(500); assert.equal(new URL(page.url()).searchParams.get("q"), "pho bo");
    await input.dispatchEvent("compositionend");
    await page.waitForURL(url => url.searchParams.get("q") === "phở bò");
    await page.getByRole("heading", { name: "26 công thức cho “phở bò”" }).waitFor();
    await page.goto(`${origin}/search?q=pho&pageSize=51`);
    await page.getByRole("heading", { name: "Thông tin tìm kiếm không hợp lệ" }).waitFor();
    await page.goto(`${origin}/search?q=khongtimthay`);
    await page.getByRole("heading", { name: "Chưa tìm thấy công thức phù hợp" }).waitFor();
    await page.goto(`${origin}/search?${query}`); await page.setViewportSize({ width: 320, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(fixture, "search-mobile.png"), fullPage: true });
    process.stdout.write("PASS: real API/PostgreSQL FTS, combined filters/sort/pagination, shared URL, history/reload, IME, range validation and 320px.\n");
  } finally {
    if (browser) await browser.close();
    try { await stop(frontend); } finally { await stop(api, true); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
