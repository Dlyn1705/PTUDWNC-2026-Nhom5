/* eslint-disable @typescript-eslint/no-require-imports -- Node test harness loads isolated Auth.js callbacks. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");
const root = path.resolve(__dirname, "..");
function load(relative, dependencies = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(code, { module: loaded, exports: loaded.exports, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, URL, Headers, Response, Buffer, crypto: require("node:crypto").webcrypto,
  process: { env: { NODE_ENV: "production" } }, console: { error() {} }, ...globals }, { filename: relative });
  return loaded.exports;
}
function authFixture(fetcher) {
  let configuration;
  load("lib/auth.ts", {
    "server-only": {}, "next-auth": { __esModule: true, default: options => { configuration = options; return {}; } },
    "next-auth/providers/credentials": { __esModule: true, default: options => options },
  }, { fetch: fetcher });
  return configuration;
}
const response = (roles = ["Author"], refresh = "refresh-private", access = "access-public") => new Response(JSON.stringify({
  accessToken: access, accessTokenExpiry: new Date(Date.now() + 3600000).toISOString(),
  user: { id: "author", displayName: "Author", email: "author@test.invalid" }, roles,
}), { headers: { "Set-Cookie": `culinary_refresh_token=${refresh}; HttpOnly; Path=/api/v1/auth` } });

test("login sends credentials server-side and captures HttpOnly backend refresh cookie", async () => {
  const calls = [];
  const config = authFixture(async (url, options) => { calls.push({ url, options }); return response(); });
  const user = await config.providers[0].authorize({ email: "author@test.invalid", password: "Test-only-password1!" });
  assert.equal(user.role, "Author"); assert.equal(user.backendRefreshToken, "refresh-private");
  assert.equal(calls[0].url.pathname, "/api/v1/auth/login");
  assert.equal(calls[0].options.cache, "no-store");
  const token = await config.callbacks.jwt({ token: {}, user });
  const session = await config.callbacks.session({ session: { user: {} }, token });
  assert.equal(session.user.accessToken, "access-public");
  assert.equal(JSON.stringify(session).includes("refresh-private"), false);
  assert.equal(JSON.stringify(session).includes("backendRefreshToken"), false);
});

test("invalid credentials and unsupported roles are rejected", async () => {
  const invalid = authFixture(async () => new Response(null, { status: 401 }));
  assert.equal(await invalid.providers[0].authorize({ email: "bad", password: "bad" }), null);
  assert.equal(await invalid.providers[0].authorize({ email: 1, password: "bad" }), null);
  const member = authFixture(async () => response(["Member"]));
  assert.equal(await member.providers[0].authorize({ email: "a", password: "b" }), null);
});

test("valid access token is reused without refresh", async () => {
  const config = authFixture(async () => { throw new Error("Unexpected refresh"); });
  const token = { accessToken: "current", backendRefreshToken: "private", accessTokenExpiry: new Date(Date.now() + 3600000).toISOString() };
  assert.equal((await config.callbacks.jwt({ token })).accessToken, "current");
});

test("concurrent expiry shares one refresh and rotates token and roles", async () => {
  let calls = 0;
  const config = authFixture(async (url, options) => {
    calls++; assert.equal(url.pathname, "/api/v1/auth/refresh");
    assert.equal(JSON.parse(options.body).refreshToken, "old-refresh");
    await new Promise(resolve => setImmediate(resolve));
    return response(["Admin"], "rotated-refresh", "rotated-access");
  });
  const expired = { accessToken: "old", backendRefreshToken: "old-refresh", accessTokenExpiry: new Date(0).toISOString() };
  const tokens = await Promise.all([config.callbacks.jwt({ token: { ...expired } }), config.callbacks.jwt({ token: { ...expired } })]);
  assert.equal(calls, 1);
  for (const token of tokens) {
    assert.equal(token.accessToken, "rotated-access"); assert.equal(token.backendRefreshToken, "rotated-refresh");
    assert.equal(token.role, "Admin"); assert.equal(token.error, undefined);
  }
});

test("failed refresh marks session invalid", async () => {
  const config = authFixture(async () => new Response(null, { status: 401 }));
  const token = await config.callbacks.jwt({ token: { accessToken: "old", backendRefreshToken: "revoked", accessTokenExpiry: new Date(0).toISOString() } });
  assert.equal(token.error, "RefreshTokenError");
  const session = await config.callbacks.session({ session: { user: {} }, token });
  assert.equal(session.error, "RefreshTokenError");
});

test("logout revokes the backend refresh token with bearer authentication", async () => {
  const calls = [];
  const config = authFixture(async (url, options) => { calls.push({ url, options }); return new Response(null, { status: 204 }); });
  await config.events.signOut({ token: { accessToken: "access", backendRefreshToken: "refresh" } });
  assert.equal(calls[0].url.pathname, "/api/v1/auth/logout");
  assert.equal(calls[0].options.headers.Authorization, "Bearer access");
  assert.equal(JSON.parse(calls[0].options.body).refreshToken, "refresh");
});

const permissions = load("lib/permissions.ts");
const security = load("lib/security/headers.ts");
const proxy = load("proxy.ts", { "next/server": { NextResponse }, "@/lib/auth": { auth: callback => callback },
  "@/lib/permissions": permissions, "@/lib/security/headers": security }).default;

for (const route of ["/dashboard/recipes/new", "/recipes/new", "/recipes/test/edit", "/profile"]) {
  test(`guest is redirected from ${route} with local callback`, () => {
    const request = new NextRequest(`http://localhost${route}?page=1`); request.auth = null;
    const result = proxy(request); const redirect = new URL(result.headers.get("location"));
    assert.equal(redirect.pathname, "/login"); assert.equal(redirect.searchParams.get("callbackUrl"), route + "?page=1");
  });
}
for (const [roles, route, allowed] of [[ ["Author"], "/dashboard/recipes/new", true ],
  [["Author"], "/dashboard/categories", false], [["Admin"], "/dashboard/categories", true], [[], "/dashboard/recipes/new", false]]) {
  test(`roles ${roles} on ${route}: ${allowed}`, () => {
    const request = new NextRequest(`http://localhost${route}`); request.auth = { user: { roles } };
    const result = proxy(request);
    assert.equal(result.headers.get("x-middleware-next") === "1", allowed);
    if (!allowed) assert.equal(new URL(result.headers.get("x-middleware-rewrite")).pathname, "/forbidden");
  });
}
test("refresh error blocks a protected route even with an Author role", () => {
  const request = new NextRequest("http://localhost/dashboard"); request.auth = { user: { roles: ["Author"] }, error: "RefreshTokenError" };
  assert.equal(new URL(proxy(request).headers.get("location")).pathname, "/login");
});
test("public prefetch does not invoke Auth.js or roll a session cookie", () => {
  let calls = 0;
  const handler = load("proxy.ts", { "next/server": { NextResponse },
    "@/lib/auth": { auth: callback => request => { calls++; return callback(request); } },
    "@/lib/permissions": permissions, "@/lib/security/headers": security }).default;
  const request = new NextRequest("http://localhost/categories", { headers: { "next-router-prefetch": "1" } });
  assert.equal(handler(request).headers.get("x-middleware-next"), "1");
  assert.equal(calls, 0);
});

for (const route of ["/", "/recipes", "/recipes/deleted-slug", "/search", "/categories", "/categories/mon-chinh", "/sitemap.xml"]) {
  test(`recipe HTML ${route} cannot serve a cached deleted recipe`, () => {
    const response = proxy(new NextRequest(`https://example.invalid${route}`));
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });
}
test("CSP uses a fresh nonce, no production script bypass, and security headers on rewrites", () => {
  const request = () => { const r = new NextRequest("https://example.invalid/dashboard/categories"); r.auth = { user: { roles: ["Author"] } }; return r; };
  const first = proxy(request()); const second = proxy(request());
  const policy = first.headers.get("Content-Security-Policy");
  assert.notEqual(policy, second.headers.get("Content-Security-Policy"));
  const scripts = policy.split(";").find(x => x.trim().startsWith("script-src"));
  assert.match(scripts, /'nonce-[^']+'/); assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval/);
  assert.match(policy, /object-src 'none'/); assert.match(policy, /frame-ancestors 'none'/);
  assert.equal(first.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(first.headers.get("Strict-Transport-Security"), "max-age=31536000");
  assert.equal(first.headers.get("Cache-Control"), "private, no-store");
});
