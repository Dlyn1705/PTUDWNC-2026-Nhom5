/* eslint-disable @typescript-eslint/no-require-imports -- Production route fixture with real API/PostgreSQL. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const fixture = path.join(root, "build/lifecycle-fixture");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function write(name, content) { const target = path.join(fixture, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
function run(command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", data => { output = (output + data).slice(-20000); });
  child.stderr.on("data", data => { output = (output + data).slice(-20000); });
  const exited = new Promise(resolve => { child.once("exit", resolve); child.once("error", error => { output += error.message; resolve(-1); }); });
  return { child, exited, output: () => output };
}
async function stop(process, graceful = false) {
  if (!process || process.child.exitCode !== null) return;
  if (graceful) process.child.stdin.end("stop\n"); else process.child.kill();
  if (!await Promise.race([process.exited.then(() => true), delay(15000).then(() => false)])) {
    process.child.kill(); throw new Error("Fixture did not stop; verify isolated database cleanup.");
  }
}
async function main() {
  assert.ok(process.env.LIFECYCLE_TEST_CONNECTION, "Set LIFECYCLE_TEST_CONNECTION for an isolated PostgreSQL server.");
  write("package.json", JSON.stringify({ name: "lifecycle-fixture", private: true }));
  write("tsconfig.json", JSON.stringify({ compilerOptions: {
    target: "ES2022", lib: ["dom", "dom.iterable", "esnext"], strict: true, noEmit: true, skipLibCheck: true,
    esModuleInterop: true, module: "esnext", moduleResolution: "bundler", jsx: "react-jsx",
    paths: { "@/*": [root.replaceAll("\\", "/") + "/*"] },
  }, include: ["**/*.tsx", ".next/types/**/*.ts"], exclude: ["node_modules"] }));
  write("next.config.mjs", `export default {webpack(c){c.resolve.alias['@']=${JSON.stringify(root)};return c;}}`);
  for (const name of ["postcss.config.mjs", "app/globals.css"]) write(name, fs.readFileSync(path.join(root, name), "utf8"));
  write("app/layout.tsx", "import './globals.css';import Providers from './providers';export default function Layout({children}:{children:React.ReactNode}){return <html lang='vi'><body><Providers><main>{children}</main></Providers></body></html>}");
  write("app/providers.tsx", `'use client';import {useState,useEffect} from 'react';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {useAuthStore} from '@/store/authStore';
    export default function Providers({children}:{children:React.ReactNode}){const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false}}}));
    useEffect(()=>{useAuthStore.getState().setSession({accessToken:'lifecycle-e2e',accessTokenExpiry:'2099-01-01T00:00:00Z',user:{id:'owner',email:'fixture@example.invalid',displayName:'Lifecycle Test'},roles:['Author']});},[]);
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>}`);
  write("app/page.tsx", "export default function Page(){return <h1>Lifecycle fixture ready</h1>}");
  write("app/dashboard/recipes/page.tsx", "export {default} from '@/app/dashboard/recipes/page';");
  write("app/sitemap.ts", "export {default,dynamic} from '@/app/sitemap';");
  const api = run("dotnet", ["run", "--no-launch-profile", "--project", "tests/CulinaryBlog.Lifecycle.E2E"], path.dirname(root), process.env);
  let frontend, smokeFrontend, browser;
  try {
    let apiUrl;
    for (let i = 0; i < 900; i++) {
      apiUrl = api.output().match(/LIFECYCLE_E2E_READY (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
      if (apiUrl || api.child.exitCode !== null) break;
      await delay(200);
    }
    assert.ok(apiUrl, api.output());
    const env = { ...process.env, API_INTERNAL_URL: apiUrl, NEXT_PUBLIC_API_URL: apiUrl, NEXT_TELEMETRY_DISABLED: "1" };
    const build = run(process.execPath, [require.resolve("next/dist/bin/next"), "build", "--webpack"], fixture, env);
    assert.equal(await build.exited, 0, build.output());
    const reservation = http.createServer(); await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
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
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); page.setDefaultTimeout(15000);
    const row = () => page.getByRole("row").filter({ hasText: "Phở vòng đời" });
    const dialog = () => page.getByRole("alertdialog");
    async function activate(button) {
      await button.focus();
      await page.keyboard.press("Enter");
    }
    async function action(label) {
      await activate(row().getByRole("button", { name: label, exact: true }));
      await activate(dialog().getByRole("button", { name: "Xác nhận", exact: true }));
      await dialog().waitFor({ state: "hidden" });
    }
    const mode = (code, milliseconds = 0) => fetch(`${apiUrl}/fixture/mode/${code}/${milliseconds}`, { method: "POST" });
    await page.goto(origin + "/dashboard/recipes", { waitUntil: "domcontentloaded" }); await row().waitFor();
    await activate(row().getByRole("button", { name: "Xuất bản", exact: true }));
    await activate(dialog().getByRole("button", { name: "Hủy", exact: true }));
    await dialog().waitFor({ state: "hidden" });
    await page.waitForFunction(element => element === document.activeElement,
      await row().getByRole("button", { name: "Xuất bản", exact: true }).elementHandle()).catch(async error => {
      console.error("Focus diagnostic", await page.evaluate(() => ({ tag: document.activeElement?.tagName,
        id: document.activeElement?.id, label: document.activeElement?.textContent?.slice(0, 100) })),
      await row().getByRole("button", { name: "Xuất bản", exact: true }).evaluate(element => ({ disabled: element.disabled, connected: element.isConnected })));
      throw error;
    });
    assert.equal(await (await fetch(apiUrl + "/fixture/calls")).json(), 0);
    await mode(0, 400);
    await activate(row().getByRole("button", { name: "Xuất bản", exact: true }));
    await activate(dialog().getByRole("button", { name: "Xác nhận", exact: true }));
    assert.ok(await dialog().getByRole("button", { name: "Đang cập nhật…", exact: true }).isDisabled());
    await dialog().waitFor({ state: "hidden" });
    assert.equal(await (await fetch(apiUrl + "/fixture/calls")).json(), 1);
    await row().getByRole("button", { name: "Hủy xuất bản", exact: true }).waitFor();
    assert.ok((await (await fetch(origin + "/sitemap.xml")).text()).includes("lifecycle-0"));
    await mode(0); await action("Hủy xuất bản");
    assert.ok(!(await (await fetch(origin + "/sitemap.xml")).text()).includes("lifecycle-0"));
    await action("Lưu trữ");
    await activate(page.getByRole("navigation", { name: "Trạng thái công thức" }).getByRole("button", { name: "Lưu trữ", exact: true }));
    await page.waitForURL(url => url.searchParams.get("status") === "2"); await row().waitFor();
    await action("Khôi phục");
    await page.getByRole("heading", { name: "Chưa có công thức ở trạng thái này" }).waitFor();
    await activate(page.getByRole("navigation", { name: "Trạng thái công thức" }).getByRole("button", { name: "Nháp", exact: true }));
    await row().waitFor();
    const missing = page.getByRole("row").filter({ hasText: "Thiếu nguyên liệu" });
    await activate(missing.getByRole("button", { name: "Xuất bản", exact: true }));
    await activate(dialog().getByRole("button", { name: "Xác nhận", exact: true }));
    await dialog().getByRole("alert").waitFor(); assert.ok(await dialog().getByRole("link", { name: "Mở trình chỉnh sửa" }).count());
    assert.ok(!(await page.textContent("body")).includes("SECRET"));
    await activate(dialog().getByRole("button", { name: "Hủy", exact: true }));
    await mode(409);
    await activate(row().getByRole("button", { name: "Lưu trữ", exact: true }));
    await activate(dialog().getByRole("button", { name: "Xác nhận", exact: true }));
    await dialog().getByRole("alert").waitFor();
    assert.ok(!(await page.textContent("body")).includes("SECRET"));
    await page.keyboard.press("Escape"); await dialog().waitFor({ state: "hidden" }); await mode(0);
    await page.goto(origin + "/dashboard/recipes?status=0&page=2", { waitUntil: "domcontentloaded" });
    await page.getByRole("status").filter({ hasText: "Trang 2" }).waitFor();
    await activate(page.getByRole("navigation", { name: "Trạng thái công thức" }).getByRole("button", { name: "Đã xuất bản", exact: true }));
    await page.waitForURL(url => url.searchParams.get("status") === "1" && url.searchParams.get("page") === "1");
    await page.goBack(); await page.waitForURL(url => url.searchParams.get("page") === "2");
    await page.getByRole("status").filter({ hasText: "Trang 2" }).waitFor();
    await page.reload(); await page.getByRole("status").filter({ hasText: "Trang 2" }).waitFor();
    await page.goto(origin + "/dashboard/recipes", { waitUntil: "domcontentloaded" }); await row().waitFor();
    await page.setViewportSize({ width: 320, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await activate(row().getByRole("button", { name: "Xuất bản", exact: true }));
    await page.screenshot({ path: path.join(fixture, "lifecycle-mobile.png") });
    process.stdout.write("PASS: real lifecycle API/PostgreSQL, four confirmations, 422/409, pending/cancel, sitemap visibility, status tabs, URL history/reload and 320px.\n");
    if (process.env.LIFECYCLE_SMOKE_ROOT === "1") {
      assert.ok(fs.existsSync(path.join(root, ".next/BUILD_ID")), "Run npm run build before LIFECYCLE_SMOKE_ROOT=1.");
      const headers = { Authorization: "Bearer lifecycle-e2e" };
      const managed = await (await fetch(apiUrl + "/api/v1/recipes/mine", { headers })).json();
      const recipe = managed.data.find(item => item.slug === "lifecycle-0");
      assert.ok((await fetch(`${apiUrl}/api/v1/recipes/${recipe.id}/publish`, { method: "PATCH", headers })).ok);
      const reserve = http.createServer(); await new Promise(resolve => reserve.listen(0, "127.0.0.1", resolve));
      const smokePort = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
      const smokeOrigin = `http://127.0.0.1:${smokePort}`;
      smokeFrontend = run(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(smokePort), "-H", "127.0.0.1"], root, env);
      let smokeReady = false;
      for (let i = 0; i < 150; i++) {
        try { if ((await fetch(smokeOrigin + "/auth/login")).ok) { smokeReady = true; break; } } catch { /* starting */ }
        if (smokeFrontend.child.exitCode !== null) break;
        await delay(200);
      }
      assert.ok(smokeReady, smokeFrontend.output());
      const smokePage = await browser.newPage();
      for (const route of ["/", "/auth/login", "/recipes", "/recipes/lifecycle-0"]) {
        const response = await smokePage.goto(smokeOrigin + route, { waitUntil: "domcontentloaded" });
        assert.equal(response.status(), 200, route);
        await smokePage.getByRole("heading", { level: 1 }).first().waitFor();
        if (route === "/auth/login") await smokePage.getByRole("heading", { name: "Đăng nhập tài khoản" }).waitFor();
        if (route === "/recipes/lifecycle-0") await smokePage.getByRole("heading", { name: "Phở vòng đời", exact: true }).waitFor();
      }
      assert.ok((await fetch(apiUrl + "/health/live")).ok);
      assert.ok((await fetch(apiUrl + "/health/ready")).ok);
      await smokePage.close();
      process.stdout.write("PASS: README smoke on actual production frontend: home, login, recipe listing/detail, API liveness/readiness.\n");
    }
  } finally {
    if (browser) await browser.close();
    try { await stop(smokeFrontend); } finally {
      try { await stop(frontend); } finally { await stop(api, true); }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
