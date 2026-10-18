/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node/Chrome regression harness. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "build", "recipe-creation-tests");
fs.mkdirSync(output, { recursive: true });
function compile(relative, target, replacements = {}) {
  let code = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to);
  fs.writeFileSync(path.join(output, target), code);
}
compile("lib/validations/createRecipe.ts", "validation.cjs");
const { buildCreateRecipePayload } = require(path.join(output, "validation.cjs"));
const form = () => ({ title: "Đậu đỏ", description: "", category: "11111111-1111-1111-1111-111111111111",
  difficulty: "1", prepTime: "", cookTime: "0", servings: "2",
  ingredients: [{ name: "", quantity: "", unit: "" }], steps: [{ description: "" }],
  nutrition: { calories: "", protein: "", carbohydrates: "", fat: "", fiber: "", sodium: "" } });
const draft = buildCreateRecipePayload(form());
assert.deepEqual(draft.ingredients, []); assert.deepEqual(draft.steps, []);
assert.equal(draft.prepTime, 0);
for (const update of [
  { title: "  " }, { category: "" }, { difficulty: "8" }, { prepTime: "0.5" }, { servings: "0" },
  { ingredients: [{ name: "Muối", quantity: "0", unit: "" }] },
  { ingredients: [{ name: "", quantity: "1", unit: "g" }] },
  { ingredients: [{ name: "Muối", quantity: "0.0001", unit: "g" }] },
  { nutrition: { ...form().nutrition, calories: "NaN" } },
  { nutrition: { ...form().nutrition, calories: "12.345" } },
  { steps: [{ description: "a".repeat(2001) }] },
]) assert.throws(() => buildCreateRecipePayload({ ...form(), ...update }));
console.log("Payload checks passed (Draft, nested values, numeric boundaries).");

async function browser() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  compile("app/dashboard/recipes/new/page.tsx", "page.cjs", {
    "@/lib/api/recipeApi": "./api.cjs", "@/lib/api/categoryApi": "./api.cjs",
    "@/lib/validations/createRecipe": "./validation.cjs",
    "@/components/common/FileUploadDropzone": "./upload.cjs",
  });
  fs.writeFileSync(path.join(output, "api.cjs"), `
exports.categoryApi={getAll:async()=>[{id:'11111111-1111-1111-1111-111111111111',name:'Món chính'}]};
exports.recipeApi={create:async(payload)=>{window.calls.push(payload);await new Promise(r=>setTimeout(r,100));
if(window.fail)throw {response:{data:{errors:{Title:['Lỗi từ API']}}}};
return {id:'recipe-1',slug:'dau-do-2',rowVersion:'AQ=='};}};`);
  fs.writeFileSync(path.join(output, "upload.cjs"), `module.exports=()=>require('react').createElement('p',null,'Upload ready');`);
  fs.writeFileSync(path.join(output, "entry.cjs"), `const React=require('react');const {createRoot}=require('react-dom/client');
const Page=require('./page.cjs').default;window.calls=[];createRoot(document.getElementById('root')).render(React.createElement(Page));`);
  const webpack = require("next/dist/compiled/webpack/webpack").webpack;
  await new Promise((resolve, reject) => webpack({ mode: "development", optimization: { minimize: false },
    entry: path.join(output, "entry.cjs"), output: { path: output, filename: "bundle.js" },
    resolve: { extensions: [".js", ".cjs"] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()));
  const instance = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await instance.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ path: path.join(output, "bundle.js") });
    await page.getByPlaceholder("Ví dụ: Phở bò truyền thống").fill("Đậu đỏ");
    await page.locator("select").first().selectOption(form().category);
    await page.getByPlaceholder("4", { exact: true }).fill("2");
    await page.getByPlaceholder("Tên nguyên liệu").fill("Muối");
    await page.getByPlaceholder("Số lượng").fill("0");
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.evaluate(() => window.calls.length), 0);
    await page.getByPlaceholder("Tên nguyên liệu").fill("");
    await page.getByPlaceholder("Số lượng").fill("");
    await page.evaluate(() => { window.fail = true; });
    await page.getByRole("button", { name: "Lưu bản nháp", exact: true }).click();
    await page.getByText("Lỗi từ API", { exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder("Ví dụ: Phở bò truyền thống").inputValue(), "Đậu đỏ");
    await page.evaluate(() => { window.fail = false; document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit(); });
    await page.getByRole("status").waitFor();
    assert.equal(await page.evaluate(() => window.calls.length), 2);
    assert.deepEqual(await page.evaluate(() => window.calls[1].ingredients), []);
    assert.deepEqual(await page.evaluate(() => window.calls[1].steps), []);
    assert.equal(await page.getByPlaceholder("ten-mon-an").inputValue(), "dau-do-2");
    await page.getByText("Upload ready", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log("Chrome component checks passed (validation, API errors, Draft, duplicate submits, final slug, upload).");
  } finally { await instance.close(); }
}
if (process.argv.includes("--browser")) browser().catch(error => { console.error(error); process.exitCode = 1; });
