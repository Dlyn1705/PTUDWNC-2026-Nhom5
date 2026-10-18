/* eslint-disable @typescript-eslint/no-require-imports -- Standalone production Next.js/Chrome test runner. */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function listen(server) { return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port))); }

async function main() {
  const tokens = new Map();
  const backend = http.createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    let body; try { body = raw ? JSON.parse(raw) : {}; } catch { response.writeHead(400).end(); return; }
    const send = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    const issue = () => {
      const refresh = "deletion-refresh-" + randomUUID();
      tokens.set(refresh, true);
      return { refresh, data: { accessToken: "deletion-access", accessTokenExpiry: new Date(Date.now() + 3600000).toISOString(),
        user: { id: "owner", email: "owner@test.invalid", displayName: "Deletion Test" }, roles: ["Author"] } };
    };
    if (request.url === "/api/v1/auth/login") {
      if (body.password !== "E2e-only-password1!") return send(401, { detail: "Invalid credentials" });
      const result = issue(); response.setHeader("Set-Cookie", `culinary_refresh_token=${result.refresh}; Expires=${new Date(Date.now() + 3600000).toUTCString()}; HttpOnly; Path=/api/v1/auth; SameSite=Lax`);
      return send(200, { data: result.data });
    }
    if (request.url === "/api/v1/auth/refresh") {
      if (!tokens.has(body.refreshToken)) return send(401, { detail: "Refresh rejected" });
      tokens.delete(body.refreshToken); const result = issue(); response.setHeader("Set-Cookie", `culinary_refresh_token=${result.refresh}; Expires=${new Date(Date.now() + 3600000).toUTCString()}; HttpOnly; Path=/api/v1/auth; SameSite=Lax`);
      return send(200, { data: result.data });
    }
    if (request.url === "/api/v1/auth/logout") { tokens.delete(body.refreshToken); response.writeHead(204).end(); return; }
    send(200, { data: [], meta: { page: 1, pageSize: 12, totalCount: 0, totalPages: 0 } });
  });
  const backendPort = await listen(backend);
  const reservation = http.createServer();
  const port = await new Promise(resolve => reservation.listen(0, "127.0.0.1", () => resolve(reservation.address().port)));
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const secret = randomUUID() + randomUUID();
  let logs = "";
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true", API_INTERNAL_URL: `http://127.0.0.1:${backendPort}`, NEXT_PUBLIC_ENABLE_MOCKS: "false" },
  });
  server.stdout.on("data", value => { logs = (logs + value).slice(-10000); });
  server.stderr.on("data", value => { logs = (logs + value).slice(-10000); });
  let browser; let context;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Next.js stopped: " + logs);
      try { if ((await fetch(origin + "/api/auth/csrf", { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(250);
    }
    assert.equal(ready, true);
    browser = await chromium.launch({ headless: true,
      ...(process.env.E2E_BROWSER_CHANNEL === "bundled" ? {} : { channel: process.env.E2E_BROWSER_CHANNEL || "chrome" }),
    });
    context = await browser.newContext();
    const recipe = { id: "77777777-7777-4777-8777-777777777777", title: "Công thức kiểm thử xóa", slug: "deletion-test",
      description: "Mô tả kiểm thử", instructions: "Trộn", status: 0, difficulty: 1, prepTimeMinutes: 1, cookTimeMinutes: 1, servings: 2,
      categoryId: "11111111-1111-4111-8111-111111111111", rowVersion: "AAAAAAAAAAAAAAAAAAAAAA==",
      category: { id: "11111111-1111-4111-8111-111111111111", name: "Món chính" }, author: { id: "owner", displayName: "Deletion Test" } };
    let putStatus = 200; let putCalls = 0; let createCalls = 0;
    const ingredients = [];
    const category = { id: recipe.categoryId, name: "Món chính" };
    await context.route("**/api/v1/**", async route => {
      const request = route.request(); const url = new URL(request.url());
      const json = (value, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json",
        headers: { "Access-Control-Expose-Headers": "ETag", ...headers }, body: JSON.stringify(value) });
      if (request.method() === "PUT" && url.pathname === `/api/v1/recipes/${recipe.id}`) {
        putCalls++;
        if (putStatus !== 200) return json({ status: putStatus, detail: "Test conflict" }, putStatus);
        const payload = request.postDataJSON();
        Object.assign(recipe, { ...payload, prepTimeMinutes: payload.prepTime, cookTimeMinutes: payload.cookTime, rowVersion: "Ag==" });
        return json({ data: { id: recipe.id, slug: recipe.slug, rowVersion: recipe.rowVersion } });
      }
      if (request.method() === "POST" && url.pathname.replace(/\/$/, "") === "/api/v1/recipes") {
        createCalls++;
        return json({ data: { id: recipe.id, slug: recipe.slug, rowVersion: recipe.rowVersion } });
      }
      if (url.pathname.endsWith("/ingredients")) {
        if (request.method() === "POST") {
          assert.equal(request.headers()["if-match"], '"' + recipe.rowVersion + '"');
          const ingredient = { ...request.postDataJSON(), id: randomUUID(), recipeId: recipe.id, orderIndex: ingredients.length };
          ingredients.push(ingredient);
          recipe.rowVersion = Buffer.from(`ingredient-version-${ingredients.length}`).toString("base64");
          return json({ success: true, data: ingredient }, 200, { ETag: '"' + recipe.rowVersion + '"' });
        }
        return json({ success: true, data: ingredients }, 200, { ETag: '"' + recipe.rowVersion + '"' });
      }
      if (url.pathname.endsWith("/images")) return json({ success: true, data: [] });
      if (url.pathname.endsWith("/categories")) return json([category]);
      if (url.pathname === `/api/v1/recipes/${recipe.id}`) return json(recipe);
      if (url.pathname.endsWith("/mine")) return json({ data: [recipe], meta: { page: 1, pageSize: 12, totalCount: 1, totalPages: 1 } });
      return json([]);
    });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/login?callbackUrl=/dashboard/recipes");
    await page.locator("#login-email").fill("owner@test.invalid");
    await page.locator("#login-password").fill("E2e-only-password1!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/dashboard/recipes");
    const editUrl = origin + `/dashboard/recipes/${recipe.id}/edit`;
    await page.goto(editUrl);
    await page.locator("#edit-title").waitFor();
    assert.equal(await page.getByRole("main").count(), 1);
    for (const width of [320, 375, 640, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 375, height: 900 });
    const menu = page.getByRole("button", { name: "Mở menu dashboard" });
    await menu.click();
    const dialog = page.getByRole("dialog", { name: "Menu dashboard" });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("link", { name: "Danh mục", exact: true }).count(), 0, "Author must not see admin link");
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Mở menu dashboard");
    await page.locator("#edit-title").fill("");
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    assert.equal(await page.locator("#edit-title").getAttribute("aria-invalid"), "true");
    assert.equal(await page.locator("#edit-title").evaluate(element => element === document.activeElement), true);
    await page.locator("#edit-title-error").waitFor();
    assert.equal(putCalls, 0);
    await page.locator("#edit-title").fill("Bản sửa chưa lưu");
    await menu.click();
    page.once("dialog", prompt => prompt.dismiss());
    await dialog.getByRole("link", { name: "Công thức", exact: true }).click();
    assert.equal(page.url(), editUrl);
    assert.equal(await dialog.isVisible(), true);
    await page.keyboard.press("Escape");
    page.once("dialog", prompt => { assert.equal(prompt.type(), "beforeunload"); return prompt.dismiss(); });
    await page.reload({ timeout: 5000 }).catch(() => {});
    assert.equal(await page.locator("#edit-title").inputValue(), "Bản sửa chưa lưu");
    page.once("dialog", prompt => prompt.dismiss());
    await page.getByRole("button", { name: "Tải bản mới (bỏ thay đổi đang nhập)", exact: true }).click();
    assert.equal(await page.locator("#edit-title").inputValue(), "Bản sửa chưa lưu");
    page.once("dialog", prompt => prompt.accept());
    await page.getByRole("button", { name: "Tải bản mới (bỏ thay đổi đang nhập)", exact: true }).click();
    await page.waitForFunction(title => document.getElementById("edit-title")?.value === title, recipe.title);
    await page.getByRole("button", { name: "Xóa công thức", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Hủy", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.textContent === "Xóa công thức");
    await page.locator("#edit-title").fill("Công thức đã lưu thử nghiệm");
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Đã lưu thay đổi thành công." }).waitFor();
    let unexpectedDialogs = 0;
    const unexpected = prompt => { unexpectedDialogs++; void prompt.dismiss(); };
    page.on("dialog", unexpected);
    await menu.click();
    await dialog.getByRole("link", { name: "Công thức", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/dashboard/recipes");
    page.off("dialog", unexpected);
    assert.equal(unexpectedDialogs, 0, "Saved form should not block navigation");
    await page.goto(editUrl);
    await page.locator("#edit-title").waitFor();
    await page.getByRole("button", { name: "+ Thêm nguyên liệu", exact: true }).click();
    await page.getByRole("textbox", { name: "Tên nguyên liệu", exact: true }).fill("Nguyên liệu chưa lưu");
    await menu.click();
    page.once("dialog", prompt => prompt.dismiss());
    await dialog.getByRole("link", { name: "Công thức", exact: true }).click();
    assert.equal(page.url(), editUrl);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Lưu hàng 1", exact: true }).click();
    await page.getByText("Nguyên liệu 1 — chưa lưu", { exact: true }).waitFor({ state: "hidden" });
    page.on("dialog", unexpected);
    await page.getByRole("button", { name: "Tải bản mới", exact: true }).click();
    await page.getByRole("textbox", { name: "Tên nguyên liệu", exact: true }).waitFor();
    await page.getByRole("button", { name: "Tải bản mới (bỏ thay đổi đang nhập)", exact: true }).click();
    await page.locator("#edit-title").waitFor();
    await page.getByRole("link", { name: "Tạo công thức", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/dashboard/recipes/new");
    page.off("dialog", unexpected);
    assert.equal(unexpectedDialogs, 0, "Saved ingredient must not cause stale dirty prompts");
    await page.locator("#new-title").fill("Bản nháp trước khi Back");
    await page.getByRole("status").filter({ hasText: "Có thay đổi chưa lưu." }).waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.navigation?.currentEntry)), true, "This browser test requires Navigation API history positions");
    page.once("dialog", prompt => prompt.dismiss());
    await page.goBack({ timeout: 5000 }).catch(() => {});
    await page.waitForURL(url => url.pathname === "/dashboard/recipes/new");
    assert.equal(await page.locator("#new-title").inputValue(), "Bản nháp trước khi Back");
    page.once("dialog", prompt => prompt.accept());
    await page.goBack();
    await page.locator("#edit-title").waitFor();
    await page.locator("#edit-title").fill("Giữ bản nháp khi xung đột");
    putStatus = 409;
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Công thức đã được người khác thay đổi" }).waitFor();
    assert.equal(await page.locator("#edit-title").inputValue(), "Giữ bản nháp khi xung đột");
    assert.equal(await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).isDisabled(), true);
    page.once("dialog", prompt => prompt.accept());
    await page.goto(origin + "/dashboard/recipes/new");
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).waitFor();
    await page.locator("#new-category option").nth(1).waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    assert.equal(await page.locator("#new-title").evaluate(element => element === document.activeElement), true);
    assert.equal(createCalls, 0);
    assert.equal(await page.locator("input:not([type=hidden]), textarea, select").evaluateAll(elements => elements.every(element => element.labels?.length || element.getAttribute("aria-label"))), true);
    await page.locator("#new-title").fill("Công thức mới có thể lưu");
    await page.locator("#new-category").selectOption(recipe.categoryId);
    await page.locator("#new-servings").fill("2");
    await page.getByLabel("Chất xơ", { exact: true }).fill("-1");
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.locator("#new-nutrition-4-error").waitFor();
    assert.equal(await page.getByLabel("Chất xơ", { exact: true }).getAttribute("aria-describedby"), "new-nutrition-4-error");
    assert.equal(createCalls, 0);
    await page.getByLabel("Chất xơ", { exact: true }).fill("");
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Đã lưu bản nháp." }).waitFor();
    assert.equal(createCalls, 1);
    assert.equal(await page.locator("#new-title").isDisabled(), true);
    const folder = path.join(root, "build", "lab6-recipe-editor-e2e"); fs.mkdirSync(folder, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(folder, "mobile-recipe-created.png"), fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS: mobile 320/375/640/1024px, author navigation, dialog focus, validation, dirty link/Back/unload/reload cancellation, ingredient drafts, saved navigation, conflict draft preservation, draft creation and labels.");
  } catch (error) { console.error(logs); throw error; }
  finally {
    if (context && server.exitCode === null) {
      try {
        const response = await context.request.get(origin + "/api/auth/csrf");
        const { csrfToken } = await response.json();
        await context.request.post(origin + "/api/auth/signout", { form: { csrfToken, callbackUrl: origin, json: "true" } });
      } catch { /* Stop owned processes even when logout cannot complete. Session TTL still applies. */ }
    }
    if (browser) await browser.close();
    server.kill();
    await new Promise(resolve => backend.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
