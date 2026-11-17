/* eslint-disable @typescript-eslint/no-require-imports -- Production sitemap HTTP acceptance runner. */
/* Production Next.js sitemap HTTP acceptance against an isolated public API fixture. */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const root = path.resolve(__dirname, "../../..");
const web = path.join(root, "Culinary_Blog_Nhom5/culinary-blog-web");
const req = createRequire(path.join(web, "package.json"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server.address().port;
}
async function main() {
  let phase = "initial";
  let calls = [];
  const fixture = http.createServer((request, response) => {
    const url = new URL(request.url, "http://fixture.invalid");
    calls.push({
      path: url.pathname,
      page: url.searchParams.get("page"),
      phase,
    });
    if (phase === "outage") {
      response.writeHead(503);
      response.end("{}");
      return;
    }
    const page = Number(url.searchParams.get("page") || 1);
    response.setHeader("content-type", "application/json");
    if (url.pathname.endsWith("/categories")) {
      response.end(
        JSON.stringify({
          data: [
            {
              id: "fixture-category",
              name: "Acceptance",
              slug: "acceptance-category",
            },
          ],
        }),
      );
      return;
    }
    if (url.pathname.endsWith("/recipes")) {
      const items =
        page === 1
          ? [
              {
                slug:
                  phase === "initial"
                    ? "public-before-change"
                    : "public-after-change",
                status: 1,
                updatedAt: "2026-11-16T00:00:00Z",
              },
              { slug: "private-draft", status: 0 },
              { slug: "private-archived", status: 2 },
            ]
          : [
              {
                slug: "public-page-two",
                status: 1,
                updatedAt: "2026-11-16T00:00:00Z",
              },
            ];
      response.end(
        JSON.stringify({
          data: items,
          meta: {
            page,
            pageSize: 50,
            totalCount: 4,
            totalPages: 2,
            hasNextPage: page === 1,
          },
        }),
      );
      return;
    }
    response.writeHead(404);
    response.end("{}");
  });
  const apiPort = await listen(fixture);
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));
  const secret = randomBytes(32).toString("hex");
  const server = spawn(
    process.execPath,
    [
      req.resolve("next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: web,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
        REVALIDATION_SECRET: secret,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  );
  let logs = "";
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (data) => {
      logs = (logs + data).slice(-12000);
    });
  const origin = `http://127.0.0.1:${port}`;
  const checks = [];
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null)
        throw Error(`Next exited ${server.exitCode}: ${logs}`);
      try {
        if ((await fetch(origin + "/auth/login")).ok) {
          ready = true;
          break;
        }
      } catch {
        /* server starting */
      }
      await sleep(500);
    }
    assert.ok(ready, "production Next starts");
    async function sitemap() {
      const response = await fetch(origin + "/sitemap.xml");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /xml/);
      const text = await response.text();
      assert.match(text, /<urlset[\s>]/);
      return text;
    }
    let xml = await sitemap();
    assert.match(xml, /public-before-change/);
    assert.match(xml, /public-page-two/);
    assert.match(xml, /acceptance-category/);
    assert.doesNotMatch(xml, /private-draft|private-archived/);
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => new URL(m[1]),
    );
    assert.equal(urls.length, 6);
    assert.equal(new Set(urls.map((u) => u.origin)).size, 1);
    const publicOrigin = urls[0].origin;
    assert.ok(
      calls.some((c) => c.page === "2"),
      "runtime fetch covers page 2",
    );
    checks.push(
      "HTTP XML, public URLs, two-page enumeration, Draft/Archived exclusion",
    );
    async function invalidate() {
      const response = await fetch(origin + "/api/revalidate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-revalidation-secret": secret,
        },
        body: JSON.stringify({
          tags: ["public:recipes", "public:categories"],
          paths: ["/recipes", "/categories"],
        }),
      });
      assert.equal(response.status, 204);
    }
    const denied = await fetch(origin + "/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(denied.status, 401);
    checks.push("unauthenticated revalidation denied");
    phase = "changed";
    await invalidate();
    let fresh = false;
    for (let i = 0; i < 30; i++) {
      xml = await sitemap();
      if (
        xml.includes("public-after-change") &&
        !xml.includes("public-before-change")
      ) {
        fresh = true;
        break;
      }
      await sleep(300);
    }
    assert.ok(
      fresh,
      "sitemap reflects changed public projections after revalidation",
    );
    checks.push(
      "revalidation eventually refreshes changed publication projection",
    );
    phase = "outage";
    await invalidate();
    let fallback = false;
    for (let i = 0; i < 30; i++) {
      xml = await sitemap();
      if (
        !xml.includes("public-after-change") &&
        !xml.includes("public-page-two")
      ) {
        fallback = true;
        break;
      }
      await sleep(300);
    }
    assert.ok(
      fallback,
      "upstream outage returns static safe sitemap after refresh",
    );
    assert.doesNotMatch(xml, /private-draft|private-archived/);
    checks.push("upstream outage safe static fallback");
    const robots = await fetch(origin + "/robots.txt");
    assert.equal(robots.status, 200);
    const text = await robots.text();
    assert.ok(text.includes(publicOrigin + "/sitemap.xml"));
    assert.match(text, /Disallow: \/dashboard\//);
    checks.push(
      "robots references matching public sitemap origin and private route exclusions",
    );
    const output = {
      passed: true,
      kind: "production Next.js HTTP with isolated mock public API; not real database lifecycle evidence",
      checks,
      publicOrigin,
      calls,
      limitations: [
        "does not validate deployed public DNS/TLS or real database soft-delete filtering",
        "dataset fixture below sitemap size cap; no external Google validation",
      ],
    };
    fs.writeFileSync(
      path.join(
        root,
        "artifacts/quality/acceptance25-20261116/sitemap-runtime.json",
      ),
      JSON.stringify(output, null, 2),
    );
    console.log(JSON.stringify(output, null, 2));
  } finally {
    server.kill();
    await new Promise((resolve) => fixture.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
