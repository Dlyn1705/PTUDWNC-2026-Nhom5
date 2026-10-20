/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Next.js production/Chrome runner. */
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { randomUUID, randomBytes, createHash, createCipheriv } = require("node:crypto");
const { chromium } = require("playwright");
const { createClient } = require("redis");
const root = path.resolve(__dirname, "..");
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const reservation = http.createServer();
  const port = await new Promise(resolve => reservation.listen(0, "127.0.0.1", () => resolve(reservation.address().port)));
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`; const secret = randomUUID() + randomUUID();
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true", NEXT_PUBLIC_ENABLE_MOCKS: "false" },
  });
  let logs = ""; server.stdout.on("data", data => { logs = (logs + data).slice(-10000); }); server.stderr.on("data", data => { logs = (logs + data).slice(-10000); });
  let browser; let redis; let sessionKey;
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error("Next.js stopped");
      try { if ((await fetch(origin + "/api/auth/csrf")).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(250);
    }
    assert.equal(ready, true);
    browser = await chromium.launch({ headless: true, ...(process.env.E2E_BROWSER_CHANNEL === "bundled" ? {} : { channel: process.env.E2E_BROWSER_CHANNEL || "chrome" }) });
    const context = await browser.newContext(); const { encode } = await import("next-auth/jwt");
    const backendSessionId = randomBytes(32).toString("base64url");
    sessionKey = `culinary:auth:v1:{${backendSessionId}}`;
    const expiry = Date.now() + 3600000;
    const stored = { session: {
      user: { id: "owner", displayName: "Steps Test", email: "steps@test.invalid" },
      roles: ["Author"], accessToken: "test-steps-access", accessTokenExpiry: new Date(expiry).toISOString(),
    }, refreshToken: "steps-test-refresh", refreshTokenExpiry: expiry, state: "active", version: 0 };
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(`culinary-server-session-v1:${secret}`).digest(), nonce);
    cipher.setAAD(Buffer.from(backendSessionId));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(stored), "utf8"), cipher.final()]);
    const sealed = Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
    redis = createClient({ url: process.env.AUTH_REDIS_URL || "redis://127.0.0.1:6379" });
    await redis.connect();
    await redis.set(sessionKey, sealed, { PX: 3600000 });
    const cookie = "authjs.session-token";
    await context.addCookies([{ name: cookie, domain: "127.0.0.1", path: "/", secure: false, httpOnly: true, sameSite: "Lax",
      value: await encode({ secret, salt: cookie, maxAge: 3600, token: { backendSessionId } }),
    }]);
    const recipeId = "77777777-7777-4777-8777-777777777777";
    const category = { id: "11111111-1111-4111-8111-111111111111", name: "Món chính", slug: "mon-chinh", recipeCount: 1 };
    const recipe = { id: recipeId, title: "Công thức thử bước", slug: "steps-test", description: "Test", instructions: "Legacy",
      prepTimeMinutes: 1, cookTimeMinutes: 1, servings: 2, difficulty: 1, status: 0, categoryId: category.id,
      category, author: { id: "owner", displayName: "Steps Test" }, images: [], ingredients: [], steps: [] };
    let version = 1; const versionText = () => Buffer.alloc(16, version).toString("base64");
    let steps = []; let writes = 0; let failConflict = false; let holdWrite; let createdPayload;
    await context.route("**/api/v1/**", async route => {
      const request = route.request(); const url = new URL(request.url()); const endpoint = url.pathname;
      const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", headers: {
        "Access-Control-Expose-Headers": "ETag", ETag: '"' + versionText() + '"', "Cache-Control": "no-store" }, body: JSON.stringify(value) });
      if (endpoint.startsWith("/api/v1/categories")) return json({ data: [category] });
      if (endpoint.endsWith("/ingredients") || endpoint.endsWith("/images")) return json({ success: true, data: [] });
      if ((endpoint === "/api/v1/recipes" || endpoint === "/api/v1/recipes/") && request.method() === "POST") {
        createdPayload = request.postDataJSON();
        recipe.status = 0; steps = createdPayload.steps.map((step, index) => ({ ...step, id: randomUUID(), recipeId, stepNumber: index + 1, title: step.title || `Bước ${index + 1}` }));
        version++; return json({ data: { id: recipeId, slug: recipe.slug, rowVersion: versionText() } }, 201);
      }
      if (endpoint === `/api/v1/recipes/${recipeId}`) return json({ ...recipe, rowVersion: versionText() });
      if (endpoint.includes("/steps")) {
        if (request.method() === "GET") return json({ success: true, data: steps });
        writes++;
        if (holdWrite) await holdWrite;
        assert.equal(request.headers().authorization, "Bearer test-steps-access");
        const input = request.postData() ? request.postDataJSON() : null;
        if (failConflict) { failConflict = false; version++; return json({ status: 409, detail: "Version cũ" }, 409); }
        if (request.headers()["if-match"] !== '"' + versionText() + '"') return json({ status: 409, detail: "Version cũ" }, 409);
        if (endpoint.endsWith("/reorder")) {
          steps = input.stepIds.map((id, i) => ({ ...steps.find(s => s.id === id), stepNumber: i + 1 })); version++;
          return json({ success: true, data: steps });
        }
        if (request.method() === "DELETE") {
          steps = steps.filter(s => s.id !== endpoint.split("/").at(-1)).map((s, i) => ({ ...s, stepNumber: i + 1 })); version++;
          return route.fulfill({ status: 204, headers: { "Access-Control-Expose-Headers": "ETag", ETag: '"' + versionText() + '"' } });
        }
        assert.equal("stepNumber" in input, false);
        let item;
        if (request.method() === "POST") {
          item = { ...input, id: randomUUID(), recipeId, stepNumber: steps.length + 1, title: input.title || `Bước ${steps.length + 1}` };
          steps.push(item);
        } else {
          item = { ...steps.find(s => s.id === endpoint.split("/").at(-1)), ...input };
          steps = steps.map(s => s.id === item.id ? item : s);
        }
        version++; return json({ success: true, data: item }, request.method() === "POST" ? 201 : 200);
      }
      return json({ data: [], meta: { page: 1, pageSize: 12, totalCount: 0, totalPages: 0 } });
    });
    const page = await context.newPage(); const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + `/dashboard/recipes/${recipeId}/edit`);
    const manager = page.getByRole("region", { name: "Quản lý các bước thực hiện" });
    const add = manager.getByRole("button", { name: "+ Thêm bước tiếp theo", exact: true });
    try { await add.waitFor({ timeout: 10000 }); }
    catch {
      const sessionResponse = await context.request.get(origin + "/api/auth/session");
      const session = await sessionResponse.json();
      throw new Error(`Step editor unavailable: url=${page.url()} user=${session?.user?.id ?? "none"} role=${session?.user?.role ?? "none"} error=${session?.error ?? "none"} page=${(await page.locator("body").innerText()).slice(0, 500)}`);
    }
    await add.click();
    await manager.getByRole("button", { name: "Lưu bước 1", exact: true }).click();
    await manager.getByRole("alert").filter({ hasText: "Vui lòng nhập mô tả bước." }).waitFor(); assert.equal(writes, 0);
    await page.getByLabel("Tên món ăn", { exact: true }).fill("Nội dung chưa lưu");
    await manager.getByLabel("Tiêu đề bước 1", { exact: true }).fill("Sơ chế");
    await manager.getByLabel("Mô tả bước 1", { exact: true }).fill("Rửa rau");
    await manager.getByLabel("Hẹn giờ bước 1 (phút, tùy chọn)", { exact: true }).fill("0");
    let unblock; holdWrite = new Promise(resolve => { unblock = resolve; });
    await manager.getByRole("button", { name: "Lưu bước 1", exact: true }).evaluate(button => { button.click(); button.click(); });
    await manager.locator("fieldset[disabled]").waitFor(); unblock(); holdWrite = null;
    await manager.getByText("Đã lưu các bước.", { exact: true }).waitFor();
    assert.equal(writes, 1); assert.equal(steps[0].timerMinutes, 0);
    assert.equal(await page.getByLabel("Tên món ăn", { exact: true }).inputValue(), "Nội dung chưa lưu");
    await add.click(); await manager.getByLabel("Mô tả bước 2", { exact: true }).fill("Nấu rau");
    await manager.getByRole("button", { name: "Lưu bước 2", exact: true }).click();
    await manager.getByLabel("Tiêu đề bước 2", { exact: true }).filter({ visible: true }).waitFor();
    await manager.getByRole("button", { name: "Di chuyển bước 2 lên", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Quản lý các bước thực hiện"] input')?.value === "Bước 2");
    assert.equal(steps[0].description, "Nấu rau");
    await manager.getByLabel("Mô tả bước 1", { exact: true }).fill("Draft chưa lưu");
    await manager.getByRole("button", { name: "Di chuyển bước 1 xuống", exact: true }).click();
    await manager.getByRole("alert").filter({ hasText: "Lưu các bước mới" }).waitFor();
    failConflict = true;
    await manager.getByRole("button", { name: "Lưu bước 1", exact: true }).click();
    await manager.getByRole("alert").filter({ hasText: "Công thức đã thay đổi" }).waitFor();
    assert.equal(await manager.getByLabel("Mô tả bước 1", { exact: true }).inputValue(), "Draft chưa lưu");
    page.once("dialog", dialog => dialog.accept());
    await manager.getByRole("button", { name: "Tải các bước mới", exact: true }).click();
    await manager.getByRole("button", { name: "Lưu bước 1", exact: true }).waitFor();
    page.once("dialog", dialog => dialog.accept());
    await manager.getByRole("button", { name: "Xóa bước 1", exact: true }).click();
    await manager.locator("[data-step-row]").nth(1).waitFor({ state: "hidden" });
    assert.equal(steps.length, 1); assert.equal(steps[0].stepNumber, 1);
    recipe.status = 1;
    page.once("dialog", dialog => { assert.equal(dialog.type(), "beforeunload"); return dialog.accept(); });
    await page.reload();
    await page.getByText("Hãy hủy xuất bản trước khi xóa bước cuối cùng.", { exact: true }).waitFor();
    assert.equal(await manager.getByRole("button", { name: "Xóa bước 1", exact: true }).isDisabled(), true);
    const folder = path.join(root, "build", "steps-e2e"); fs.mkdirSync(folder, { recursive: true });
    await manager.screenshot({ path: path.join(folder, "published-step-manager.png") });

    // The same component supports purely local rows on the creation form.
    await page.goto(origin + "/dashboard/recipes/new");
    await manager.getByRole("button", { name: "+ Thêm bước tiếp theo", exact: true }).click();
    await manager.getByLabel("Mô tả bước 1", { exact: true }).fill("Local draft");
    await manager.getByRole("button", { name: "+ Thêm bước tiếp theo", exact: true }).click();
    await manager.getByLabel("Mô tả bước 2", { exact: true }).fill("Local second");
    await manager.getByRole("button", { name: "Di chuyển bước 2 lên", exact: true }).click();
    assert.equal(await manager.getByLabel("Mô tả bước 1", { exact: true }).inputValue(), "Local second");
    await manager.getByRole("button", { name: "Xóa bước 1", exact: true }).click();
    await manager.getByRole("button", { name: "Xóa bước 1", exact: true }).click();
    assert.equal(await manager.locator("[data-step-row]").count(), 0);
    assert.equal(createdPayload, undefined); // Local editing never sends a child request before Recipe exists.
    await manager.getByRole("button", { name: "+ Thêm bước tiếp theo", exact: true }).click();
    await manager.getByLabel("Tiêu đề bước 1", { exact: true }).fill("Chuẩn bị");
    await manager.getByLabel("Mô tả bước 1", { exact: true }).fill("Nested create");
    await manager.getByLabel("Hẹn giờ bước 1 (phút, tùy chọn)", { exact: true }).fill("3");
    await page.getByPlaceholder("Ví dụ: Phở bò truyền thống", { exact: true }).fill("Công thức mới");
    await page.getByRole("combobox").first().selectOption(category.id);
    await page.getByPlaceholder("4", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.getByText("Đã lưu bản nháp.", { exact: false }).waitFor();
    await manager.getByRole("button", { name: "Lưu bước 1", exact: true }).waitFor();
    assert.equal(createdPayload.steps[0].timerMinutes, 3); assert.equal(createdPayload.steps[0].title, "Chuẩn bị");
    assert.equal("stepNumber" in createdPayload.steps[0], false);
    assert.deepEqual(errors, []);
    console.log("PASS: production Next.js/Chrome step form validation, create-local mode, persistent CRUD/reorder, 0-minute timer, duplicate submit, preserved basic draft, 409 recovery and Published last-step protection.");
  } catch (error) { console.error(logs); throw error; }
  finally {
    if (browser) await browser.close();
    if (redis) { if (sessionKey) await redis.del(sessionKey); await redis.quit(); }
    server.kill();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
