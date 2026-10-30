// Browser regression for the backend-cookie + in-memory Zustand session.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { chromium } from "playwright";

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
  const session = (role, token) => ({
    accessToken: `access-${token}`,
    accessTokenExpiry: new Date(Date.now() + 900_000).toISOString(),
    user: { id: role === "Admin" ? "admin" : "author", email: "chef@example.test", displayName: "E2E Chef" },
    roles: [role],
  });
  let role = "Author";
  let access = "";
  await context.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization" };
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
  await page.goto(`${origin}/dashboard/categories`);
  await page.getByRole("heading", { name: "Truy cập bị từ chối" }).waitFor();

  rejectNextManaged = true;
  const before401 = refreshes;
  await page.goto(`${origin}/dashboard/recipes`);
  await page.getByText("0 công thức").waitFor();
  assert.equal(refreshes, before401 + 2);

  await page.goto(`${origin}/profile`);
  await page.getByRole("button", { name: "Menu tài khoản E2E Chef" }).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await page.waitForURL(`${origin}/auth/login`);
  assert.equal(logoutCalls, 1);
  assert.equal(tokens.size, 0);
  assert.equal((await context.cookies()).some(item => item.name === "culinary_refresh_token"), false);
  await page.goto(`${origin}/profile`);
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
  console.log("PASS: register/welcome, login-refresh-logout, role guard, forgot/reset, change password");
} finally {
  if (browser) await browser.close();
  next.kill();
}
