/* eslint-disable @typescript-eslint/no-require-imports -- Standalone browser tests against a production Next.js build. */
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { randomUUID, randomBytes, createHash, createCipheriv } = require("node:crypto");
const { createClient } = require("redis");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const recipeId = "11111111-1111-4111-8111-111111111111";
const imageId = "22222222-2222-4222-8222-222222222222";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
const image = (processingStatus = "Completed", isPrimary = true) => ({
  id: imageId, recipeId, originalUrl: `data:image/png;base64,${png.toString("base64")}`,
  mediumUrl: null, thumbnailUrl: null, altText: "Ảnh thử", orderIndex: 0, isPrimary, processingStatus,
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const probe = http.createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port;
}

async function main() {
  const port = await freePort(); const origin = `http://127.0.0.1:${port}`;
  const secret = "image-e2e-" + randomUUID() + randomUUID();
  // Auth now resolves an encrypted server-side session, not token/role fields from the cookie.
  const redis = createClient({ url: process.env.AUTH_REDIS_URL ?? "redis://localhost:6379",
    socket: { connectTimeout: 3000, reconnectStrategy: false } });
  redis.on("error", () => {});
  try { await redis.connect(); }
  catch { if (redis.isOpen) redis.destroy(); throw new Error("Image E2E requires Redis. Set AUTH_REDIS_URL to a running test Redis instance."); }
  const sessionId = randomBytes(32).toString("base64url");
  const sessionKey = `culinary:auth:v1:{${sessionId}}`;
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, AUTH_SECRET: secret, AUTH_URL: origin, AUTH_TRUST_HOST: "true", NEXT_PUBLIC_ENABLE_MOCKS: "false" },
  });
  let logs = "";
  server.stdout.on("data", data => { logs = (logs + data).slice(-16000); });
  server.stderr.on("data", data => { logs = (logs + data).slice(-16000); });
  let browser;
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw new Error("Next.js stopped: " + logs);
      try { if ((await fetch(origin + "/api/auth/csrf")).ok) { ready = true; break; } } catch { /* starting */ }
      await pause(250);
    }
    assert.ok(ready, "Next.js server must start");
    browser = await chromium.launch({ headless: true,
      ...(process.env.E2E_BROWSER_CHANNEL === "bundled" ? {} : { channel: process.env.E2E_BROWSER_CHANNEL || "chrome" }),
    });
    const { encode } = await import("next-auth/jwt");
    const cookieName = "authjs.session-token";
    const stored = {
      state: "active", version: 0, refreshToken: "fixture-refresh", refreshTokenExpiry: Date.now() + 3600_000,
      session: { accessToken: "fixture-token", accessTokenExpiry: new Date(Date.now() + 3600_000).toISOString(),
        user: { id: "fixture-author", email: "image@test.invalid", displayName: "Image Test" }, roles: ["Author"] },
    };
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(`culinary-server-session-v1:${secret}`).digest(), nonce);
    cipher.setAAD(Buffer.from(sessionId));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(stored), "utf8"), cipher.final()]);
    await redis.set(sessionKey, Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url"),
      { expiration: { type: "PX", value: 3600_000 }, condition: "NX" });
    const session = await encode({ secret, salt: cookieName, maxAge: 3600, token: {
      backendSessionId: sessionId,
    } });
    const errors = [];
    async function scenario(name, routes, run) {
      const context = await browser.newContext();
      await context.addCookies([{ name: cookieName, value: session, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      page.on("pageerror", error => errors.push(error.message));
      const counts = { post: 0, get: 0, delete: 0, patch: 0, poll: 0 };
      await context.route("**/api/v1/**", async route => {
        const request = route.request(); const url = new URL(request.url());
        if (!url.pathname.includes("/images")) return route.fulfill({ status: 200, json: [] });
        const method = request.method().toLowerCase();
        if (method === "options") return route.fulfill({ status: 204, headers: {
          "access-control-allow-origin": origin, "access-control-allow-credentials": "true",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE", "access-control-allow-headers": "*",
        } });
        counts[method]++;
        const isPoll = url.pathname.endsWith("/" + imageId);
        if (method === "get" && isPoll) counts.poll++;
        const send = (status, data, id = "browser-correlation", extra = {}) => route.fulfill({
          status, headers: { "content-type": "application/json", "x-correlation-id": id,
            "access-control-allow-origin": origin, "access-control-allow-credentials": "true",
            "access-control-expose-headers": "X-Correlation-ID, Retry-After", ...extra },
          ...(status === 204 ? {} : { body: JSON.stringify(data) }),
        });
        await routes({ route, method, isPoll, counts, send });
      });
      try {
        await page.goto(origin + "/dashboard/recipes/images");
        await page.getByLabel("ID công thức", { exact: true }).fill(recipeId);
        await page.getByRole("button", { name: "Chọn công thức", exact: true }).click();
        await page.getByRole("region", { name: "Bộ sưu tập ảnh công thức" }).waitFor();
        await page.getByText("Đang tải ảnh…", { exact: true }).waitFor({ state: "hidden" });
        const dropzone = page.getByRole("region", { name: "Tải ảnh công thức", exact: true });
        const select = () => page.getByLabel("Chọn ảnh công thức", { exact: true }).setInputFiles({ name: "dish.png", mimeType: "image/png", buffer: png });
        await run({ page, dropzone, select, counts });
        console.log("PASS", name);
      } finally { await context.close(); }
    }
    const ok = data => ({ success: true, data });

    await scenario("processing failure retains image, correlation, and GET-only retry", async ({ method, isPoll, counts, send }) => {
      if (method === "post") return send(201, ok(image("Pending")));
      if (isPoll) return send(200, ok(image(counts.poll === 1 ? "Failed" : "Completed")), "poll-failure-id");
      return send(200, ok(counts.post ? [image()] : []));
    }, async ({ page, dropzone, select, counts }) => {
      await select(); await dropzone.getByRole("button", { name: "Tải ảnh lên", exact: true }).click();
      await dropzone.getByRole("alert").filter({ hasText: "Mã tham chiếu: poll-failure-id" }).waitFor();
      await page.getByText("Chưa tạo được ảnh xem trước; ảnh gốc vẫn được lưu.", { exact: true }).waitFor();
      await dropzone.getByRole("button", { name: "Kiểm tra lại trạng thái", exact: true }).click();
      await dropzone.getByText("Ảnh đã tải lên và xử lý hoàn tất.", { exact: true }).waitFor();
      assert.equal(counts.post, 1); assert.equal(counts.poll, 2);
    });

    await scenario("cancel processing stops polling and uses status instead of alert", async ({ method, isPoll, send }) => {
      if (method === "post") return send(201, ok(image("Pending")));
      return send(200, ok(isPoll ? image("Processing") : []));
    }, async ({ page, dropzone, select, counts }) => {
      await select(); await dropzone.getByRole("button", { name: "Tải ảnh lên", exact: true }).click();
      await dropzone.getByText("Ảnh gốc đã được lưu. Đang kiểm tra xử lý ảnh xem trước...", { exact: true }).waitFor();
      await dropzone.getByRole("button", { name: "Hủy", exact: true }).click();
      await dropzone.getByRole("status").filter({ hasText: "Đã dừng thao tác" }).waitFor();
      assert.equal(await dropzone.getByRole("alert").count(), 0);
      const polls = counts.poll; await pause(1200); assert.equal(counts.poll, polls); assert.equal(counts.post, 1);
      await page.goto(origin + "/auth/login"); await pause(1200); assert.equal(counts.poll, polls);
    });

    await scenario("validation and rate limit messages preserve server metadata", async ({ method, counts, send }) => {
      if (method !== "post") return send(200, ok([]));
      return counts.post === 1
        ? send(422, { errors: { file: ["Nội dung ảnh không hợp lệ."] } }, "validation-id")
        : send(429, {}, "rate-limit-id", { "retry-after": "1" });
    }, async ({ dropzone, select }) => {
      await select(); const upload = dropzone.getByRole("button", { name: "Tải ảnh lên", exact: true }); await upload.click();
      await dropzone.getByRole("alert").filter({ hasText: "Nội dung ảnh không hợp lệ." }).waitFor();
      assert.match(await dropzone.getByRole("alert").innerText(), /validation-id/);
      await upload.click(); await dropzone.getByRole("alert").filter({ hasText: "rate-limit-id" }).waitFor();
      assert.equal(await upload.isDisabled(), true); await pause(1100); assert.equal(await upload.isEnabled(), true);
    });

    await scenario("network ambiguity requires a list check before another POST", async ({ method, route, send }) => {
      if (method === "post") return route.abort("failed");
      return send(200, ok([]));
    }, async ({ dropzone, select, counts }) => {
      await select(); await dropzone.getByRole("button", { name: "Tải ảnh lên", exact: true }).click();
      await dropzone.getByRole("alert").filter({ hasText: "Không thể kết nối" }).waitFor();
      await dropzone.getByRole("button", { name: "Kiểm tra danh sách trước khi thử lại", exact: true }).click();
      await dropzone.getByRole("status").filter({ hasText: "Đã tải lại danh sách" }).waitFor();
      assert.equal(counts.post, 1);
    });

    await scenario("successful delete followed by reload failure is not reported as failed mutation", async ({ method, counts, send }) => {
      if (method === "delete") return send(204);
      if (counts.delete) return send(503, {}, "reload-id");
      return send(200, ok([image()]));
    }, async ({ page, counts }) => {
      page.on("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "Xóa Ảnh thử", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Thao tác đã hoàn tất nhưng chưa tải lại được danh sách." }).waitFor();
      assert.match(await page.getByRole("region", { name: "Bộ sưu tập ảnh công thức" }).getByRole("alert").innerText(), /reload-id/);
      assert.equal(await page.getByRole("button", { name: "Xóa Ảnh thử", exact: true }).isDisabled(), true);
      assert.equal(counts.delete, 1);
      const folder = path.join(root, "build", "file-api-e2e"); fs.mkdirSync(folder, { recursive: true });
      await page.screenshot({ path: path.join(folder, "mutation-reload-error.png"), fullPage: true });
    });

    await scenario("primary conflict requires reload without claiming it already happened", async ({ method, counts, send }) => {
      if (method === "patch") return send(409, { code: "RECIPE_IMAGE_CONFLICT" }, "conflict-id");
      if (counts.patch) return send(503, {}, "reload-failed");
      return send(200, ok([image("Completed", false)]));
    }, async ({ page, counts }) => {
      const primary = page.getByRole("button", { name: "Đặt làm ảnh chính", exact: true }); await primary.click();
      await page.getByRole("alert").filter({ hasText: "conflict-id" }).waitFor();
      assert.doesNotMatch(await page.getByRole("region", { name: "Bộ sưu tập ảnh công thức" }).getByRole("alert").innerText(), /Đã tải lại/);
      assert.equal(await primary.isDisabled(), true);
      await page.getByRole("button", { name: "Tải lại ảnh", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "reload-failed" }).waitFor(); assert.equal(counts.patch, 1);
    });
    await scenario("polling deadline preserves stored image and never reports success", async ({ method, isPoll, send }) => {
      if (method === "post") return send(201, ok(image("Pending")));
      return send(200, ok(isPoll ? image("Processing") : []));
    }, async ({ dropzone, select, counts }) => {
      await select(); await dropzone.getByRole("button", { name: "Tải ảnh lên", exact: true }).click();
      await dropzone.getByRole("alert").filter({ hasText: "chưa xử lý xong" }).waitFor({ timeout: 45000 });
      assert.equal(await dropzone.getByText("Ảnh đã tải lên và xử lý hoàn tất.", { exact: true }).count(), 0);
      assert.equal(await dropzone.getByRole("button", { name: "Kiểm tra lại trạng thái", exact: true }).isEnabled(), true);
      assert.equal(counts.post, 1);
    });

    await scenario("HTTP timeout differs from processing deadline and network failure", async ({ method, isPoll, route, send }) => {
      if (method === "post") return send(201, ok(image("Pending")));
      if (isPoll) {
        await pause(11000);
        try { await route.abort("timedout"); } catch { /* Browser has already canceled the timed-out request. */ }
        return;
      }
      return send(200, ok([]));
    }, async ({ dropzone, select, counts }) => {
      await select(); await dropzone.getByRole("button", { name: "Tải ảnh lên", exact: true }).click();
      await dropzone.getByRole("alert").filter({ hasText: "Máy chủ chưa phản hồi kịp" }).waitFor({ timeout: 20000 });
      assert.equal(counts.post, 1);
      assert.equal(await dropzone.getByRole("button", { name: "Kiểm tra lại trạng thái", exact: true }).isEnabled(), true);
    });
    assert.deepEqual(errors, []); console.log("All 8 image browser scenarios passed.");
  } finally {
    if (browser) await browser.close();
    server.kill();
    try { await redis.del(sessionKey); } finally { redis.destroy(); }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
