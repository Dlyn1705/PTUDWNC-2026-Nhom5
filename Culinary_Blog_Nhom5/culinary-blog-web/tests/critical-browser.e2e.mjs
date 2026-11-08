import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);

export async function browserOrigin() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject).listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${socket.address().port}`;
  await new Promise((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  return origin;
}

async function submit(page, api, route, button, status, method = "POST") {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === api + route &&
        response.request().method() === method,
    ),
    button.click(),
  ]);
  assert.equal(response.status(), status, route);
  return response;
}

export async function runCriticalBrowser(api, origin) {
  const web = spawn(
    process.execPath,
    [
      require.resolve("next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      new URL(origin).port,
    ],
    {
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: api,
        API_INTERNAL_URL: api,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let logs = "";
  for (const stream of [web.stdout, web.stderr]) {
    stream.on("data", (chunk) => {
      logs = (logs + chunk).slice(-4000);
    });
  }
  const exited = new Promise((resolve) => web.once("close", resolve));
  let browser;
  try {
    for (let i = 0; i < 240 && !logs.includes("Ready in"); i++) {
      assert.equal(web.exitCode, null, logs);
      await delay(500);
    }
    assert.ok(logs.includes("Ready in"), logs);
    browser = await chromium.launch({
      channel:
        process.env.BROWSER_CHANNEL ||
        (process.platform === "win32" ? "msedge" : undefined),
    });
    const email = `browser-${randomUUID()}@example.test`;
    const password = "Isolated-Browser-Test-Password1!";
    const register = await browser.newPage();
    register.setDefaultTimeout(45000);
    await register.goto(origin + "/auth/register", { timeout: 90000 });
    await register.locator("#displayName").fill("Browser Chef");
    await register.locator("#email").fill(email);
    await register.locator("#password").fill(password);
    await register.locator("#confirmPassword").fill(password);
    await submit(
      register,
      api,
      "/api/v1/auth/register",
      register.locator("form button[type=submit]"),
      201,
    );
    await register.waitForURL("**/auth/welcome?**");
    await register.context().close();
    console.log("PASS browser: register and welcome");

    const author = await browser.newContext();
    const page = await author.newPage();
    page.setDefaultTimeout(45000);
    await page.goto(
      origin + "/auth/login?callbackUrl=%2Fdashboard%2Frecipes%2Fnew",
      { timeout: 90000 },
    );
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await submit(
      page,
      api,
      "/api/v1/auth/login",
      page.locator("form button[type=submit]"),
      200,
    );
    await page.waitForURL("**/dashboard/recipes/new");
    console.log("PASS browser: login and protected editor");

    const title = `Phở bò trình duyệt ${randomUUID().slice(0, 8)}`;
    await page.locator('[id$="-new-title"]:visible').fill(title);
    await page
      .locator('select[id$="-new-category"]:visible')
      .selectOption({ label: "Critical E2E" });
    await page.locator('[id$="-new-servings"]:visible').fill("2");
    await page
      .getByRole("button", { name: "+ Thêm nguyên liệu", exact: true })
      .click();
    await page.getByLabel("Tên nguyên liệu", { exact: true }).fill("Bánh phở");
    await page
      .getByRole("button", { name: "+ Thêm bước tiếp theo", exact: true })
      .click();
    await page
      .getByLabel("Mô tả bước 1", { exact: true })
      .fill("Chuẩn bị nước dùng.");
    const created = await submit(
      page,
      api,
      "/api/v1/recipes",
      page.getByRole("button", { name: "Lưu bản nháp", exact: true }),
      201,
    );
    const { data: recipe } = await created.json();
    await page.getByRole("link", { name: "Tiếp tục chỉnh sửa" }).waitFor();
    console.log("PASS browser: create draft with active children");

    const allowNavigation = (dialog) => dialog.accept();
    page.on("dialog", allowNavigation);
    try {
      await page.getByRole("link", { name: "Tiếp tục chỉnh sửa" }).click();
      await page.waitForURL(`**/dashboard/recipes/${recipe.id}/edit`);
    } finally {
      page.off("dialog", allowNavigation);
    }
    await page.getByRole("button", { name: "Xuất bản", exact: true }).click();
    await submit(
      page,
      api,
      `/api/v1/recipes/${recipe.id}/publish`,
      page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Xác nhận", exact: true }),
      200,
      "PATCH",
    );
    console.log("PASS browser: publish");

    const guest = await browser.newPage();
    await guest.goto(origin + "/search", { timeout: 90000 });
    const keyword = guest.getByRole("textbox", { name: "Từ khóa tìm kiếm" });
    await keyword.fill(title);
    await keyword.press("Enter");
    await guest
      .getByRole("heading", { name: title, exact: true })
      .waitFor({ timeout: 45000 });
    console.log("PASS browser: guest search finds the published recipe");
    return ["register", "login", "create recipe", "publish", "search"];
  } finally {
    await browser?.close();
    web.kill();
    await Promise.race([exited, delay(5000, undefined, { ref: false })]);
  }
}
