/* eslint-disable @typescript-eslint/no-require-imports -- This Node CommonJS test harness loads Next's bundled webpack. */
// Browser component integration: real React/effects/timers, API and next/image stubbed.
// PLAYWRIGHT_MODULE may point to a locally installed Playwright package; no new app dependency required.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

(async () => {
  const directory = path.resolve("build/image-processing-ui");
  fs.mkdirSync(directory, { recursive: true });
  const source = fs.readFileSync("components/dashboard/RecipeImageProcessingPreview.tsx", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    .replaceAll('require("@/lib/api/fileApi")', 'require("./api.cjs")').replaceAll('require("next/image")', 'require("./image.cjs")');
  fs.writeFileSync(path.join(directory, "preview.cjs"), compiled);
  fs.writeFileSync(path.join(directory, "image.cjs"), 'module.exports=({unoptimized,...props})=>require("react").createElement("img",props);');
  fs.writeFileSync(path.join(directory, "api.cjs"), `exports.getRecipeImageStatus=async()=>{
    window.pollCalls++;const next=window.responses.shift()||{processingStatus:"Processing"};
    if(next.error)throw {response:{status:next.error}};return {...window.initial,...next};
  };`);
  fs.writeFileSync(path.join(directory, "entry.cjs"), `const React=require("react"),{createRoot}=require("react-dom/client"),Preview=require("./preview.cjs").default;
    const root=createRoot(document.getElementById("root"));let key=0;
    window.renderCase=(responses)=>{window.responses=responses;window.pollCalls=0;window.initial={id:String(++key),recipeId:"recipe",processingStatus:"Pending",originalUrl:"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",altText:"Món ăn Việt"};
      root.render(React.createElement(Preview,{key,initial:window.initial}));};
    window.unmountCase=()=>root.render(null);`);
  await new Promise((resolve, reject) => webpack({ mode: "development", optimization: { minimize: false }, entry: path.join(directory, "entry.cjs"), output: { path: directory, filename: "bundle.js" }, resolve: { extensions: [".js", ".cjs"] } }, (error, stats) => {
    if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true }))); else resolve();
  }));
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "chrome" });
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    await page.clock.install(); await page.setContent('<div id="root"></div>'); await page.addScriptTag({ path: path.join(directory, "bundle.js") });
    await page.evaluate(() => window.renderCase([{ processingStatus: "Processing" }, { processingStatus: "Completed", mediumUrl: "https://image.test/medium.jpg", thumbnailUrl: "https://image.test/thumbnail.jpg" }]));
    await page.getByRole("status").filter({ hasText: "Đang chờ tạo thumbnail" }).waitFor();
    await page.clock.runFor(1100); await page.getByRole("status").filter({ hasText: "Đang tạo thumbnail" }).waitFor();
    await page.clock.runFor(3100); await page.getByRole("link", { name: "Ảnh vừa 800×600" }).waitFor();
    await page.clock.runFor(15000); assert.equal(await page.evaluate(() => window.pollCalls), 2);
    await page.evaluate(() => window.renderCase([{ error: 403 }])); await page.clock.runFor(1200);
    await page.getByRole("alert").waitFor(); await page.clock.runFor(15000); assert.equal(await page.evaluate(() => window.pollCalls), 1);
    await page.evaluate(() => window.renderCase([{ error: 500 }, { error: 500 }, { error: 500 }]));
    await page.clock.runFor(1100); await page.clock.runFor(3100); await page.clock.runFor(3100); await page.clock.runFor(15000);
    assert.equal(await page.evaluate(() => window.pollCalls), 3);
    await page.evaluate(() => window.renderCase([{ processingStatus: "Processing" }])); await page.clock.runFor(1100);
    await page.evaluate(() => window.unmountCase()); await page.clock.runFor(15000); assert.equal(await page.evaluate(() => window.pollCalls), 1);
    process.stdout.write("Browser UI passed: pending → processing → completed links; terminal stop; 403 stop; bounded errors; unmount cleanup.\n");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
