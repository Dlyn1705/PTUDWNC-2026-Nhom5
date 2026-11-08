/* eslint-disable @typescript-eslint/no-require-imports -- Test TypeScript form rules without adding a runner dependency. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");
const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/step-form.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: moduleUnderTest.exports, require, URL });
const { emptyStep, stepDraftSchema, stepFormSchema, stepPayload } = moduleUnderTest.exports;
const valid = () => ({ ...emptyStep(), description: " Trộn " });
test("blank title, timer and image normalize to null without a client step number", () => {
  const payload = stepPayload(stepDraftSchema.parse(valid()));
  assert.equal(payload.title, null); assert.equal(payload.timerMinutes, null); assert.equal(payload.imageUrl, null);
  assert.equal(payload.description, "Trộn"); assert.equal("stepNumber" in payload, false);
});
for (const timer of ["-1", "1.5", "NaN", "Infinity", "2147483648", "1e2"]) {
  test(`timer ${timer} is rejected`, () => assert.equal(stepDraftSchema.safeParse({ ...valid(), timerMinutes: timer }).success, false));
}
test("timer 0 and maximum int are preserved", () => {
  for (const value of ["0", "2147483647"]) assert.equal(stepPayload(stepDraftSchema.parse({ ...valid(), timerMinutes: value })).timerMinutes, Number(value));
});
test("title/description boundaries and empty draft list", () => {
  assert.equal(stepDraftSchema.safeParse({ ...valid(), title: "T".repeat(200), description: "D".repeat(2000) }).success, true);
  assert.equal(stepDraftSchema.safeParse({ ...valid(), title: "T".repeat(201) }).success, false);
  assert.equal(stepDraftSchema.safeParse({ ...valid(), description: "D".repeat(2001) }).success, false);
  assert.equal(stepDraftSchema.safeParse({ ...valid(), description: " " }).success, false);
  assert.equal(stepFormSchema.safeParse({ items: [] }).success, true);
  assert.equal(stepFormSchema.safeParse({ items: Array.from({ length: 101 }, valid) }).success, false);
});
for (const imageUrl of ["javascript:alert(1)", "data:image/svg+xml,a", "file:///test", "https://user:password@example.invalid/image.jpg"]) {
  test(`unsafe image URL ${imageUrl.split(":")[0]} rejected`, () => assert.equal(stepDraftSchema.safeParse({ ...valid(), imageUrl }).success, false));
}
test("HTTP/HTTPS images accepted without mutating unrelated fields", () => {
  for (const imageUrl of ["http://localhost:9000/recipes/a.jpg", "https://images.unsplash.com/a.jpg"])
    assert.equal(stepPayload(stepDraftSchema.parse({ ...valid(), imageUrl })).imageUrl, imageUrl);
});
