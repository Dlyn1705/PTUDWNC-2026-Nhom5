/* eslint-disable @typescript-eslint/no-require-imports -- Standalone real-Next.js browser E2E runner. */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const secret = "security-e2e-only-" + randomUUID() + randomUUID();
const category = { id: "11111111-1111-1111-1111-111111111111", name: "Món chính", slug: "mon-chinh", recipeCount: 0 };
const tokens = new Map();
const events = { login: 0, refresh: 0, logout: 0 };
function issue(email) {
  const refresh = "fixture-refresh-" + randomUUID(); tokens.set(refresh, email);
  return { refresh, data: { accessToken: "fixture-access-" + randomUUID(),
    accessTokenExpiry: new Date(Date.now() + 3600000).toISOString(),
    user: { id: email.startsWith("admin") ? "admin" : "author", email, displayName: email.startsWith("admin") ? "Admin Test" : "Author Test" },
    roles: [email.startsWith("admin") ? "Admin" : "Author"] } };
}
const backend = http.createServer(async (req, res) => {
  let raw = ""; for await (const chunk of req) raw += chunk;
  let body; try { body = raw ? JSON.parse(raw) : {}; } catch { res.writeHead(400).end(); return; }
  const send = (status, value) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
  if (req.url === "/api/v1/auth/login") {
    events.login++;
    if (body.password !== "E2e-only-password1!") return send(401, { detail: "Invalid credentials" });
    const result = issue(body.email);
    res.setHeader("Set-Cookie", `culinary_refresh_token=${result.refresh}; Expires=${new Date(Date.now() + 3600000).toUTCString()}; HttpOnly; Path=/api/v1/auth; SameSite=Lax`);
    return send(200, { data: result.data, success: true });
  }
  if (req.url === "/api/v1/auth/refresh") {
    events.refresh++;
    const email = tokens.get(body.refreshToken);
    if (!email) return send(401, { detail: "Refresh rejected" });
    tokens.delete(body.refreshToken); const result = issue(email);
    res.setHeader("Set-Cookie", `culinary_refresh_token=${result.refresh}; Expires=${new Date(Date.now() + 3600000).toUTCString()}; HttpOnly; Path=/api/v1/auth; SameSite=Lax`);
    return send(200, { data: result.data, success: true });
  }
  if (req.url === "/api/v1/auth/logout") { events.logout++; tokens.delete(body.refreshToken); res.writeHead(204).end(); return; }
  if (req.url?.startsWith("/api/v1/categories")) return send(200, { data: [category], success: true });
  return send(200, { data: [], meta: { page: 1, pageSize: 12, totalCount: 0, totalPages: 0 } });
});
function listen(server) { return new Promise(resolve => server.listen(0, "127.0.0.1", () => resolve(server.address().port))); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const backendPort = await listen(backend);
  const temporaryPort = http.createServer(); const port = await listen(temporaryPort);
  await new Promise(resolve => temporaryPort.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  let logs = "";
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true",
      API_INTERNAL_URL: `http://127.0.0.1:${backendPort}`, NEXT_PUBLIC_ENABLE_MOCKS: "false" },
  });
  server.stdout.on("data", value => { logs = (logs + value).slice(-16000); });
  server.stderr.on("data", value => { logs = (logs + value).slice(-16000); });
  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error("Next.js test server stopped: " + logs);
      try { if ((await fetch(origin + "/api/auth/csrf")).ok) { ready = true; break; } } catch { /* startup */ }
      await delay(250);
    }
    assert.equal(ready, true, "Next.js test server did not become ready");
    browser = await chromium.launch({ headless: true,
      ...(process.env.E2E_BROWSER_CHANNEL === "bundled" ? {} : { channel: process.env.E2E_BROWSER_CHANNEL || "chrome" }),
    });
    let context = await browser.newContext(); let page = await context.newPage();
    // Browser data calls use the normal public API origin baked into the build; serve only test data.
    await context.route("**/api/v1/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([category]) }));
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin + "/dashboard/recipes/new");
    await page.waitForURL("**/login?**");
    assert.equal(new URL(page.url()).searchParams.get("callbackUrl"), "/dashboard/recipes/new");
    const headers = (await page.goto(origin + "/auth/login?callbackUrl=/dashboard/recipes/new")).headers();
    assert.equal(headers["x-content-type-options"], "nosniff"); assert.equal(headers["x-frame-options"], "DENY");
    const policy = headers["content-security-policy"];
    assert.match(policy, /'nonce-[^']+'/); assert.doesNotMatch(policy.split(";").find(x => x.trim().startsWith("script-src")), /unsafe-inline|unsafe-eval/);
    const firstNonce = policy.match(/'nonce-([^']+)'/)[1];
    assert.equal(await page.locator("script[nonce]").first().evaluate(element => element.nonce), firstNonce);
    await page.getByLabel("Địa chỉ email", { exact: true }).fill("author@test.invalid");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("Wrong-password1!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.getByText("Email hoặc mật khẩu không chính xác.", { exact: true }).waitFor();
    await page.getByLabel("Mật khẩu", { exact: true }).fill("E2e-only-password1!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(origin + "/dashboard/recipes/new");
    await page.getByRole("heading", { name: "Tạo công thức mới", exact: true }).waitFor();
    let session = await (await context.request.get(origin + "/api/auth/session")).json();
    assert.equal(session.user.role, "Author"); assert.equal(JSON.stringify(session).includes("fixture-refresh-"), false);
    const sessionCookie = (await context.cookies()).find(cookie => cookie.name.includes("session-token"));
    assert.equal(sessionCookie.httpOnly, true);
    assert.equal((await page.evaluate(() => document.cookie)).includes("session-token"), false);
    await page.goto(origin + "/dashboard/categories");
    await page.getByRole("heading", { name: "Truy cập bị từ chối", exact: true }).waitFor();
    const prefetch = await context.request.get(origin + "/dashboard/categories", {
      headers: { "next-router-prefetch": "1", purpose: "prefetch" }, maxRedirects: 0,
    });
    assert.notEqual(prefetch.status(), 200, "Server layout allowed an Author's admin-route prefetch");
    // Refresh rotation and stale-cookie behavior are covered by auth.e2e.mjs,
    // which mutates the current server-side Redis session instead of putting
    // retired backend credentials back into the Auth.js cookie.
    await page.goto(origin + "/categories");
    await page.getByRole("button", { name: "Mở menu tài khoản Author Test", exact: true }).click();
    const logoutResponse = page.waitForResponse(result => result.url() === origin + "/api/auth/signout" && result.request().method() === "POST");
    await page.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click();
    const completedLogout = await logoutResponse;
    await completedLogout.finished();
    for (let i = 0; i < 30; i++) {
      if (!(await context.cookies()).some(cookie => cookie.name.includes("session-token"))) break;
      await delay(100);
    }
    assert.equal(events.logout, 1);
    const remaining = (await context.cookies()).filter(cookie => cookie.name.includes("session-token"));
    if (remaining.length) console.log("Logout cookie diagnostics", {
      cookies: remaining.map(({ name, domain, path, expires }) => ({ name, domain, path, expires })),
      responseCookies: (await completedLogout.headersArray()).filter(header => header.name.toLowerCase() === "set-cookie")
        .map(header => header.value.replace(/^[^;]+/, text => text.split("=", 1)[0] + "=<redacted>")),
    });
    assert.equal(remaining.length, 0);
    session = await (await context.request.get(origin + "/api/auth/session")).json();
    assert.equal(session?.user, undefined);
    assert.equal(tokens.size, 0);
    await page.goto(origin + "/dashboard/recipes/new"); await page.waitForURL("**/login?**");
    await context.clearCookies();
    await page.goto(origin + "/auth/login?callbackUrl=/dashboard/categories");
    await page.getByLabel("Địa chỉ email", { exact: true }).fill("admin@test.invalid");
    await page.getByLabel("Mật khẩu", { exact: true }).fill("E2e-only-password1!");
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.waitForURL(origin + "/dashboard/categories");
    await page.getByRole("button", { name: "Tạo danh mục mới", exact: true }).waitFor();
    const secondPolicy = (await page.reload()).headers()["content-security-policy"];
    assert.notEqual(secondPolicy.match(/'nonce-([^']+)'/)[1], firstNonce);
    const folder = path.join(root, "build", "security-e2e"); fs.mkdirSync(folder, { recursive: true });
    await page.screenshot({ path: path.join(folder, "admin-route.png"), fullPage: true });
    // Inject into the parser's HTML, not via privileged DevTools evaluation or a trusted runtime script.
    await page.route(origin + "/auth/login?csp-probe=1", async route => {
      const original = await route.fetch();
      const html = await original.text();
      await route.fulfill({ response: original, body: html.replace("</head>", "<script>window.cspProbe=true</script></head>") });
    });
    await page.goto(origin + "/auth/login?csp-probe=1");
    await page.getByLabel("Địa chỉ email", { exact: true }).fill("probe@test.invalid");
    assert.equal(await page.evaluate(() => window.cspProbe), undefined, "CSP allowed a parser-inserted inline script");
    assert.deepEqual(errors, []);
    console.log("PASS: real Next.js/Chrome login, logout, guest/Author/Admin routes, nonce hydration and blocked inline injection.");
  } catch (error) {
    console.error(logs); throw error;
  } finally {
    if (browser) await browser.close();
    server.kill(); await new Promise(resolve => backend.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
