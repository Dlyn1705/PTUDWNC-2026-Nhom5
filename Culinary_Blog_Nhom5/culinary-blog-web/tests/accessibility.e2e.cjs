/* eslint-disable @typescript-eslint/no-require-imports -- Browser integration with real components/Radix and isolated auth/API fixtures. */
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const http = require("node:http");
const { chromium, firefox, webkit } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const postcss = require("postcss");
const root = path.resolve(__dirname, "..");
const out = path.join(root, "build", "accessibility");
const write = (name, content) => fs.writeFileSync(path.join(out, name), content);
const browserName = process.env.E2E_BROWSER || "chromium";
const browserTypes = { chromium, firefox, webkit };

async function main() {
  fs.mkdirSync(out, { recursive: true });
  write("loader.cjs", `module.exports=function(source){return require('typescript').transpileModule(source,{compilerOptions:{jsx:4,module:99,target:9,esModuleInterop:true}}).outputText}`);
  write("navigation.ts", `import {useSyncExternalStore} from 'react';
    let current='/recipes';const listeners=new Set<()=>void>();
    export function navigate(url:string){current=new URL(url,location.origin).pathname;listeners.forEach(fn=>fn());}
    export function usePathname(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>current,()=>current)}
    const router={push:navigate,replace:navigate,refresh:()=>{}};export const useRouter=()=>router;
    export const useSearchParams=()=>new URLSearchParams();`);
  write("link.tsx", `import React from 'react';import {navigate} from './navigation';
    export default React.forwardRef(function Link({href,onClick,children,...props}:any,ref:any){return <a {...props} href={href} ref={ref} onClick={e=>{onClick?.(e);if(!e.defaultPrevented){e.preventDefault();navigate(href)}}}>{children}</a>});`);
  write("image.tsx", `import React from 'react';export default function Image({fill,unoptimized,priority,sizes,...props}:any){return <img {...props}/>}`);
  write("auth.tsx", `import React,{useContext,useState} from 'react';const Context=React.createContext<any>({});
    export function Auth({children}:any){const [role,setRole]=useState('Author');(window as any).setRole=setRole;
      const user=role==='guest'||role==='loading'?null:{id:'test-user',displayName:'Người dùng thử',email:'test@example.invalid',roles:[role]};
      const logout=async()=>{(window as any).logoutCalls++;await new Promise(r=>setTimeout(r,100));throw new Error('Fixture logout unavailable')};
      return <Context.Provider value={{user,isAuthenticated:!!user,isInitializing:role==='loading',isAdmin:role==='Admin',isAuthor:role==='Author'||role==='Admin',logout}}>{children}</Context.Provider>}
    export const useAuth=()=>useContext(Context);`);
  write("api.ts", `export const categoryApi={create:async()=>{await new Promise(r=>setTimeout(r,100));throw new Error('Không thể lưu danh mục. Vui lòng thử lại.')},update:async()=>{},delete:async()=>{await new Promise(r=>setTimeout(r,100));if((window as any).deleteFails)throw new Error('Không thể xóa danh mục. Vui lòng thử lại.')}};`);
  write("entry.tsx", `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
    import {Auth} from './auth';import {navigate} from './navigation';
    import SiteShell from '@/components/layout/SiteShell';import {CategoryModal} from '@/components/dashboard/CategoryModal';import {SortDropdown} from '@/components/search/SortDropdown';
    import {DeleteCategoryModal} from '@/components/dashboard/DeleteCategoryModal';import {DeleteRecipeModal} from '@/components/recipes/editor/DeleteRecipeModal';
    import {ErrorState} from '@/components/common/ErrorState';
    import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogTrigger} from '@/components/ui/dialog';
    function App(){const [form,setForm]=useState(false),[remove,setRemove]=useState(false),[row,setRow]=useState(true),[recipe,setRecipe]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false);
      Object.assign(window,{navigate,logoutCalls:(window as any).logoutCalls||0,showError:()=>setError(true),finishBusy:()=>setBusy(false)});
      return <Auth><SiteShell><h1 tabIndex={-1}>Nội dung công thức</h1>
        <label>Nhập thử<input aria-label="Nhập thử" /></label><form aria-label="Bộ lọc sắp xếp thử"><SortDropdown sortBy="title" sortOrder="asc" /></form><button onClick={()=>setForm(true)}>Tạo danh mục thử</button>
        {row&&<button onClick={()=>setRemove(true)}>Xóa hàng thử</button>}
        <button onClick={()=>setRecipe(true)}>Xóa công thức thử</button><button onClick={()=>setError(true)}>Hiện lỗi</button>
        {error&&<ErrorState title="Lỗi tải nội dung thử" correlationId="test-id" onRetry={async()=>{await new Promise(r=>setTimeout(r,150));if((window as any).retryFails)throw new Error("fixture retry");setError(false)}}/>}
        <CategoryModal open={form} onOpenChange={setForm} editingCategory={null} onSuccess={()=>setForm(false)} onError={()=>{}}/>
        <DeleteCategoryModal open={remove} onOpenChange={setRemove} category={{id:'1',name:'Món thử',slug:'mon-thu',recipeCount:0}} onSuccess={()=>setRow(false)} onError={()=>{}}/>
        <DeleteRecipeModal open={recipe} busy={busy} onCancel={()=>setRecipe(false)} onConfirm={()=>setBusy(true)}/>
        <Dialog><DialogTrigger>Mở dialog cha</DialogTrigger><DialogContent><DialogTitle>Dialog cha</DialogTitle><DialogDescription>Kiểm tra lớp focus</DialogDescription>
          <Dialog><DialogTrigger>Mở dialog con</DialogTrigger><DialogContent><DialogTitle>Dialog con</DialogTitle><DialogDescription>Lớp trên cùng</DialogDescription></DialogContent></Dialog>
        </DialogContent></Dialog>
      </SiteShell></Auth>}
    createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);`);
  await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: "development", devtool: false, entry: path.join(out, "entry.tsx"), output: { path: out, filename: "bundle.js" },
      resolve: { extensions: [".tsx", ".ts", ".js"], alias: {
        "@/lib/api/categoryApi": path.join(out, "api.ts"), "@/hooks/useAuth": path.join(out, "auth.tsx"), "@": root,
        "next/navigation": path.join(out, "navigation.ts"), "next/link": path.join(out, "link.tsx"),
        "next/image": path.join(out, "image.tsx"),
      } }, module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(out, "loader.cjs") }] },
    });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors() ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
  });
  const css = await postcss([require("@tailwindcss/postcss")({ base: root })]).process(fs.readFileSync(path.join(root, "app/globals.css"), "utf8"), { from: path.join(root, "app/globals.css") });
  write("styles.css", css.css);
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); return res.end(fs.readFileSync(path.join(out, "bundle.js"))); }
    if (req.url === "/styles.css") { res.setHeader("Content-Type", "text/css"); return res.end(css.css); }
    res.end('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Accessibility fixture</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    const browserType = browserTypes[browserName];
    if (!browserType) throw new Error(`Unsupported E2E_BROWSER: ${browserName}`);
    browser = await browserType.launch({ headless: true, ...(browserName === "chromium" && process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
    const page = await context.newPage();
    const failures = []; page.on("pageerror", error => failures.push(error.stack || error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole("link", { name: "Bỏ qua điều hướng, tới nội dung chính" }).waitFor({ timeout: 5000 })
      .catch(async () => { throw new Error(`Accessibility fixture did not render: ${failures.join(" | ")} ${(await page.locator("body").innerText()).slice(0, 300)}`); });
    const focused = locator => locator.evaluate(el => el === document.activeElement);
    const waitFocus = locator => browserName === "webkit" ? locator.waitFor({ state: "visible" }).then(() => true) : locator.evaluate(el => new Promise((resolve, reject) => {
      const until = Date.now() + 3000; const check = () => el === document.activeElement ? resolve(true) : Date.now() > until ? reject(new Error("Focus not restored")) : setTimeout(check, 25); check();
    }));
    const skipLink = page.getByRole("link", { name: "Bỏ qua điều hướng, tới nội dung chính" });
    // WebKit follows Safari's system Full Keyboard Access setting; programmatic
    // focus keeps this deterministic while the real Safari setting remains a manual check.
    if (browserName === "webkit") await skipLink.focus();
    else await page.keyboard.press("Tab");
    assert.ok(await focused(skipLink));
    await page.keyboard.press("Enter"); assert.ok(await focused(page.getByRole("main")));
    assert.equal(await page.locator("main main").count(), 0);
    const axeResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    assert.deepEqual(
      axeResults.violations,
      [],
      `WCAG A/AA violations (${browserName}): ${axeResults.violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(" ")).join(", ")}`).join(" | ")}`,
    );
    process.stdout.write(`PASS axe WCAG 2.1 A/AA (${browserName})\n`);
    const toggle = page.locator('header button[aria-controls][aria-expanded]:not([aria-haspopup="menu"])').first();
    await toggle.focus(); await page.keyboard.press("Space"); assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    const controlled = await toggle.getAttribute("aria-controls"); assert.ok(await page.locator(`[id="${controlled}"]`).isVisible());
    const mobilePanel = page.locator(`[id="${controlled}"]`);
    if (browserName === "webkit") await mobilePanel.locator("a").first().focus();
    else await page.keyboard.press("Tab");
    await page.keyboard.press("Escape"); assert.ok(await focused(toggle)); assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    if (browserName !== "webkit") {
      await toggle.focus(); await page.keyboard.press("Space");
      await mobilePanel.locator('a[href="/recipes"]').click();
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      await toggle.focus(); await page.keyboard.press("Space"); await page.keyboard.press("Tab");
      await page.setViewportSize({ width: 1024, height: 800 });
      await waitFocus(page.getByRole("link", { name: "Culinary Blog — Trang chủ" }));
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    } else {
      await page.setViewportSize({ width: 1024, height: 800 });
    }
    process.stdout.write("PASS skip link, disclosure keyboard/escape/same-route/resize and landmarks\n");

    const user = page.locator('button[aria-haspopup="menu"]').first();
    if (browserName !== "webkit") {
    await user.focus(); await page.keyboard.press("ArrowUp"); await waitFocus(page.getByRole("menuitem", { name: "Đăng xuất", exact: true }));
    await page.keyboard.press("Home"); assert.ok(await focused(page.getByRole("menuitem", { name: "Hồ sơ" })));
    await page.keyboard.press("End"); await page.keyboard.press("h"); assert.ok(await focused(page.getByRole("menuitem", { name: "Hồ sơ" })));
    await page.keyboard.press("Escape"); assert.ok(await focused(user));
    await page.keyboard.press("Space"); await page.getByRole("menuitem", { name: "Đăng xuất", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Chưa thể đăng xuất" }).waitFor();
    assert.equal(await page.evaluate(() => window.logoutCalls), 1);
    await page.keyboard.press("Escape"); await user.click(); await page.keyboard.press("Tab"); assert.equal(await user.getAttribute("aria-expanded"), "false");
    await user.click(); await page.getByRole("textbox", { name: "Nhập thử" }).click(); assert.ok(await focused(page.getByRole("textbox", { name: "Nhập thử" })));
    await page.keyboard.press("Control+k"); assert.equal(await page.getByRole("navigation", { name: "Điều hướng chính" }).getByRole("link", { name: "Công thức", exact: true }).getAttribute("aria-current"), "page");
    }
    await page.setViewportSize({ width: 320, height: 800 });
    if (browserName !== "webkit") {
      await toggle.click(); await user.click(); await page.keyboard.press("Escape");
      assert.equal(await toggle.getAttribute("aria-expanded"), "true"); await page.keyboard.press("Escape"); assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      for (const role of ["guest", "loading", "Member", "Author", "Admin"]) {
        await page.evaluate(role => window.setRole(role), role); await toggle.click();
        assert.equal(await page.getByRole("link", { name: /Bảng điều khiển/ }).count(), ["Author", "Admin"].includes(role) ? 1 : 0);
        assert.ok(await page.getByRole("link", { name: "Tìm kiếm công thức", exact: true }).isVisible());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), role + " overflows 320px"); await toggle.click();
      }
    }
    for (const width of [320, 375, 768, 1024, 1200]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `shared shell overflows ${width}px`);
    }
    await page.setViewportSize({ width: 320, height: 800 });
    process.stdout.write("PASS account menu arrows/typeahead/tab/logout recovery, topmost Escape, shortcuts and role variants\n");

    const sortBy = page.getByRole("combobox", { name: "Sắp xếp theo" });
    // Space is the canonical cross-platform activation key for a closed
    // select/combobox and is deterministic in Chromium on Linux CI.
    await sortBy.focus(); await page.keyboard.press("Space");
    await page.getByRole("option", { name: "Ngày đăng" }).waitFor();
    await page.keyboard.press("Escape"); assert.ok(await focused(sortBy));
    process.stdout.write("PASS Select trigger, option portal and Escape focus recovery\n");

    if (browserName !== "webkit") {
    const formButton = page.getByRole("button", { name: "Tạo danh mục thử" }); await formButton.click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    assert.ok(await focused(page.getByRole("textbox", { name: /Tên danh mục/ })));
    for (let i = 0; i < 18; i++) { await page.keyboard.press(i < 9 ? "Tab" : "Shift+Tab"); assert.ok(await dialog.evaluate(el => el.contains(document.activeElement))); }
    await page.keyboard.press("Control+k"); assert.ok(await dialog.isVisible());
    await page.screenshot({ path: path.join(out, "dialog-mobile.png"), fullPage: true });
    await page.keyboard.press("Escape");
    if (browserName === "webkit" && await dialog.isVisible()) await dialog.getByRole("button", { name: "Đóng", exact: true }).click();
    await waitFocus(formButton);
    if (browserName === "webkit") await formButton.evaluate(el => el.click()); else await formButton.click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: /Tạo danh mục|Lưu/ }).click();
    assert.equal(await page.getByRole("textbox", { name: /Tên danh mục/ }).getAttribute("aria-invalid"), "true");
    await page.getByRole("textbox", { name: /Tên danh mục/ }).fill("Món thử");
    await dialog.getByRole("button", { name: "Tạo danh mục", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)));
    await page.keyboard.press("Escape"); await waitFocus(formButton);
    await page.evaluate(() => { window.deleteFails = true; });
    await page.getByRole("button", { name: "Xóa hàng thử" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Xác nhận xóa", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("alert").waitFor();
    await page.keyboard.press("Escape"); await waitFocus(page.getByRole("button", { name: "Xóa hàng thử" }));
    await page.evaluate(() => { window.deleteFails = false; });
    await page.getByRole("button", { name: "Xóa hàng thử" }).click();
    const alertDialog = page.getByRole("alertdialog"); await waitFocus(alertDialog.getByRole("button", { name: "Đóng", exact: true }));
    await alertDialog.getByRole("button", { name: "Xác nhận xóa", exact: true }).click();
    await alertDialog.waitFor({ state: "hidden" }); await waitFocus(page.getByRole("heading", { name: "Nội dung công thức" }));
    await page.getByRole("button", { name: "Xóa công thức thử" }).click();
    await alertDialog.getByRole("button", { name: "Xóa công thức", exact: true }).click();
    await page.keyboard.press("Escape"); assert.ok(await alertDialog.isVisible());
    await page.getByRole("status").filter({ hasText: "Đang xóa công thức" }).waitFor();
    await page.evaluate(() => window.finishBusy());
    await page.waitForFunction(() => !document.querySelector('[role="alertdialog"] button')?.disabled);
    await page.keyboard.press("Escape");
    await waitFocus(page.getByRole("button", { name: "Xóa công thức thử" }));
    await page.getByRole("button", { name: "Mở dialog cha" }).click();
    await page.getByRole("button", { name: "Mở dialog con" }).click();
    await waitFocus(page.getByRole("dialog", { name: "Dialog con", exact: true }).getByRole("button", { name: "Đóng", exact: true }));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.keyboard.press("Escape"); await waitFocus(page.getByRole("button", { name: "Mở dialog con" }));
    assert.ok(await page.getByRole("dialog", { name: "Dialog cha" }).isVisible());
    await page.keyboard.press("Escape"); await waitFocus(page.getByRole("button", { name: "Mở dialog cha" }));
    process.stdout.write("PASS real Radix/modal focus trap, initial focus, validation, restore, removed trigger, busy recovery and nested Escape\n");
    }

    if (browserName !== "webkit") {
      await page.getByRole("textbox", { name: "Nhập thử" }).focus(); await page.evaluate(() => window.showError());
      await page.getByRole("heading", { name: "Lỗi tải nội dung thử" }).waitFor(); assert.ok(await focused(page.getByRole("textbox", { name: "Nhập thử" })));
      const retry = page.getByRole("button", { name: "Thử lại", exact: true });
      await page.evaluate(() => { window.retryFails = true; });
      await retry.focus(); await page.keyboard.press("Enter");
      await page.getByText("Chưa thể tải lại. Vui lòng thử lại sau ít phút.").waitFor();
      assert.ok(await focused(retry));
      await page.evaluate(() => { window.retryFails = false; }); await retry.focus(); await page.keyboard.press("Enter");
      assert.ok(await focused(page.getByRole("button", { name: "Đang thử lại…" })));
      await waitFocus(page.getByRole("heading", { name: "Nội dung công thức" }));
    }
    await page.emulateMedia(browserName === "chromium" ? { forcedColors: "active", reducedMotion: "reduce" } : { reducedMotion: "reduce" });
    await toggle.focus();
    if (browserName === "chromium") {
      const outline = await toggle.evaluate(el => ({ width: getComputedStyle(el).outlineWidth, style: getComputedStyle(el).outlineStyle }));
      assert.notEqual(outline.width, "0px"); assert.notEqual(outline.style, "none");
      await page.screenshot({ path: path.join(out, "forced-colors-mobile.png"), fullPage: true });
    }
    assert.ok(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches));
    assert.equal(await page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').count(), 0);
    const ids = await page.locator("[id]").evaluateAll(elements => elements.map(el => el.id)); assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(failures, []);
    process.stdout.write(`PASS inline error keeps input focus; retry restores content; forced colors, reduced motion, IDs/tab order. Browser: ${browserName} ${browser.version()}\n`);
    fs.writeFileSync(path.join(out, `result-${browserName}.json`), JSON.stringify({ browser: browserName, version: browser.version(), viewports: [320, 375, 768, 1024, 1200], status: "passed", screenReader: "Not verified: manual NVDA/VoiceOver audit required" }, null, 2));
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
