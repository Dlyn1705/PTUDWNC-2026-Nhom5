/* eslint-disable @typescript-eslint/no-require-imports -- Same isolated TS runner as the form tests. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ts = require("typescript");
const loaded = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/searchParams.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: loaded.exports });
const parse = loaded.exports.parseSearchParams;
test("default search uses relevance descending and API pagination defaults", () => {
  const result = parse({ q: "  phở bò  " });
  assert.equal(result.q, "phở bò"); assert.equal(result.sortBy, "relevance");
  assert.equal(result.sortOrder, "desc"); assert.equal(result.page, 1); assert.equal(result.pageSize, 12);
  assert.equal(result.errors.length, 0);
});
test("legacy aliases are read, canonical sort wins, relevance always descends", () => {
  assert.equal(parse({ sort: "-cookTime" }).sortBy, "cookTime");
  assert.equal(parse({ sort: "title" }).sortOrder, "asc");
  const result = parse({ sort: "unsafe", sortBy: " title ", sortOrder: " ASC " });
  assert.equal(result.sortBy, "title"); assert.equal(result.sortOrder, "asc"); assert.equal(result.errors.length, 0);
  assert.equal(parse({ sortOrder: "asc", sort: "title" }).sortBy, "relevance");
  assert.equal(parse({ sortBy: "relevance", sortOrder: "asc" }).sortOrder, "desc");
});
test("servings alias preserves equality and detects conflicting ranges", () => {
  assert.equal(parse({ servings: "2" }).minServings, 2);
  assert.equal(parse({ servings: "2" }).maxServings, 2);
  assert.equal(parse({ servings: "2", minServings: "3" }).errors.length > 0, true);
});
for (const params of [
  { page: "2oops" }, { page: "0" }, { page: "1.5" }, { page: "2147483647", pageSize: "50" },
  { pageSize: "51" }, { maxCookTime: "-1" }, { minServings: "0" }, { maxServings: "1.5" },
  { minCookTime: "30", maxCookTime: "10" }, { minServings: "4", maxServings: "2" },
  { categoryId: "invalid" }, { categoryId: "00000000-0000-0000-0000-000000000000" },
  { difficulty: "99" }, { sortBy: "unsafe" }, { sort: "-relevance" }, { sortOrder: "unsafe" },
  { q: "a".repeat(101) },
]) test(`invalid URL is reported: ${JSON.stringify(params)}`, () => assert.ok(parse(params).errors.length));
test("all simultaneous filters retain their values", () => {
  const result = parse({ q: ["pho", "ignored"], categoryId: "11111111-1111-1111-1111-111111111111",
    difficulty: "1", maxCookTime: "30", minCookTime: "0", servings: "2", page: "2", pageSize: "5", sortBy: "cookTime", sortOrder: "asc" });
  assert.equal(result.errors.length, 0); assert.equal(result.page, 2); assert.equal(result.pageSize, 5);
  assert.equal(result.maxCookTime, 30); assert.equal(result.minCookTime, 0); assert.equal(result.maxServings, 2);
});
test("prototype property names cannot become sort fields", () => {
  for (const name of ["constructor", "__proto__", "toString"]) {
    const result = parse({ sortBy: name });
    assert.ok(result.errors.length); assert.equal(result.sortBy, "relevance");
  }
});
