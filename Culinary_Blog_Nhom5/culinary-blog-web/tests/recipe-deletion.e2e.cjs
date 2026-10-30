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
  let logs = "";
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, API_INTERNAL_URL: `http://127.0.0.1:${backendPort}`, NEXT_PUBLIC_ENABLE_MOCKS: "false" },
  });
  server.stdout.on("data", value => { logs = (logs + value).slice(-10000); });
  server.stderr.on("data", value => { logs = (logs + value).slice(-10000); });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Next.js stopped: " + logs);
      try { if ((await fetch(origin + "/auth/login")).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(250);
    }
    assert.equal(ready, true);
    browser = await chromium.launch({ headless: true,
      ...(process.env.E2E_BROWSER_CHANNEL === "bundled" ? {} : { channel: process.env.E2E_BROWSER_CHANNEL || "chrome" }),
    });
    const context = await browser.newContext();
    const recipe = { id: "77777777-7777-4777-8777-777777777777", title: "Công thức kiểm thử xóa", slug: "deletion-test",
      description: "Mô tả kiểm thử", instructions: "Trộn", status: 0, difficulty: 1, prepTimeMinutes: 1, cookTimeMinutes: 1, servings: 2,
      categoryId: "11111111-1111-4111-8111-111111111111", rowVersion: "AAAAAAAAAAAAAAAAAAAAAA==",
      category: { id: "11111111-1111-4111-8111-111111111111", name: "Món chính" }, author: { id: "owner", displayName: "Deletion Test" } };
    let deleted = false; let deleteStatus = 204; let deleteCalls = 0; let mineCalls = 0; let releaseDelete;
    let activeSession = null;
    await context.route("**/api/v1/**", async route => {
      const request = route.request(); const url = new URL(request.url()); const suffix = url.pathname;
      const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,If-Match,X-Correlation-ID" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const json = (value, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json",
        headers: { ...cors, "Access-Control-Expose-Headers": "ETag", ...headers }, body: JSON.stringify(value) });
      if (suffix === "/api/v1/auth/refresh") return activeSession ? json({ data: activeSession }) : json({ detail: "No session" }, 401);
      if (suffix === "/api/v1/auth/login") {
        const body = request.postDataJSON();
        if (body.password !== "E2e-only-password1!") return json({ detail: "Invalid credentials" }, 401);
        activeSession = { accessToken: "deletion-access", accessTokenExpiry: new Date(Date.now() + 3600000).toISOString(),
          user: { id: "owner", email: body.email, displayName: "Deletion Test" }, roles: ["Author"] };
        return json({ data: activeSession });
      }
      if (suffix === "/api/v1/auth/logout") { activeSession = null; return route.fulfill({ status: 204, headers: cors }); }
      if (request.method() === "DELETE") {
        assert.equal(suffix, "/api/v1/recipes/" + recipe.id);
        assert.equal(request.headers().authorization, "Bearer deletion-access");
        deleteCalls++;
        if (releaseDelete) await releaseDelete;
        if (deleteStatus !== 204) return json({ status: deleteStatus, detail: "Test deletion failure" }, deleteStatus);
        deleted = true; return route.fulfill({ status: 204, headers: cors });
      }
      if (suffix.endsWith("/mine")) {
        mineCalls++;
        return json({ data: deleted ? [] : [recipe], meta: { page: 1, pageSize: 12, totalCount: deleted ? 0 : 1,
          totalPages: deleted ? 0 : 1, hasNextPage: false, hasPreviousPage: false } });
      }
      if (suffix.endsWith("/ingredients")) return json({ data: [] }, 200, { ETag: '"' + recipe.rowVersion + '"' });
      if (suffix.endsWith("/images")) return json({ data: [] });
      if (suffix === "/api/v1/recipes/" + recipe.id) return json(deleted ? { status: 404 } : { data: recipe }, deleted ? 404 : 200);
      return json([]);
    });
    const page = await context.newPage(); const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    assert.match((await context.request.get(origin + "/search")).headers()["cache-control"], /no-store/);
    await page.goto(origin + "/auth/login?callbackUrl=/dashboard/recipes");
    await page.locator("#login-email").fill("owner@test.invalid");
    await page.locator("#login-password").fill("E2e-only-password1!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/dashboard/recipes");
    await page.goto(origin + "/dashboard/recipes");
    await page.getByText(recipe.title, { exact: true }).waitFor({ timeout: 10000 }).catch(async error => {
      console.error("Page:", page.url(), "Body:", await page.locator("body").innerText(), "API calls:", mineCalls);
      throw error;
    });
    await page.getByRole("link", { name: "Sửa", exact: true }).click();
    await page.getByRole("heading", { name: "Chỉnh sửa công thức", exact: true }).waitFor();
    const openDialog = async () => {
      await page.getByRole("button", { name: "Xóa công thức", exact: true }).click();
      await page.getByRole("alertdialog", { name: "Xóa công thức?" }).waitFor();
    };
    await openDialog();
    await page.getByRole("button", { name: "Hủy", exact: true }).click();
    assert.equal(deleteCalls, 0);
    await openDialog(); await page.keyboard.press("Escape");
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    assert.equal(deleteCalls, 0);

    for (const [status, message] of [[403, "Bạn không có quyền xóa công thức này."],
      [404, "Công thức không còn tồn tại hoặc đã bị xóa."],
      [409, "Công thức vừa được thay đổi. Hãy tải lại trang và kiểm tra trước khi xóa."],
      [500, "Máy chủ đang gặp sự cố. Vui lòng thử lại sau."]]) {
      deleteStatus = status; await openDialog();
      await page.getByRole("alertdialog").getByRole("button", { name: "Xóa công thức", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: message }).waitFor({ timeout: 5000 }).catch(async error => {
        console.error("Delete status", status, "visible alerts:", await page.getByRole("alert").allInnerTexts());
        throw error;
      });
      await page.getByRole("alertdialog").waitFor({ state: "hidden" });
      assert.equal(deleted, false);
      assert.equal(await page.getByRole("heading", { name: "Nguyên liệu", exact: true }).count(), 1, "Duplicate editor child keys grew the ingredient manager");
    }
    deleteStatus = 204;
    let unblock; releaseDelete = new Promise(resolve => { unblock = resolve; });
    await openDialog();
    const folder = path.join(root, "build", "recipe-deletion-e2e"); fs.mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, "confirm-delete.png") });
    // Two synchronous clicks exercise the ref guard before React commits disabled state.
    await page.getByRole("alertdialog").getByRole("button", { name: "Xóa công thức", exact: true })
      .evaluate(button => { button.click(); button.click(); });
    await page.getByRole("button", { name: "Đang xóa...", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Hủy", exact: true }).isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("alertdialog").isVisible(), true);
    unblock();
    await page.waitForURL(url => url.pathname === "/dashboard/recipes");
    await page.getByRole("status").filter({ hasText: "Đã xóa công thức." }).waitFor();
    await page.getByText("Chưa có công thức nào", { exact: true }).waitFor({ timeout: 5000 }).catch(async error => {
      console.error("Deleted list:", await page.locator("body").innerText(), "mine calls:", mineCalls, "page errors:", errors);
      throw error;
    });
    assert.equal(deleteCalls, 5); assert.ok(mineCalls >= 2, "Managed recipes cache was not refreshed");
    await page.screenshot({ path: path.join(folder, "deleted-list.png"), fullPage: true });
    assert.deepEqual(errors, []);
    console.log("PASS: Chrome/Next.js cancel/Escape, 403/404/409/500 messages, duplicate-click guard, pending dialog, 204 redirect and cached-list refresh.");
  } catch (error) { console.error(logs); throw error; }
  finally { if (browser) await browser.close(); server.kill(); await new Promise(resolve => backend.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
