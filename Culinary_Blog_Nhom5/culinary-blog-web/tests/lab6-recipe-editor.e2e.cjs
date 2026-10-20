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
    const issue = (email) => {
      const refresh = "deletion-refresh-" + randomUUID();
      tokens.set(refresh, true);
      return { refresh, data: { accessToken: "deletion-access", accessTokenExpiry: new Date(Date.now() + 3600000).toISOString(),
        user: { id: email === "admin@test.invalid" ? "admin" : "owner", email: email || "owner@test.invalid", displayName: "Editor Test" }, roles: [email === "admin@test.invalid" ? "Admin" : "Author"] } };
    };
    if (request.url === "/api/v1/auth/login") {
      if (body.password !== "E2e-only-password1!") return send(401, { detail: "Invalid credentials" });
      const result = issue(body.email); response.setHeader("Set-Cookie", `culinary_refresh_token=${result.refresh}; Expires=${new Date(Date.now() + 3600000).toUTCString()}; HttpOnly; Path=/api/v1/auth; SameSite=Lax`);
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
  let browser; let context; let adminContext; let page;
  const errors = [];
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
    let createStatus = 200; let mutationErrors = {}; let pendingPut;
    let mineStatus = 200; let mineEmpty = false; let recipeStatus = 200;
    const stepRows = [];
    const ingredients = [];
    const category = { id: recipe.categoryId, name: "Món chính" };
    await context.route("**/api/v1/**", async route => {
      const request = route.request(); const url = new URL(request.url());
      const json = (value, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json",
        headers: { "Access-Control-Expose-Headers": "ETag", ...headers }, body: JSON.stringify(value) });
      if (request.method() === "PUT" && url.pathname === `/api/v1/recipes/${recipe.id}`) {
        putCalls++;
        if (pendingPut) await pendingPut;
        if (putStatus !== 200) return json({ status: putStatus, detail: "PRIVATE_BACKEND_DETAIL", errors: mutationErrors, correlationId: "lab6-save-error" }, putStatus);
        const payload = request.postDataJSON();
        Object.assign(recipe, { ...payload, prepTimeMinutes: payload.prepTime, cookTimeMinutes: payload.cookTime, rowVersion: "Ag==" });
        return json({ data: { id: recipe.id, slug: recipe.slug, rowVersion: recipe.rowVersion } });
      }
      if (request.method() === "POST" && url.pathname.replace(/\/$/, "") === "/api/v1/recipes") {
        createCalls++;
        if (createStatus !== 200) return json({ status: createStatus, errors: mutationErrors, correlationId: "lab6-create-error" }, createStatus);
        const payload = request.postDataJSON();
        ingredients.splice(0, ingredients.length, ...(payload.ingredients || []).map((row, index) => ({ ...row, notes: row.notes || null, id: randomUUID(), recipeId: recipe.id, orderIndex: index })));
        stepRows.splice(0, stepRows.length, ...(payload.steps || []).map((row, index) => ({ ...row, id: randomUUID(), recipeId: recipe.id, stepNumber: index + 1, title: row.title || `Bước ${index + 1}` })));
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
      if (url.pathname.endsWith("/steps")) {
        if (request.method() === "POST") {
          const input = request.postDataJSON();
          const item = { ...input, id: randomUUID(), recipeId: recipe.id, stepNumber: stepRows.length + 1, title: input.title || `Bước ${stepRows.length + 1}` };
          stepRows.push(item);
          recipe.rowVersion = Buffer.from(`step-version-${stepRows.length}`).toString("base64");
          return json({ success: true, data: item }, 200, { ETag: '"' + recipe.rowVersion + '"' });
        }
        return json({ success: true, data: stepRows }, 200, { ETag: '"' + recipe.rowVersion + '"' });
      }
      if (url.pathname.endsWith("/categories")) return json({ success: true, data: [category] });
      if (url.pathname === `/api/v1/recipes/${recipe.id}`) return recipeStatus === 200 ? json(recipe)
        : json({ status: recipeStatus, correlationId: "lab6-editor-load-error" }, recipeStatus);
      if (url.pathname.endsWith("/mine")) {
        if (mineStatus !== 200) return json({ status: mineStatus, correlationId: "lab6-managed-list-error" }, mineStatus);
        const page = Number(url.searchParams.get("page") || 1);
        assert.equal(Number(url.searchParams.get("pageSize") || 12), 12);
        return json({ data: mineEmpty ? [] : [{ ...recipe, title: page === 1 ? recipe.title : "Công thức trang 2" }],
          meta: { page, pageSize: 12, totalCount: mineEmpty ? 0 : 13, totalPages: mineEmpty ? 0 : 2, hasNextPage: page === 1, hasPreviousPage: page > 1 } });
      }
      return json([]);
    });
    page = await context.newPage();
    page.on("console", message => {
      if (message.type() === "error" && /^(TypeError|ReferenceError|Error: Minified React)/.test(message.text())) errors.push(message.text());
    });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/auth/login?callbackUrl=/dashboard/recipes");
    await page.locator("#login-email").fill("owner@test.invalid");
    await page.locator("#login-password").fill("E2e-only-password1!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/dashboard/recipes");
    const pagination = page.getByRole("navigation", { name: "Phân trang công thức quản lý" });
    await pagination.getByRole("button", { name: "Trang sau", exact: true }).click();
    await page.getByRole("cell", { name: "Công thức trang 2", exact: true }).waitFor();
    assert.equal(await pagination.getByRole("button", { name: "Trang sau", exact: true }).isDisabled(), true);
    await pagination.getByRole("button", { name: "Trang trước", exact: true }).click();
    await page.getByRole("cell", { name: recipe.title, exact: true }).waitFor();
    mineStatus = 500;
    await page.reload();
    await page.getByRole("heading", { name: "Không thể tải danh sách công thức", exact: true }).waitFor();
    await page.getByText("lab6-managed-list-error", { exact: true }).waitFor();
    mineStatus = 200;
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.getByRole("cell", { name: recipe.title, exact: true }).waitFor();
    mineEmpty = true;
    await page.reload();
    await page.getByRole("heading", { name: "Chưa có công thức nào", exact: true }).waitFor();
    assert.equal(await pagination.count(), 0);
    mineEmpty = false;
    const editUrl = origin + `/dashboard/recipes/${recipe.id}/edit`;
    recipeStatus = 503;
    await page.goto(editUrl);
    await page.getByRole("heading", { name: "Không thể tải công thức", exact: true }).waitFor();
    await page.getByText("lab6-editor-load-error", { exact: true }).waitFor();
    recipeStatus = 200;
    await page.getByRole("button", { name: "Thử lại", exact: true }).click();
    await page.locator('[id$="-edit-title"]:visible').waitFor();
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
    await page.locator('[id$="-edit-title"]:visible').fill("");
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await page.locator('[id$="-edit-title-error"]:visible').waitFor();
    assert.equal(await page.locator('[id$="-edit-title"]:visible').getAttribute("aria-invalid"), "true");
    await page.waitForFunction(() => {
      const field = document.querySelector('[id$="-edit-title"][aria-invalid="true"]');
      return field && !field.matches(":disabled") && field === document.activeElement;
    });
    await page.locator('[id$="-edit-title-error"]:visible').waitFor();
    assert.equal(putCalls, 0);
    await page.locator('[id$="-edit-title"]:visible').fill("Bản sửa chưa lưu");
    await menu.click();
    page.once("dialog", prompt => prompt.dismiss());
    await dialog.getByRole("link", { name: "Công thức", exact: true }).click();
    assert.equal(page.url(), editUrl);
    assert.equal(await dialog.isVisible(), true);
    await page.keyboard.press("Escape");
    page.once("dialog", prompt => { assert.equal(prompt.type(), "beforeunload"); return prompt.dismiss(); });
    await page.reload({ timeout: 5000 }).catch(() => {});
    assert.equal(await page.locator('[id$="-edit-title"]:visible').inputValue(), "Bản sửa chưa lưu");
    page.once("dialog", prompt => prompt.dismiss());
    await page.getByRole("button", { name: "Tải bản mới (bỏ thay đổi đang nhập)", exact: true }).click();
    assert.equal(await page.locator('[id$="-edit-title"]:visible').inputValue(), "Bản sửa chưa lưu");
    page.once("dialog", prompt => prompt.accept());
    await page.getByRole("button", { name: "Tải bản mới (bỏ thay đổi đang nhập)", exact: true }).click();
    await page.waitForFunction(title => Array.from(document.querySelectorAll('input[id$="-edit-title"]')).find(element => element.checkVisibility())?.value === title, recipe.title);
    await page.getByRole("button", { name: "+ Thêm bước tiếp theo", exact: true }).click();
    await page.getByRole("button", { name: "Lưu bước 1", exact: true }).click();
    const stepDescription = page.getByLabel("Mô tả bước 1", { exact: true });
    assert.equal(await stepDescription.getAttribute("aria-invalid"), "true");
    assert.equal(await stepDescription.evaluate(element => element === document.activeElement), true);
    assert.equal(await stepDescription.evaluate(element => Boolean(document.getElementById(element.getAttribute("aria-describedby")))), true);
    await stepDescription.fill("Bản nháp bước thực hiện chưa lưu");
    await menu.click();
    page.once("dialog", prompt => prompt.dismiss());
    await dialog.getByRole("link", { name: "Công thức", exact: true }).click();
    assert.equal(page.url(), editUrl);
    await page.keyboard.press("Escape");
    page.once("dialog", prompt => prompt.accept());
    await page.getByRole("button", { name: "Tải bản mới (bỏ thay đổi đang nhập)", exact: true }).click();
    await page.locator('[id$="-edit-title"]:visible').waitFor();
    assert.equal(await page.getByLabel("Mô tả bước 1", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Xóa công thức", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Hủy", exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.textContent === "Xóa công thức");
    await page.locator('[id$="-edit-title"]:visible').fill("Bản nháp kiểm tra lỗi API");
    putStatus = 422;
    mutationErrors = { Title: ["Tên công thức chưa được chấp nhận."], PrepTimeMinutes: ["Kiểm tra thời gian chuẩn bị."] };
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await page.locator('[id$="-edit-title-error"]:visible').filter({ hasText: "Tên công thức chưa được chấp nhận." }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id.endsWith("-edit-title"));
    assert.equal(await page.locator('[id$="-edit-title"]:visible').evaluate(element => element === document.activeElement), true);
    await page.locator('[id$="-edit-prepTime-error"]:visible').waitFor();
    assert.equal(await page.locator('[id$="-edit-title"]:visible').inputValue(), "Bản nháp kiểm tra lỗi API");
    mutationErrors = {};
    for (const status of [401, 403, 500]) {
      putStatus = status;
      await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
      const expected = status === 401 ? "Phiên đăng nhập đã hết hạn." : status === 403 ? "Bạn không có quyền lưu công thức này." : "Không thể lưu công thức lúc này.";
      await page.getByRole("alert").filter({ hasText: expected }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Đăng nhập lại", exact: true }).count(), status === 401 ? 1 : 0);
      assert.equal(await page.locator('[id$="-edit-title"]:visible').inputValue(), "Bản nháp kiểm tra lỗi API");
      assert.equal(page.url(), editUrl);
      assert.equal(await page.getByText("PRIVATE_BACKEND_DETAIL", { exact: false }).count(), 0);
      await page.getByText("lab6-save-error", { exact: true }).waitFor();
    }
    putStatus = 200;
    await page.locator('[id$="-edit-title"]:visible').fill("Công thức đã lưu thử nghiệm");
    const beforeDuplicate = putCalls;
    let unblockPut;
    pendingPut = new Promise(resolve => { unblockPut = resolve; });
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.getByRole("button", { name: "Đang lưu...", exact: true }).waitFor();
    unblockPut(); pendingPut = undefined;
    await page.getByRole("status").filter({ hasText: "Đã lưu thay đổi thành công." }).waitFor();
    assert.equal(putCalls, beforeDuplicate + 1);
    let unexpectedDialogs = 0;
    const unexpected = prompt => { unexpectedDialogs++; void prompt.dismiss(); };
    page.on("dialog", unexpected);
    await menu.click();
    await dialog.getByRole("link", { name: "Công thức", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/dashboard/recipes");
    page.off("dialog", unexpected);
    assert.equal(unexpectedDialogs, 0, "Saved form should not block navigation");
    await page.goto(editUrl);
    await page.locator('[id$="-edit-title"]:visible').waitFor();
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
    await page.locator('[id$="-edit-title"]:visible').waitFor();
    await page.getByRole("link", { name: "Tạo công thức", exact: true }).click();
    await page.waitForURL(url => url.pathname === "/dashboard/recipes/new");
    page.off("dialog", unexpected);
    assert.equal(unexpectedDialogs, 0, "Saved ingredient must not cause stale dirty prompts");
    await page.locator('[id$="-new-title"]:visible').fill("Bản nháp trước khi Back");
    await page.getByRole("status").filter({ hasText: "Có thay đổi chưa lưu." }).waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.navigation?.currentEntry)), true, "This browser test requires Navigation API history positions");
    page.once("dialog", prompt => prompt.dismiss());
    await page.goBack({ timeout: 5000 }).catch(() => {});
    await page.waitForURL(url => url.pathname === "/dashboard/recipes/new");
    assert.equal(await page.locator('[id$="-new-title"]:visible').inputValue(), "Bản nháp trước khi Back");
    page.once("dialog", prompt => prompt.accept());
    await page.goBack();
    await page.locator('[id$="-edit-title"]:visible').waitFor();
    await page.locator('[id$="-edit-title"]:visible').fill("Giữ bản nháp khi xung đột");
    putStatus = 409;
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Công thức đã được người khác thay đổi" }).waitFor();
    assert.equal(await page.locator('[id$="-edit-title"]:visible').inputValue(), "Giữ bản nháp khi xung đột");
    assert.equal(await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).isDisabled(), true);
    page.once("dialog", prompt => prompt.dismiss());
    await page.getByRole("button", { name: "Tải bản công thức mới", exact: true }).click();
    assert.equal(await page.locator('[id$="-edit-title"]:visible').inputValue(), "Giữ bản nháp khi xung đột");
    page.once("dialog", prompt => prompt.accept());
    await page.goto(origin + "/dashboard/recipes/new");
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).waitFor();
    await page.locator('select[id$="-new-category"]:visible option').nth(1).waitFor({ state: "attached" });
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.locator('[id$="-new-title-error"]:visible').waitFor();
    await page.waitForFunction(() => {
      const field = document.querySelector('[id$="-new-title"][aria-invalid="true"]');
      return field && !field.matches(":disabled") && field === document.activeElement;
    });
    assert.equal(createCalls, 0);
    assert.equal(await page.locator('[id$="-new-title"]').evaluateAll(elements => new Set(elements.map(element => element.id)).size === elements.length), true, "Cached recipe forms must have distinct field IDs");
    assert.equal(await page.locator("input:not([type=hidden]), textarea, select").evaluateAll(elements => elements.every(element => element.labels?.length || element.getAttribute("aria-label"))), true);
    await page.locator('[id$="-new-title"]:visible').fill("Công thức mới có thể lưu");
    await page.locator('[id$="-new-category"]:visible').selectOption(recipe.categoryId);
    await page.locator('[id$="-new-servings"]:visible').fill("2");
    await page.getByLabel("Chất xơ", { exact: true }).filter({ visible: true }).fill("-1");
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.locator('[id$="-new-nutrition-4-error"]:visible').waitFor();
    assert.equal(await page.getByLabel("Chất xơ", { exact: true }).filter({ visible: true }).getAttribute("aria-describedby"), (await page.getByLabel("Chất xơ", { exact: true }).filter({ visible: true }).getAttribute("id")) + "-error");
    assert.equal(createCalls, 0);
    await page.getByLabel("Chất xơ", { exact: true }).filter({ visible: true }).fill("");
    createStatus = 422;
    mutationErrors = { Title: ["Tên bản nháp cần kiểm tra."], "Nutrition.Protein": ["Protein chưa hợp lệ."] };
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.locator('[id$="-new-title-error"]:visible').filter({ hasText: "Tên bản nháp cần kiểm tra." }).waitFor();
    await page.locator('[id$="-new-nutrition-1-error"]:visible').waitFor();
    await page.getByRole("button", { name: "+ Thêm nguyên liệu", exact: true }).click();
    await page.getByLabel("Tên nguyên liệu", { exact: true }).filter({ visible: true }).fill("Bột");
    await page.getByLabel("Số lượng (tùy chọn)", { exact: true }).filter({ visible: true }).fill("1,25");
    await page.getByLabel("Ghi chú (tùy chọn)", { exact: true }).filter({ visible: true }).fill("Chọn loại mịn");
    await page.getByRole("button", { name: "+ Thêm bước tiếp theo", exact: true }).click();
    await page.getByLabel("Mô tả bước 1", { exact: true }).filter({ visible: true }).fill("Trộn bột");
    mutationErrors = { "Ingredients[0].Name": ["Tên nguyên liệu cần kiểm tra."], "Steps[0].Description": ["Mô tả bước cần kiểm tra."] };
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Tên nguyên liệu cần kiểm tra." }).waitFor();
    await page.getByRole("alert").filter({ hasText: "Mô tả bước cần kiểm tra." }).waitFor();
    await page.waitForFunction(() => document.activeElement?.id.startsWith("ingredient-") && document.activeElement.id.endsWith("-name"));
    createStatus = 200; mutationErrors = {};
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Đã lưu bản nháp." }).waitFor();
    assert.equal(createCalls, 3);
    assert.equal(ingredients[0].quantity, 1.25);
    assert.equal(ingredients[0].notes, "Chọn loại mịn");
    assert.equal(await page.locator('[id$="-new-title"]:visible').isDisabled(), true);
    const folder = path.join(root, "build", "lab6-recipe-editor-e2e"); fs.mkdirSync(folder, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(folder, "mobile-recipe-created.png"), fullPage: true });
    await page.getByRole("status").filter({ hasText: "Có thay đổi chưa lưu." }).filter({ visible: true }).waitFor({ state: "hidden" });
    // Ownership guard and an actual Admin session, independent of the author context.
    recipe.author.id = "another-author";
    await page.goto(editUrl);
    await page.getByRole("heading", { name: "Bạn không có quyền cập nhật công thức này.", exact: true }).waitFor();
    assert.equal(await page.locator('[id$="-edit-title"]:visible').count(), 0);
    adminContext = await browser.newContext({ viewport: { width: 375, height: 900 } });
    // Reuse the deterministic API fixtures, while the Admin session is issued by Auth.js itself.
    await adminContext.route("**/api/v1/**", route => {
      const suffix = new URL(route.request().url()).pathname;
      const data = suffix.endsWith("/categories") ? { success: true, data: [category] }
        : suffix.endsWith("/steps") || suffix.endsWith("/ingredients") || suffix.endsWith("/images") ? { success: true, data: [] } : recipe;
      return route.fulfill({ contentType: "application/json", headers: { "Access-Control-Expose-Headers": "ETag", ETag: '"' + recipe.rowVersion + '"' }, body: JSON.stringify(data) });
    });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(origin + "/auth/login?callbackUrl=" + encodeURIComponent(`/dashboard/recipes/${recipe.id}/edit`));
    await adminPage.locator("#login-email").fill("admin@test.invalid");
    await adminPage.locator("#login-password").fill("E2e-only-password1!");
    await adminPage.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await adminPage.locator('[id$="-edit-title"]:visible').waitFor();
    await adminPage.getByRole("button", { name: "Mở menu dashboard", exact: true }).click();
    await adminPage.getByRole("dialog").getByRole("link", { name: "Danh mục", exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log("PASS: RHF validation and 422 mapping (basic/nutrition/ingredients/steps), 401/403/409/500 recovery, duplicate submit, ownership/Admin, ingredient notes/decimal comma, common states/pagination, mobile focus and unsaved drafts.");
  } catch (error) {
    console.error(logs);
    if (page) console.error("Browser:", page.url(), "UI:", await page.locator("body").innerText().catch(() => "unavailable"), "Errors:", errors);
    throw error;
  }
  finally {
    for (const sessionContext of [context, adminContext].filter(Boolean)) {
    if (server.exitCode === null) {
      try {
        const response = await sessionContext.request.get(origin + "/api/auth/csrf");
        const { csrfToken } = await response.json();
        await sessionContext.request.post(origin + "/api/auth/signout", { form: { csrfToken, callbackUrl: origin, json: "true" } });
      } catch { /* Stop owned processes even when logout cannot complete. Session TTL still applies. */ }
    }
    }
    if (browser) await browser.close();
    server.kill();
    await new Promise(resolve => backend.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
