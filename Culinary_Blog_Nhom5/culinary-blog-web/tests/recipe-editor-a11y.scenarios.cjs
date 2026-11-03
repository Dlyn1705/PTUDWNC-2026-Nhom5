/* eslint-disable @typescript-eslint/no-require-imports -- Production-page Playwright scenarios shared with the editor fixture. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { AxeBuilder } = require("@axe-core/playwright");
const { randomUUID } = require("node:crypto");

module.exports = async ({ page, origin, recipe, imageRows, stepRows, ingredients: savedIngredients, png, folder, setReorderStatus }) => {
  const report = { issue: 92, fixture: "production Next.js pages with intercepted API contracts", breakpoints: [], axe: [], keyboard: [], nvda: "manual checklist; not executed by automation" };
  const press = async locator => { await locator.focus(); await page.keyboard.press("Enter"); };
  const focusAt = async locator => {
    await locator.evaluate(element => new Promise((resolve, reject) => {
      const end = Date.now() + 3000;
      const check = () => document.activeElement === element ? resolve() : Date.now() > end ? reject(new Error("Expected focus target")) : setTimeout(check, 20);
      check();
    }));
  };
  const audit = async name => {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const violations = result.violations.filter(item => ["serious", "critical"].includes(item.impact));
    report.axe.push({ name, seriousCritical: violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) })) });
    assert.deepEqual(violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })), [], name);
  };
  const responsive = async name => {
    for (const width of [320, 375, 768, 1024, 1200]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} overflow at ${width}`);
      assert.deepEqual(await page.locator('form input:not([type="file"]), form textarea, form select, [data-collection-row]').evaluateAll(elements => elements
        .filter(element => element.checkVisibility()).filter(element => { const box = element.getBoundingClientRect(); return box.left < -1 || box.right > innerWidth + 1; })
        .map(element => element.id || element.tagName)), [], `${name} clipped controls at ${width}`);
      report.breakpoints.push({ name, width, noHorizontalOverflow: true });
      await page.screenshot({ path: path.join(folder, `issue92-${name}-${width}.png`), fullPage: true });
    }
  };
  await page.goto(origin + "/dashboard/recipes/new");
  const ingredients = page.getByRole("region", { name: "Quản lý nguyên liệu", exact: true }).filter({ visible: true });
  const steps = page.getByRole("region", { name: "Quản lý các bước thực hiện", exact: true }).filter({ visible: true });
  await press(ingredients.getByRole("button", { name: "+ Thêm nguyên liệu", exact: true }));
  await focusAt(ingredients.getByLabel("Tên nguyên liệu", { exact: true }).nth(0));
  await ingredients.getByLabel("Tên nguyên liệu", { exact: true }).nth(0).fill("Gạo");
  await press(ingredients.getByRole("button", { name: "+ Thêm nguyên liệu", exact: true }));
  await ingredients.getByLabel("Tên nguyên liệu", { exact: true }).nth(1).fill("Muối");
  await press(ingredients.getByRole("button", { name: "Di chuyển nguyên liệu 2 lên", exact: true }));
  await focusAt(ingredients.getByLabel("Tên nguyên liệu", { exact: true }).nth(0));
  assert.equal(await ingredients.getByLabel("Tên nguyên liệu", { exact: true }).nth(0).inputValue(), "Muối");
  await ingredients.getByRole("status").filter({ hasText: "Đã di chuyển nguyên liệu 2 đến vị trí 1." }).waitFor();
  await press(ingredients.getByRole("button", { name: "Xóa nguyên liệu 1", exact: true }));
  await focusAt(ingredients.getByLabel("Tên nguyên liệu", { exact: true }));
  assert.equal(await ingredients.getByLabel("Tên nguyên liệu", { exact: true }).inputValue(), "Gạo");
  await press(steps.getByRole("button", { name: "+ Thêm bước tiếp theo", exact: true }));
  await focusAt(steps.getByLabel("Tiêu đề bước 1", { exact: true }));
  await steps.getByLabel("Mô tả bước 1", { exact: true }).fill("Vo gạo");
  await press(steps.getByRole("button", { name: "+ Thêm bước tiếp theo", exact: true }));
  await steps.getByLabel("Mô tả bước 2", { exact: true }).fill("Nấu cơm");
  await press(steps.getByRole("button", { name: "Di chuyển bước 2 lên", exact: true }));
  await focusAt(steps.getByLabel("Tiêu đề bước 1", { exact: true }));
  assert.equal(await steps.getByLabel("Mô tả bước 1", { exact: true }).inputValue(), "Nấu cơm");
  await press(steps.getByRole("button", { name: "Xóa bước 1", exact: true }));
  await focusAt(steps.getByLabel("Tiêu đề bước 1", { exact: true }));
  report.keyboard.push("add/reorder/delete ingredients and steps preserve order and restore focus with live announcements");
  await responsive("create"); await audit("create with field arrays");
  page.once("dialog", dialog => dialog.accept());
  stepRows.push({ ...stepRows[0], id: randomUUID(), title: "Bước thứ hai", description: "Nội dung bước thứ hai", stepNumber: 2 });
  savedIngredients.push({ ...savedIngredients[0], id: randomUUID(), name: "Nguyên liệu thứ hai", orderIndex: 1 });
  await page.goto(origin + `/dashboard/recipes/${recipe.id}/edit`);
  await page.locator('[id$="-edit-title"]:visible').waitFor();
  const persistedSteps = page.getByRole("region", { name: "Quản lý các bước thực hiện", exact: true });
  const secondId = stepRows[1].id;
  await press(persistedSteps.getByRole("button", { name: "Di chuyển bước 2 lên", exact: true }));
  await persistedSteps.getByRole("status").filter({ hasText: "Đã di chuyển bước 2 đến vị trí 1." }).waitFor();
  await focusAt(persistedSteps.getByLabel("Tiêu đề bước 1", { exact: true }));
  assert.equal(stepRows[0].id, secondId);
  setReorderStatus(503);
  await press(persistedSteps.getByRole("button", { name: "Di chuyển bước 1 xuống", exact: true }));
  await persistedSteps.getByRole("alert").filter({ hasText: "Chưa xác định được kết quả lưu" }).waitFor();
  assert.equal(stepRows[0].id, secondId);
  assert.equal(await persistedSteps.getByLabel("Tiêu đề bước 1", { exact: true }).inputValue(), "Bước thứ hai");
  assert.equal(await persistedSteps.getByRole("button", { name: "Di chuyển bước 1 xuống", exact: true }).isDisabled(), true);
  setReorderStatus(200);
  await persistedSteps.getByRole("button", { name: "Tải các bước mới", exact: true }).click();
  await persistedSteps.getByRole("button", { name: "Di chuyển bước 1 xuống", exact: true }).waitFor();
  report.keyboard.push("persisted step reorder uses If-Match and restores focus; HTTP 503 retains original order and blocks another write until reconciliation");
  const gallery = page.getByRole("region", { name: "Bộ sưu tập ảnh công thức", exact: true });
  const upload = gallery.getByRole("region", { name: "Tải ảnh công thức", exact: true });
  await upload.locator('input[type="file"]').setInputFiles({ name: "ảnh-minh-họa-" + "dài".repeat(80) + ".png", mimeType: "image/png", buffer: png });
  await responsive("edit-gallery"); await audit("edit with gallery and long upload filename");
  assert.ok(imageRows.length >= 2);
  await press(gallery.getByRole("button", { name: /Đặt .* làm ảnh chính/ }).nth(1));
  await gallery.getByRole("status").filter({ hasText: "Đã đặt ảnh chính." }).waitFor();
  assert.ok(imageRows[1].isPrimary);
  page.once("dialog", dialog => dialog.accept());
  await press(gallery.getByRole("button", { name: "Xóa Ảnh bước nấu", exact: true }).nth(0));
  await gallery.getByRole("status").filter({ hasText: "Đã xóa ảnh." }).waitFor();
  await focusAt(gallery.getByRole("button", { name: "Xóa Ảnh bước nấu", exact: true }).nth(0));
  const trigger = page.getByRole("button", { name: "Xóa công thức", exact: true });
  await press(trigger);
  const modal = page.getByRole("alertdialog");
  await modal.waitFor(); await focusAt(modal.getByRole("button", { name: "Hủy", exact: true }));
  await page.keyboard.press("Shift+Tab");
  assert.ok(await modal.evaluate(element => element.contains(document.activeElement)));
  await responsive("delete-dialog"); await audit("delete modal");
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press("Tab");
    assert.ok(await modal.evaluate(element => element.contains(document.activeElement)));
  }
  await page.keyboard.press("Escape"); await focusAt(trigger);
  report.keyboard.push("gallery set-primary/delete; modal traps Tab/Shift+Tab and Escape restores trigger");
  await trigger.click(); await modal.getByRole("button", { name: "Xóa công thức", exact: true }).click();
  await page.waitForURL(url => url.pathname === "/dashboard/recipes");
  report.keyboard.push("pointer confirms recipe deletion and returns to managed list; create/edit/upload covered by shared runner");
  fs.writeFileSync(path.join(folder, "issue92-a11y-report.json"), JSON.stringify(report, null, 2));
  console.log("PASS issue92: 15 responsive page/dialog checks, 3 axe audits, keyboard field arrays/gallery/modal and pointer delete.");
};
