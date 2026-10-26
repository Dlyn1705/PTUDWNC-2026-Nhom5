/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Next production fixture, no test routes in the shipped app. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const fixture = path.join(root, "build", "route-state-fixture");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
function write(name, text) {
  const target = path.join(fixture, name);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text);
}
function copy(source, target = source) { write(target, fs.readFileSync(path.join(root, source), "utf8")); }
function next(args, env) {
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), ...args], {
    cwd: fixture, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", chunk => { output = (output + chunk).slice(-12000); });
  child.stderr.on("data", chunk => { output = (output + chunk).slice(-12000); });
  return { child, output: () => output };
}

async function main() {
  // Same production boundaries/components; only route content and data sources are fixtures.
  fs.mkdirSync(fixture, { recursive: true });
  write("package.json", JSON.stringify({ name: "route-state-fixture", private: true }));
  write("tsconfig.json", JSON.stringify({ compilerOptions: {
    target: "ES2022", lib: ["dom", "dom.iterable", "esnext"], strict: true, noEmit: true,
    esModuleInterop: true, module: "esnext", moduleResolution: "bundler", jsx: "react-jsx",
    skipLibCheck: true, resolveJsonModule: true, paths: { "@/*": [root.replaceAll("\\", "/") + "/*"] },
  }, include: ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts", path.join(root, "types/**/*.d.ts")], exclude: ["node_modules"] }));
  write("next.config.mjs", `export default {images:{unoptimized:true},experimental:{externalDir:true},webpack(config){config.resolve.alias['@']=${JSON.stringify(root)};return config;}};`);
  copy("postcss.config.mjs"); copy("app/globals.css"); copy("types/next-auth.d.ts");
  for (const file of ["error", "global-error", "not-found", "loading"]) copy(`app/${file}.tsx`);
  for (const segment of ["search", "recipes", "dashboard"]) {
    copy(`app/${segment}/error.tsx`); copy(`app/${segment}/loading.tsx`);
  }
  copy("app/dashboard/categories/loading.tsx");
  write("app/layout.tsx", `import { cookies } from 'next/headers'; import './globals.css';
    export default async function Layout({children}:{children:React.ReactNode}) {
      if ((await cookies()).get('fault')?.value === 'root') throw new Error('SECRET root failure');
      return <html lang="vi"><body>{children}</body></html>;
    }`);
  write("app/page.tsx", "export default function Page(){return <main><h1>Fixture ready</h1></main>}");
  write("app/search/layout.tsx", "export default function Layout({children}:{children:React.ReactNode}){return <main>{children}</main>}");
  write("app/search/page.tsx", "export {default} from '@/app/search/page';");
  write("app/recipes/layout.tsx", "export default function Layout({children}:{children:React.ReactNode}){return <><header>Recipe shell</header><main>{children}</main></>}");
  write("app/recipes/page.tsx", `import {cookies} from 'next/headers';
    export default async function Page(){const fault=(await cookies()).get('fault')?.value;
      if(fault==='page') throw new Error('SECRET page failure');
      if(fault==='slow') await new Promise(r=>setTimeout(r,1500));
      return <h1>Recipe recovered</h1>;}`);
  write("app/dashboard/layout.tsx", `import {cookies} from 'next/headers';import Providers from '../providers';
    export default async function Layout({children}:{children:React.ReactNode}){
      if((await cookies()).get('fault')?.value==='dashboard-layout')throw new Error('SECRET layout');
      return <Providers><header>Dashboard shell</header><main>{children}</main></Providers>;}`);
  write("app/providers.tsx", `'use client';import {useState} from 'react';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    export default function Providers({children}:{children:React.ReactNode}){const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:false}}}));
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;}`);
  write("app/dashboard/categories/page.tsx", "export {default} from '@/app/dashboard/categories/page';");
  write("app/retry/page.tsx", `'use client';import {ErrorState} from '@/components/common/ErrorState';
    export default function Page(){return <main><ErrorState correlationId="retry-id" onRetry={async()=>{await new Promise(r=>setTimeout(r,100));throw new Error('SECRET retry')}} /></main>}`);

  let mode = "failure";
  const searchRequests = [];
  const backend = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url.startsWith("/api/v1/categories")) return res.end(JSON.stringify({ success: true, data: [] }));
    if (mode === "failure" || mode === "forbidden") {
      res.statusCode = mode === "forbidden" ? 403 : 503;
      res.setHeader("X-Correlation-ID", "search-request-id");
      return res.end(JSON.stringify({ detail: "SECRET backend exception", correlationId: "body-id" }));
    }
    searchRequests.push(req.url);
    const page = Number(new URL(req.url, "http://fixture").searchParams.get("page") || 1);
    if (mode === "cards") return res.end(JSON.stringify({ data: [{
      id: "11111111-1111-1111-1111-111111111111", title: "Phở bò kiểm thử", slug: "pho-bo-kiem-thu",
      description: "Món ăn thử", prepTime: 5, cookTime: 20, servings: 2, difficulty: "Easy", createdAt: "2026-10-25T00:00:00Z",
      category: { id: "22222222-2222-2222-2222-222222222222", name: "Món nước", slug: "mon-nuoc" },
      author: { id: "owner", displayName: "Tác giả" }, relevanceScore: 0.8,
    }], meta: { page: 1, pageSize: 12, totalCount: 1, totalPages: 1 } }));
    // The public search endpoint returns PagedResult directly, without an ApiResponse wrapper.
    res.end(JSON.stringify({ data: [], meta: { page, pageSize: 12, totalCount: 30, totalPages: 3 } }));
  });
  const apiPort = await listen(backend);
  const env = { ...process.env, API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`, NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`, NEXT_TELEMETRY_DISABLED: "1" };
  let running; let browser;
  try {
    process.stdout.write("Building isolated production boundary fixture…\n");
    const build = next(["build", "--webpack"], env);
    const code = await new Promise(resolve => build.child.once("exit", resolve));
    assert.equal(code, 0, build.output());
    const reservation = http.createServer(); const port = await listen(reservation);
    await new Promise(resolve => reservation.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    running = next(["start", "-p", String(port), "-H", "127.0.0.1"], env);
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* starting */ }
      if (running.child.exitCode !== null) break;
      await delay(200);
    }
    assert.ok(ready, running.output());
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const fault = value => context.addCookies([{ name: "fault", value, url: origin }]);
    const noNestedMain = async () => assert.equal(await page.locator("main main").count(), 0);
    await fault("page"); await page.goto(origin + "/recipes");
    await page.getByRole("heading", { name: "Không thể tải công thức", exact: true }).waitFor();
    assert.ok((await page.textContent("body")).includes("Recipe shell")); await noNestedMain();
    assert.ok(!(await page.textContent("body")).includes("SECRET"));
    await fault(""); await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByRole("heading", { name: "Recipe recovered" }).waitFor();
    process.stdout.write("PASS: segment boundary retry re-fetches server content and keeps layout.\n");

    await fault("root"); await page.goto(origin + "/recipes");
    await page.getByRole("heading", { name: "Không thể tải trang", exact: true }).waitFor();
    assert.equal(await page.locator("html").getAttribute("lang"), "vi");
    assert.equal(await page.locator("main").count(), 1);
    const radius = await page.locator('[role="alert"]:not(#__next-route-announcer__)').evaluate(el => getComputedStyle(el.parentElement).borderRadius);
    assert.notEqual(radius, "0px", "global fallback must load its own stylesheet");
    await page.screenshot({path:path.join(fixture,"global-error-mobile.png"),fullPage:true});
    await fault(""); await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByRole("heading", { name: "Recipe recovered" }).waitFor();
    process.stdout.write("PASS: global boundary has independent styles and a working retry.\n");

    await fault("dashboard-layout"); await page.goto(origin + "/dashboard/categories");
    await page.getByRole("heading", { name: "Không thể tải trang", exact: true }).waitFor();
    assert.ok(!(await page.textContent("body")).includes("Dashboard shell"));
    await fault("");

    await page.goto(origin + "/search?q=pho&sortBy=title&sortOrder=asc&categoryId=category-1");
    await page.getByText("Mã hỗ trợ:", { exact: false }).waitFor();
    assert.ok((await page.textContent("body")).includes("search-request-id"));
    assert.ok(!(await page.textContent("body")).includes("SECRET")); await noNestedMain();
    mode = "success"; await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByRole("heading", { name: "Chưa tìm thấy công thức phù hợp" }).waitFor();
    const href = await page.getByRole("link", { name: "Trang 2", exact: true }).getAttribute("href");
    for (const part of ["q=pho", "sortBy=title", "sortOrder=asc", "categoryId=category-1", "page=2"]) assert.ok(href.includes(part), href);
    await page.getByRole("link", { name: "Trang 2", exact: true }).click();
    await page.waitForURL(/page=2/); await page.goBack(); await page.waitForURL(url => !url.searchParams.has("page"));
    await page.goto(origin + "/search?q=pho&sortBy=title&sortOrder=asc");
    const searchInput = page.getByRole("textbox", { name: "Từ khóa tìm kiếm" });
    searchRequests.length = 0;
    await searchInput.fill("ban"); await searchInput.fill("banh"); await searchInput.fill("banh xeo");
    await page.waitForURL(url => url.searchParams.get("q") === "banh xeo");
    await page.getByRole("heading", { name: "Chưa tìm thấy công thức phù hợp" }).waitFor();
    assert.equal(searchRequests.length, 1, "rapid typing must debounce into one request");
    assert.equal(new URL(page.url()).searchParams.get("sortBy"), "title");
    searchRequests.length = 0;
    await searchInput.fill("bun bo"); await searchInput.press("Enter");
    await page.waitForURL(url => url.searchParams.get("q") === "bun bo");
    await delay(600);
    assert.equal(searchRequests.length, 1, "Enter must cancel the pending debounce");
    await page.goBack(); await page.waitForURL(url => url.searchParams.get("q") === "banh xeo");
    assert.equal(await searchInput.inputValue(), "banh xeo");
    await page.setViewportSize({ width: 320, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "search must fit a 320px viewport");
    await page.screenshot({path:path.join(fixture,"search-mobile.png"),fullPage:true});
    process.stdout.write("PASS: search debounce, Enter cancellation, filter preservation, history and 320px layout.\n");
    mode = "cards"; await page.goto(origin + "/search?q=pho");
    await page.getByRole("heading", { name: "Phở bò kiểm thử" }).waitFor();
    assert.ok(await page.locator('a[href="/recipes/pho-bo-kiem-thu"]').count());
    assert.ok(!(await page.textContent("body")).includes("Độ phù hợp"));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({path:path.join(fixture,"search-results-desktop.png"),fullPage:true});
    mode = "forbidden"; await page.goto(origin + "/search?q=forbidden");
    await page.locator('[role="alert"]:not(#__next-route-announcer__)').waitFor(); assert.equal(await page.getByRole("button", { name: "Thử lại", exact: true }).count(), 0);
    process.stdout.write("PASS: search metadata, safe error text, refresh, permission state, pagination and history.\n");

    let categoryStatus = 500; let categoryRequests = 0;
    await page.route("**/api/auth/session", route => route.fulfill({ json: null }));
    await page.route("**/api/v1/categories", async route => {
      const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type, X-Correlation-ID", "Access-Control-Expose-Headers": "X-Correlation-ID", "X-Correlation-ID": "category-error-id" };
      if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      categoryRequests++; await delay(250);
      await route.fulfill({ status: categoryStatus, headers, json: categoryStatus === 200 ? { success: true, data: [] } : { detail: "SECRET" } });
    });
    await page.goto(origin + "/dashboard/categories");
    await page.getByRole("heading", { name: "Không thể tải danh mục quản lý" }).waitFor();
    assert.ok(!(await page.textContent("body")).includes("Tổng số danh mục"));
    assert.ok((await page.textContent("body")).includes("category-error-id"));
    categoryStatus = 200; await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByRole("heading", { name: "Chưa có danh mục nào" }).waitFor();
    assert.equal(categoryRequests, 2); await noNestedMain();
    await page.screenshot({path:path.join(fixture,"dashboard-empty-mobile.png"),fullPage:true});
    process.stdout.write("PASS: query failure is not empty/zero statistics; retry GET restores empty success.\n");

    await page.goto(origin + "/retry"); await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByText("Chưa thể tải lại. Vui lòng thử lại sau ít phút.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Thử lại", exact: true }).isEnabled(), true);
    await page.goto(origin + "/missing"); await page.getByRole("heading", { name: "404 — Không tìm thấy trang" }).waitFor();
    assert.ok(await page.locator('meta[name="robots"][content*="noindex"]').count());
    await noNestedMain();
    await fault("slow"); await page.goto(origin + "/recipes", { waitUntil: "commit" });
    await page.getByRole("status").filter({ hasText: "Đang tải công thức" }).waitFor();
    await page.getByRole("heading", { name: "Recipe recovered" }).waitFor();
    process.stdout.write("PASS: rejected retry, 404/noindex and streamed route loading.\n");
  } finally {
    if (browser) await browser.close();
    if (running) { running.child.kill(); await new Promise(resolve => running.child.exitCode !== null ? resolve() : running.child.once("exit", resolve)); }
    await new Promise(resolve => backend.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
