/* eslint-disable @typescript-eslint/no-require-imports -- Node test harness loads the proxy in isolation. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");
const root = path.resolve(__dirname, "..");

function load(relative, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(code, {
    module: loaded, exports: loaded.exports,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    URL, Headers, Response, Buffer, crypto: require("node:crypto").webcrypto,
    process: { env: { NODE_ENV: "production" } },
  }, { filename: relative });
  return loaded.exports;
}

const security = load("lib/security/headers.ts");
const proxy = load("proxy.ts", {
  "next/server": { NextResponse },
  "@/lib/security/headers": security,
}).default;

for (const route of ["/dashboard", "/dashboard/categories", "/profile", "/recipes/new"]) {
  test(`protected UI ${route} is never shared-cached`, () => {
    const result = proxy(new NextRequest(`https://example.invalid${route}`));
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
    assert.equal(result.headers.get("x-middleware-next"), "1");
    assert.equal(result.headers.get("Set-Cookie"), null);
  });
}

for (const route of ["/", "/recipes", "/recipes/deleted-slug", "/search", "/categories", "/sitemap.xml"]) {
  test(`recipe HTML ${route} cannot serve a cached deleted recipe`, () => {
    const result = proxy(new NextRequest(`https://example.invalid${route}`));
    assert.equal(result.headers.get("Cache-Control"), "private, no-store");
  });
}

test("CSP uses a fresh nonce and security headers without auth cookie handling", () => {
  const request = () => new NextRequest("https://example.invalid/dashboard/categories");
  const first = proxy(request()); const second = proxy(request());
  const policy = first.headers.get("Content-Security-Policy");
  assert.notEqual(policy, second.headers.get("Content-Security-Policy"));
  const scripts = policy.split(";").find(value => value.trim().startsWith("script-src"));
  assert.match(scripts, /'nonce-[^']+'/);
  assert.doesNotMatch(scripts, /unsafe-inline|unsafe-eval/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.equal(first.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(first.headers.get("Strict-Transport-Security"), "max-age=31536000");
});
