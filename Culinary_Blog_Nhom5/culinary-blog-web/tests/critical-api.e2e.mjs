import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { request } from "playwright";

assert.ok(
  process.env.CRITICAL_TEST_CONNECTION,
  "Set CRITICAL_TEST_CONNECTION for disposable PostgreSQL.",
);
const child = spawn(
  "dotnet",
  [
    "run",
    "--no-launch-profile",
    "--project",
    "tests/CulinaryBlog.Critical.E2E",
  ],
  {
    cwd: path.resolve(".."),
    env: process.env,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  },
);
let logs = "";
child.stdout.on("data", (data) => {
  logs = (logs + data).slice(-12000);
});
child.stderr.on("data", (data) => {
  logs = (logs + data).slice(-12000);
});
const exited = new Promise((resolve) => child.once("exit", resolve));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let guest, author;
const flows = [];
const endpointCases = [];
let passed = false;
try {
  let origin;
  for (let attempt = 0; attempt < 900; attempt++) {
    origin = logs.match(/CRITICAL_E2E_READY (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (origin || child.exitCode !== null) break;
    await delay(200);
  }
  assert.ok(
    origin,
    "Critical API fixture did not start; inspect local build output.",
  );
  guest = await request.newContext({ baseURL: origin });
  const email = `critical-${randomUUID()}@example.test`;
  const password = "Isolated-Critical-Test-Password1!";
  const registration = {
    email,
    displayName: "Critical Chef",
    password,
    confirmPassword: password,
  };
  const createdUser = await guest.post("/api/v1/auth/register", {
    data: registration,
  });
  assert.equal(createdUser.status(), 201);
  assert.equal(
    (
      await guest.post("/api/v1/auth/register", { data: registration })
    ).status(),
    409,
  );
  flows.push({ flow: "register", passed: true, errorCase: 409 });
  assert.equal(
    (
      await guest.post("/api/v1/auth/login", {
        data: { email, password: "wrong-password" },
      })
    ).status(),
    401,
  );
  const login = await guest.post("/api/v1/auth/login", {
    data: { email, password },
  });
  assert.equal(login.status(), 200);
  const token = (await login.json()).data.accessToken;
  assert.ok(token);
  author = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Authorization: `Bearer ${token}` },
  });
  flows.push({ flow: "login", passed: true, errorCase: 401 });
  const title = "Critical Phở " + randomUUID().replaceAll("-", "");
  const input = {
    title,
    description: "Critical journey",
    prepTime: 5,
    cookTime: 10,
    servings: 2,
    difficulty: 1,
    categoryId: "11111111-1111-4111-8111-111111111111",
    ingredients: [{ name: "Nước", quantity: 1, unit: "l" }],
    steps: [{ description: "Nấu chín" }],
  };
  assert.equal(
    (await guest.post("/api/v1/recipes", { data: input })).status(),
    401,
  );
  const created = await author.post("/api/v1/recipes", { data: input });
  assert.equal(created.status(), 201);
  const body = await created.json();
  const recipe = body.data ?? body;
  assert.ok(recipe.id);
  flows.push({ flow: "create recipe", passed: true, errorCase: 401 });
  const oldSlug = recipe.slug;
  const renamed = await author.put(`/api/v1/recipes/${recipe.id}`, {
    data: { ...input, title: title + " mới", rowVersion: recipe.rowVersion },
  });
  assert.equal(renamed.status(), 200);
  Object.assign(recipe, (await renamed.json()).data);
  const hidden = await guest.get(
    `/api/v1/recipes/search?q=${encodeURIComponent(title)}`,
  );
  assert.equal(hidden.status(), 200);
  assert.equal((await hidden.json()).data.length, 0);
  assert.equal(
    (await guest.patch(`/api/v1/recipes/${recipe.id}/publish`)).status(),
    401,
  );
  assert.equal(
    (await author.patch(`/api/v1/recipes/${recipe.id}/publish`)).status(),
    200,
  );
  assert.equal(
    (await author.patch(`/api/v1/recipes/${recipe.id}/publish`)).status(),
    200,
  );
  flows.push({ flow: "publish", passed: true, errorCase: 401 });
  const found = await guest.get(
    `/api/v1/recipes/search?q=${encodeURIComponent(title)}`,
  );
  assert.equal(found.status(), 200);
  assert.ok((await found.json()).data.some((item) => item.id === recipe.id));
  assert.equal((await guest.get("/api/v1/recipes/search?q=x")).status(), 422);
  flows.push({ flow: "search", passed: true, errorCase: 422 });
  async function endpointPair(operation, happy, error, errorStatus) {
    assert.equal((await happy).status(), 200, `${operation} happy path`);
    assert.equal(
      (await error).status(),
      errorStatus,
      `${operation} error path`,
    );
    endpointCases.push({
      operation,
      happy: 200,
      error: errorStatus,
      passed: true,
    });
  }
  await endpointPair(
    "AuthPing",
    guest.get("/api/v1/auth/ping"),
    guest.delete("/api/v1/auth/ping"),
    405,
  );
  await endpointPair(
    "GetCategories",
    guest.get("/api/v1/categories"),
    guest.delete("/api/v1/categories"),
    405,
  );
  await endpointPair(
    "GetRecipes",
    guest.get("/api/v1/recipes"),
    guest.get("/api/v1/recipes?page=bad"),
    400,
  );
  await endpointPair(
    "GetRecipeById",
    author.get(`/api/v1/recipes/${recipe.id}`),
    guest.get(`/api/v1/recipes/${randomUUID()}`),
    404,
  );
  await endpointPair(
    "GetManagedRecipes",
    author.get("/api/v1/recipes/mine"),
    guest.get("/api/v1/recipes/mine"),
    401,
  );
  await endpointPair(
    "GetRecipeBySlug",
    guest.get(`/api/v1/recipes/${recipe.slug}`),
    guest.get("/api/v1/recipes/missing-recipe"),
    404,
  );
  await endpointPair(
    "ResolveRecipeSlug",
    guest.get(`/api/v1/recipes/resolve/${oldSlug}`),
    guest.get("/api/v1/recipes/resolve/missing-recipe"),
    404,
  );
  await endpointPair(
    "GetProfileRecipeStats",
    author.get("/api/v1/auth/me/recipe-stats"),
    guest.get("/api/v1/auth/me/recipe-stats"),
    401,
  );
  passed = true;
  console.log(
    "Five critical API E2E flows passed with production handlers, JWT and isolated PostgreSQL; no route mocks.",
  );
} finally {
  await author?.dispose();
  await guest?.dispose();
  child.stdin.end("stop\n");
  const stopped = await Promise.race([
    exited.then(() => true),
    delay(20000).then(() => false),
  ]);
  if (!stopped) {
    child.kill();
    throw new Error(
      "Fixture cleanup timed out; inspect isolated database cleanup.",
    );
  }
  assert.equal(child.exitCode, 0, "Fixture did not exit cleanly");
  const output = path.resolve("../../artifacts/quality");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "critical-api-e2e.json"),
    JSON.stringify(
      { kind: "Playwright API E2E (not UI)", passed, flows, endpointCases },
      null,
      2,
    ),
  );
}
