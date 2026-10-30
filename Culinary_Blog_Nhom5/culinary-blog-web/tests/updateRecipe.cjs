/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node/Chrome regression harness. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "build", "recipe-update-tests");
fs.mkdirSync(output, { recursive: true });
function compile(relative, target, replacements = {}) {
  let code = ts.transpileModule(fs.readFileSync(path.join(root, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  for (const [from, to] of Object.entries(replacements)) code = code.replaceAll(from, to);
  fs.writeFileSync(path.join(output, target), code);
}
compile("lib/validations/updateRecipe.ts", "validation.cjs");
const { validateRecipeUpdate } = require(path.join(output, "validation.cjs"));
const categoryId = "11111111-1111-1111-1111-111111111111";
const valid = { title: " Phở bò ", description: " Mô tả ", instructions: "", prepTime: 0, cookTime: 0,
  servings: 1, difficulty: 1, categoryId, rowVersion: "AQ==" };
assert.equal(validateRecipeUpdate(valid).title, "Phở bò");
for (const invalid of [{ title: "ab" }, { title: "a".repeat(201) }, { description: "a".repeat(2001) },
  { instructions: "a".repeat(10001) }, { prepTime: 0.5 }, { cookTime: -1 }, { servings: 0 },
  { difficulty: 9 }, { categoryId: "" }, { rowVersion: undefined }, { prepTime: NaN }])
  assert.throws(() => validateRecipeUpdate({ ...valid, ...invalid }));
console.log("Update payload checks passed.");

async function browser() {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  compile("app/dashboard/recipes/[id]/edit/page.tsx", "page.cjs", {
    "@/lib/api/recipeApi": "./api.cjs", "@/lib/api/categoryApi": "./api.cjs",
    "@/lib/validations/updateRecipe": "./validation.cjs", "@/hooks/useAuth": "./auth.cjs",
    "next/navigation": "./navigation.cjs", "@/components/recipes/editor/DeleteRecipeModal": "./delete.cjs",
  });
  fs.writeFileSync(path.join(output, "auth.cjs"), `exports.useAuth=()=>({user:window.session.user,isInitializing:false,isAdmin:false,isAuthor:true});`);
  fs.writeFileSync(path.join(output, "navigation.cjs"), `exports.useRouter=()=>({replace:()=>{}});`);
  fs.writeFileSync(path.join(output, "delete.cjs"), `exports.DeleteRecipeModal=()=>null;`);
  fs.writeFileSync(path.join(output, "api.cjs"), `
exports.categoryApi={getAll:async()=>[{id:'${categoryId}',name:'Món chính'}]};
exports.recipeApi={getById:async()=>{window.gets++;return {id:'recipe-1',title:'Original',description:'Description',
instructions:'Legacy',prepTimeMinutes:0,cookTimeMinutes:0,servings:1,difficulty:1,categoryId:'${categoryId}',
rowVersion:window.version,author:{id:'owner'},slug:'original',status:1};},
update:async(id,payload)=>{window.calls.push(payload);await new Promise(r=>setTimeout(r,100));
if(window.fail)throw {response:{status:window.fail,data:{errors:{Title:['Lỗi kiểm tra API']}}}};
window.version='Aw==';return {id,slug:'original',rowVersion:'Aw=='};}};`);
  fs.writeFileSync(path.join(output, "entry.cjs"), `
const React=require('react');const {createRoot}=require('react-dom/client');const Page=require('./page.cjs').default;
const root=createRoot(document.getElementById('root'));window.calls=[];window.gets=0;window.version='AQ==';
window.session={user:{id:'owner',roles:['Author'],role:'Author'}};let key=0;
window.mount=()=>root.render(React.createElement(Page,{key:++key,params:Promise.resolve({id:'recipe-1'})}));window.mount();`);
  const webpack = require("next/dist/compiled/webpack/webpack").webpack;
  await new Promise((resolve, reject) => webpack({ mode: "development", optimization: { minimize: false },
    entry: path.join(output, "entry.cjs"), output: { path: output, filename: "bundle.js" },
    resolve: { extensions: [".js", ".cjs"] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()));
  const instance = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await instance.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ path: path.join(output, "bundle.js") });
    await page.getByLabel("Tên món ăn", { exact: true }).fill("Updated");
    await page.getByLabel("Chuẩn bị", { exact: true }).fill("0.5");
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await page.getByRole("alert").waitFor(); assert.equal(await page.evaluate(() => window.calls.length), 0);
    await page.getByLabel("Chuẩn bị", { exact: true }).fill("0");
    await page.evaluate(() => { window.fail = 422; });
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await page.getByText("Lỗi kiểm tra API", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("Tên món ăn", { exact: true }).inputValue(), "Updated");
    await page.evaluate(() => { window.fail = 409; });
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await page.getByText("Công thức đã được người khác thay đổi. Hãy tải lại trước khi lưu.", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).isDisabled(), true);
    assert.equal(await page.getByLabel("Tên món ăn", { exact: true }).inputValue(), "Updated");
    await page.evaluate(() => { window.fail = 0; window.version = 'Ag=='; });
    await page.getByRole("button", { name: "Tải bản mới (bỏ thay đổi đang nhập)", exact: true }).click();
    await page.getByLabel("Tên món ăn", { exact: true }).waitFor();
    await page.getByLabel("Tên món ăn", { exact: true }).fill("Saved title");
    await page.evaluate(() => { document.querySelector('form').requestSubmit(); document.querySelector('form').requestSubmit(); });
    await page.getByRole("status").waitFor();
    assert.equal(await page.evaluate(() => window.calls.length), 3);
    assert.equal(await page.evaluate(() => window.calls[2].rowVersion), "Ag==");
    await page.getByLabel("Tên món ăn", { exact: true }).fill("Saved again");
    await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await page.getByRole("status").waitFor();
    assert.equal(await page.evaluate(() => window.calls[3].rowVersion), "Aw==");
    await page.evaluate(() => { window.session = { user: { id: 'other', roles: ['Author'] } }; window.mount(); });
    await page.getByText("Bạn không có quyền cập nhật công thức này.", { exact: true }).waitFor();
    assert.equal(await page.locator("form").count(), 0);
    await page.evaluate(() => { window.session = { user: { id: 'other', roles: ['Admin'] } }; window.mount(); });
    await page.getByLabel("Tên món ăn", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log("Chrome checks passed: owner/Admin, other-author blocked, validation, 422, 409 reload, versions, duplicate submit.");
  } finally { await instance.close(); }
}
if (process.argv.includes("--browser")) browser().catch(error => { console.error(error); process.exitCode = 1; });
