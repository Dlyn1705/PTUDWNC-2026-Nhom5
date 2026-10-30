// Browser regression for the backend-cookie + in-memory Zustand session.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, "localhost", resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://localhost:${port}`;
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "localhost", "--port", String(port)], {
  windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
let logs = "";
next.stdout.on("data", data => { logs = (logs + data).slice(-10000); });
next.stderr.on("data", data => { logs = (logs + data).slice(-10000); });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (next.exitCode !== null) throw new Error(`Next.js stopped: ${logs}`);
    try { if ((await fetch(`${origin}/auth/login`)).ok) { ready = true; break; } } catch { /* starting */ }
    await pause(250);
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ headless: true,
    ...(process.env.E2E_BROWSER_CHANNEL === "bundled" ? {} : { channel: process.env.E2E_BROWSER_CHANNEL || "chrome" }),
  });
  const context = await browser.newContext();
  const tokens = new Set();
  let refreshes = 0;
  let logoutCalls = 0;
  let resetToken = null;
  let password = "Test-only-password1!";
  let changePasswordCalls = 0;
  let rejectNextManaged = false;
  let profileName = "E2E Chef";
  let profileBio = "";
  let profileAvatar = null;
  let rejectProfileUpdate = false;
  let healthMode = "Healthy";
  let changedRole = false;
  let rejectRoleMutation = false;
  const session = (role, token) => ({
    accessToken: `access-${token}`,
    accessTokenExpiry: new Date(Date.now() + 900_000).toISOString(),
    user: { id: role === "Admin" ? "admin" : "author", email: "chef@example.test", displayName: profileName },
    roles: [role],
  });
  let role = "Author";
  let access = "";
  await context.route(/\/health(?:\/live)?$/, async route => {
    const path = new URL(route.request().url()).pathname;
    const live = path === "/health/live";
    const ok = healthMode !== "Unavailable" || !live;
    const dependencies = { database: "Ready", cache: healthMode === "Healthy" ? "Ready" : "Unavailable", storage: "Ready" };
    await route.fulfill({ status: live ? (healthMode === "Unavailable" ? 503 : 200) : (healthMode === "Healthy" ? 200 : 503),
      headers: { "Access-Control-Allow-Origin": origin, "Content-Type": "application/json" },
      body: JSON.stringify(live ? { status: ok ? "Healthy" : "Unhealthy", probe: "liveness" } :
        { status: healthMode === "Healthy" ? "Healthy" : "Unhealthy", dependencies, connectionString: "SHOULD_NOT_APPEAR" }) });
  });
  await context.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const send = (status, body, extra = {}) => route.fulfill({ status,
      headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
      body: JSON.stringify(body),
    });
    const refreshCookie = request.headers().cookie?.match(/(?:^|; )culinary_refresh_token=([^;]+)/)?.[1];
    if (url.pathname === "/api/v1/auth/login") {
      const payload = request.postDataJSON();
      if (payload.password !== password) return send(401, { detail: "Invalid credentials" });
      role = payload.email === "admin@example.test" ? "Admin" : "Author";
      const token = randomBytes(20).toString("base64url"); tokens.add(token);
      access = `access-${token}`;
      return send(200, { data: session(role, token) }, { "Set-Cookie":
        `culinary_refresh_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` });
    }
    if (url.pathname === "/api/v1/auth/register") {
      const payload = request.postDataJSON();
      assert.equal(payload.confirmPassword, payload.password);
      password = payload.password;
      role = "Author";
      const token = randomBytes(20).toString("base64url"); tokens.add(token);
      access = `access-${token}`;
      return send(201, { data: { ...session(role, token), user: {
        id: "new-author", email: payload.email, displayName: payload.displayName,
      } } }, { "Set-Cookie":
        `culinary_refresh_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` });
    }
    if (url.pathname === "/api/v1/auth/refresh") {
      if (!refreshCookie || !tokens.delete(refreshCookie)) return send(401, { detail: "No session" });
      refreshes++;
      const token = randomBytes(20).toString("base64url"); tokens.add(token);
      access = `access-${token}`;
      return send(200, { data: session(role, token) }, { "Set-Cookie":
        `culinary_refresh_token=${token}; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth` });
    }
    if (url.pathname === "/api/v1/auth/logout") {
      logoutCalls++;
      if (refreshCookie) tokens.delete(refreshCookie);
      return route.fulfill({ status: 204, headers: { ...cors, "Set-Cookie":
        "culinary_refresh_token=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth" } });
    }
    if (url.pathname === "/api/v1/auth/forgot-password") {
      if (request.postDataJSON().email === "chef@example.test") resetToken = randomBytes(20).toString("base64url");
      return send(202, { data: { message: "Nếu email có tài khoản, hướng dẫn đặt lại mật khẩu sẽ được gửi." } });
    }
    if (url.pathname === "/api/v1/auth/reset-password") {
      const payload = request.postDataJSON();
      if (payload.email !== "chef@example.test" || payload.token !== resetToken || !resetToken)
        return send(400, { detail: "Invalid or expired reset token." });
      password = payload.newPassword;
      resetToken = null;
      tokens.clear();
      return route.fulfill({ status: 204, headers: cors });
    }
    if (url.pathname === "/api/v1/auth/change-password") {
      const payload = request.postDataJSON();
      if (request.headers().authorization !== `Bearer ${access}` || payload.currentPassword !== password)
        return send(401, { detail: "Invalid credentials" });
      changePasswordCalls++;
      password = payload.newPassword;
      tokens.clear();
      return route.fulfill({ status: 204, headers: { ...cors, "Set-Cookie":
        "culinary_refresh_token=; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth" } });
    }
    if (url.pathname === "/api/v1/auth/me") {
      if (request.headers().authorization !== `Bearer ${access}`) return send(401, { status: 401, title: "Unauthorized" });
      if (request.method() === "PATCH") {
        if (rejectProfileUpdate) {
          rejectProfileUpdate = false;
          return send(422, { status: 422, title: "Validation failed", errors: { DisplayName: ["Tên chưa hợp lệ"] } });
        }
        const payload = request.postDataJSON();
        profileName = payload.displayName; profileBio = payload.bio; profileAvatar = payload.avatarUrl;
      }
      return send(200, { data: { id: role === "Admin" ? "admin" : "author", email: "chef@example.test",
        displayName: profileName, bio: profileBio, avatarUrl: profileAvatar, roles: [role],
        isActive: true, createdAt: "2026-10-29T00:00:00Z" } });
    }
    if (url.pathname === "/api/v1/admin/users") {
      if (role !== "Admin") return send(403, { status: 403, title: "Forbidden" });
      const users = [{ id: "admin", email: "chef@example.test", displayName: profileName,
        roles: ["Admin"], isActive: true, createdAt: "2026-10-29T00:00:00Z" },
      { id: "author2", email: "author2@example.test", displayName: "Second Author",
        roles: [changedRole ? "Admin" : "Author"], isActive: true, createdAt: "2026-10-28T00:00:00Z" },
      ...Array.from({ length: 20 }, (_, index) => ({ id: `author-extra-${index}`,
        email: `extra${index}@example.test`, displayName: `Extra Author ${index}`,
        roles: ["Author"], isActive: true, createdAt: "2026-10-27T00:00:00Z" }))];
      const filtered = url.searchParams.get("role")
        ? users.filter(user => user.roles.includes(url.searchParams.get("role"))) : users;
      const page = Number(url.searchParams.get("page") || 1);
      return send(200, { data: filtered.slice((page - 1) * 20, page * 20),
        meta: { page, pageSize: 20, totalCount: filtered.length,
          totalPages: Math.ceil(filtered.length / 20), hasNextPage: page * 20 < filtered.length,
          hasPreviousPage: page > 1 } });
    }
    if (url.pathname === "/api/v1/admin/users/author2/roles") {
      if (rejectRoleMutation) {
        rejectRoleMutation = false;
        return send(409, { status: 409, title: "Conflict", code: "ADMIN_LAST_ADMIN" });
      }
      changedRole = request.postDataJSON().role === "Admin";
      return send(200, { data: { id: "author2", email: "author2@example.test", displayName: "Second Author",
        roles: [changedRole ? "Admin" : "Author"], isActive: true, createdAt: "2026-10-28T00:00:00Z" } });
    }
    if (url.pathname === "/api/v1/recipes/mine") {
      if (rejectNextManaged) {
        rejectNextManaged = false;
        return send(401, { detail: "Expired access token" });
      }
      assert.equal(request.headers().authorization, `Bearer ${access}`);
      return send(200, { data: [], meta: { page: 1, pageSize: 12, totalCount: 0, totalPages: 0 } });
    }
    return send(200, { data: [] });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  const assertAccessible = async () => {
    await page.evaluate(axeSource);
    const results = await page.evaluate(async () => window.axe.run("#main-content"));
    assert.deepEqual(results.violations.filter(item => ["serious", "critical"].includes(item.impact))
      .map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), []);
  };
  await page.goto(`${origin}/dashboard`);
  await page.waitForURL("**/auth/login?**");
  assert.equal(new URL(page.url()).searchParams.get("callbackUrl"), "/dashboard");
  const headers = (await page.goto(`${origin}/auth/login?callbackUrl=/dashboard`)).headers();
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.match(headers["content-security-policy"], /'nonce-[^']+'/);
  await page.getByLabel("Địa chỉ email", { exact: true }).fill("chef@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill("Test-only-password1!");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.waitForURL(`${origin}/dashboard`);
  await page.getByRole("heading", { name: /Xin chào, E2E Chef/ }).waitFor();

  await page.goto(`${origin}/profile`);
  await page.getByRole("button", { name: "Menu tài khoản E2E Chef" }).waitFor();
  const cookie = (await context.cookies()).find(item => item.name === "culinary_refresh_token");
  assert.ok(cookie?.httpOnly && cookie.secure && cookie.sameSite === "Lax");
  assert.equal((await page.evaluate(() => document.cookie)).includes("culinary_refresh_token"), false);
  assert.equal(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]).includes("access-")), false);
  const beforeReload = refreshes;
  await page.reload();
  await page.getByRole("heading", { name: "Hồ sơ của tôi" }).waitFor();
  assert.equal(refreshes, beforeReload + 1);
  await assertAccessible();
  rejectProfileUpdate = true;
  await page.getByLabel("Tên hiển thị").fill("Updated Chef");
  await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
  await page.getByRole("alert").getByText(/Thông tin chưa hợp lệ/).waitFor();
  assert.equal(await page.getByLabel("Tên hiển thị").inputValue(), "Updated Chef");
  await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
  await page.getByRole("button", { name: "Menu tài khoản Updated Chef" }).waitFor();
  await page.getByLabel("Giới thiệu").fill("E2E bio");
  await page.getByRole("button", { name: "Lưu hồ sơ" }).click();
  await page.getByText("Đã cập nhật hồ sơ.").first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await assertAccessible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${origin}/dashboard/users`);
  await page.waitForURL(`${origin}/forbidden`);
  await page.goto(`${origin}/dashboard/categories`);
  await page.getByRole("heading", { name: "Truy cập bị từ chối" }).waitFor();

  rejectNextManaged = true;
  const before401 = refreshes;
  await page.goto(`${origin}/dashboard/recipes`);
  await page.getByText("0 công thức").waitFor();
  assert.equal(refreshes, before401 + 2);

  await page.goto(`${origin}/profile`);
  await page.getByRole("button", { name: "Menu tài khoản Updated Chef" }).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await page.waitForURL(`${origin}/auth/login`);
  assert.equal(logoutCalls, 1);
  assert.equal(tokens.size, 0);
  assert.equal((await context.cookies()).some(item => item.name === "culinary_refresh_token"), false);
  await page.goto(`${origin}/profile`);
  await page.waitForURL("**/auth/login?**");
  await page.goto(`${origin}/dashboard/users`);
  await page.waitForURL("**/auth/login?**");
  await page.goto(`${origin}/auth/forgot-password`);
  await page.getByLabel("Địa chỉ email").fill("unknown@example.test");
  await page.getByRole("button", { name: "Gửi hướng dẫn" }).click();
  await page.getByRole("status").getByText(/Nếu email có tài khoản/).waitFor();
  await page.reload();
  await page.getByLabel("Địa chỉ email").fill("chef@example.test");
  await page.getByRole("button", { name: "Gửi hướng dẫn" }).click();
  await page.getByRole("status").getByText(/Nếu email có tài khoản/).waitFor();
  assert.ok(resetToken);
  const usedToken = resetToken;
  await page.goto(`${origin}/auth/reset-password?email=chef%40example.test&token=${usedToken}`);
  await page.getByLabel("Mật khẩu mới").fill("New-password123!");
  await page.getByLabel("Xác nhận mật khẩu").fill("New-password123!");
  await page.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await page.waitForURL("**/auth/login?passwordReset=true");
  await page.goto(`${origin}/auth/reset-password?email=chef%40example.test&token=${usedToken}`);
  await page.getByLabel("Mật khẩu mới").fill("Another-password123!");
  await page.getByLabel("Xác nhận mật khẩu").fill("Another-password123!");
  await page.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await page.getByText(/Liên kết đã hết hạn/).waitFor();
  await page.goto(`${origin}/auth/register?callbackUrl=${encodeURIComponent("//evil.example")}`);
  await page.locator("#displayName").fill("New Author");
  await page.locator("#email").fill("new-author@example.test");
  await page.locator("#password").fill("New-password123!");
  await page.locator("#confirmPassword").fill("New-password123!");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await page.waitForURL(`${origin}/auth/welcome`);
  await page.getByRole("heading", { name: /Chào mừng New Author/ }).waitFor();
  await page.goto(`${origin}/profile`);
  await page.getByLabel("Mật khẩu hiện tại").fill(password);
  await page.getByLabel("Mật khẩu mới").fill("Changed-again123!");
  await page.getByLabel("Xác nhận mật khẩu").fill("Changed-again123!");
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await page.waitForURL("**/auth/login?passwordChanged=true");
  assert.equal(changePasswordCalls, 1);
  assert.equal((await context.cookies()).some(item => item.name === "culinary_refresh_token"), false);
  await page.goto(`${origin}/auth/login`);
  await page.getByLabel("Địa chỉ email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await page.goto(`${origin}/dashboard/users`);
  await page.getByRole("heading", { name: "Người dùng" }).waitFor();
  await assertAccessible();
  assert.equal(await page.getByRole("link", { name: "Người dùng" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Chuyển Author" }).isDisabled(), true);
  await page.getByRole("button", { name: "Trang sau" }).click();
  await page.getByText("Trang 2 / 2").waitFor();
  await page.getByRole("button", { name: "Trang trước" }).click();
  await page.getByText("Second Author").waitFor();
  await page.getByLabel("Lọc vai trò").selectOption("Author");
  await page.getByText("Second Author").waitFor();
  await page.getByLabel("Lọc vai trò").selectOption("");
  await page.getByRole("row", { name: /Second Author/ }).getByRole("button", { name: "Cấp Admin" }).click();
  rejectRoleMutation = true;
  await page.getByRole("alertdialog").getByRole("button", { name: "Xác nhận" }).click();
  await page.getByRole("alertdialog").getByText("Không thể gỡ quyền Admin cuối cùng.").waitFor();
  assert.equal(changedRole, false);
  await page.getByRole("alertdialog").getByRole("button", { name: "Xác nhận" }).click();
  await page.getByText("Đã cập nhật vai trò.").waitFor();
  assert.ok(changedRole);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mở menu dashboard" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Người dùng" }).waitFor();
  await page.keyboard.press("Escape");
  await assertAccessible();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.goto(`${origin}/status`);
  await pause(1000);
  await page.getByText("Tổng quát: Healthy").waitFor();
  await assertAccessible();
  healthMode = "Degraded";
  await page.getByRole("button", { name: "Kiểm tra lại" }).click();
  await page.getByText("Tổng quát: Degraded").waitFor();
  healthMode = "Unavailable";
  await page.getByRole("button", { name: "Kiểm tra lại" }).click();
  await page.getByText("Tổng quát: Unavailable").waitFor();
  assert.equal((await page.locator("#main-content").innerText()).includes("SHOULD_NOT_APPEAR"), false);
  console.log("PASS: auth, profile, Admin users, health states, accessibility");
} finally {
  if (browser) await browser.close();
  next.kill();
}
