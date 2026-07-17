import path from "node:path";

export async function runThemeInteractionSmoke({ page, baseUrl, target, evidenceDir, addCheck }) {
  const result = { validationRole: target.validationRole, routes: [], screenshots: [] };
  await verifyTopLevelRoutes({ page, baseUrl, target, addCheck, result });
  await verifySwitchAndFeedback({ page, baseUrl, addCheck });
  await verifySlider({ page, baseUrl, addCheck });
  await verifyOverlayAndColorPicker({ page, baseUrl, target, evidenceDir, addCheck, result });
  return result;
}

async function verifyTopLevelRoutes({ page, baseUrl, target, addCheck, result }) {
  if (target.validationRole !== "family-routes") {
    addCheck("all-top-level-routes", true, { required: false, validationRole: target.validationRole });
    return;
  }
  const routes = await page.locator(".desktop-navigation a").evaluateAll((links) => links.map((link) => ({
    route: String(link.getAttribute("href") || "").replace(/^#/, ""),
    label: link.textContent?.trim() || "",
  })).filter(({ route }) => route && !route.includes("/")));
  const visited = [];
  for (const route of routes) {
    await page.goto(`${baseUrl}#${route.route}`, { waitUntil: "domcontentloaded" });
    const pageRoot = page.locator(`[data-page="${route.route}"]`);
    await pageRoot.waitFor();
    visited.push({ ...route, visible: await pageRoot.isVisible() });
  }
  result.routes = visited;
  addCheck("all-top-level-routes", routes.length >= 10 && visited.every(({ visible }) => visible), visited);
}

async function verifySwitchAndFeedback({ page, baseUrl, addCheck }) {
  await page.goto(`${baseUrl}#automations`, { waitUntil: "domcontentloaded" });
  const row = page.locator(".automation-row").first();
  const control = row.getByRole("switch");
  await control.waitFor();
  const before = await control.getAttribute("aria-checked");
  await control.click();
  await waitForAttribute(control, "aria-checked", (value) => value !== before);
  const after = await control.getAttribute("aria-checked");
  const feedback = row.locator(".automation-feedback.success");
  await feedback.waitFor();
  addCheck("switch-state-transition", before !== after, { before, after });
  addCheck("status-feedback", await feedback.isVisible() && (await feedback.innerText()).trim().length > 0, await feedback.innerText());
  await control.click();
  await waitForAttribute(control, "aria-checked", (value) => value === before);
  addCheck("switch-state-restore", await control.getAttribute("aria-checked") === before, await control.getAttribute("aria-checked"));
}

async function verifySlider({ page, baseUrl, addCheck }) {
  await page.goto(`${baseUrl}#lights`, { waitUntil: "domcontentloaded" });
  const slider = page.getByRole("slider").first();
  await slider.waitFor();
  const before = await slider.inputValue();
  const maximum = Number(await slider.getAttribute("max"));
  const direction = Number(before) < maximum ? "ArrowRight" : "ArrowLeft";
  const reverse = direction === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
  await slider.press(direction);
  await waitForValue(slider, (value) => value !== before);
  const after = await slider.inputValue();
  await waitForEnabled(slider);
  await slider.press(reverse);
  await waitForValue(slider, (value) => value === before);
  addCheck("slider-value-transition", before !== after, { before, after, restored: await slider.inputValue() });
}

async function verifyOverlayAndColorPicker({ page, baseUrl, target, evidenceDir, addCheck, result }) {
  await page.goto(`${baseUrl}#scenes/new`, { waitUntil: "domcontentloaded" });
  const name = page.getByLabel("情景名称");
  await name.fill("主题交互验证草稿");
  const opener = page.getByRole("button", { name: "取消", exact: true }).first();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "保留当前更改？" });
  await dialog.waitFor();
  await waitForFocusWithin(dialog);
  const controls = dialog.getByRole("button");
  addCheck("overlay-scroll-lock", await page.evaluate(() => document.body.style.overflow === "hidden"), await page.evaluate(() => document.body.style.overflow));
  addCheck("overlay-initial-focus", await dialog.evaluate((element) => element.contains(document.activeElement)), await page.evaluate(() => document.activeElement?.outerHTML));
  const first = controls.first();
  const last = controls.last();
  await last.focus();
  await page.keyboard.press("Tab");
  addCheck("overlay-focus-trap", await first.evaluate((element) => document.activeElement === element), await page.evaluate(() => document.activeElement?.outerHTML));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await waitForFocused(opener);
  addCheck("overlay-escape-close", await dialog.count() === 0 && await page.evaluate(() => document.body.style.overflow !== "hidden"), await page.evaluate(() => document.body.style.overflow));
  addCheck("overlay-focus-restore", await opener.evaluate((element) => document.activeElement === element), await page.evaluate(() => document.activeElement?.outerHTML));

  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("heading", { name: "目标与动作" }).waitFor();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  const actionValidation = page.getByRole("alert").filter({ hasText: "至少保留或添加一个情景动作" });
  await actionValidation.waitFor();
  await page.getByRole("button", { name: "添加动作" }).click();
  await actionValidation.waitFor({ state: "hidden" });
  addCheck("validation-clears-after-edit", !(await actionValidation.isVisible()), { remaining: await actionValidation.count() });
  const actionRow = page.locator(".scene-action-editor-row").first();
  const propertySelect = actionRow.locator("select").nth(1);
  const hasColorTarget = await selectTargetWithProperty(actionRow, "颜色");
  if (hasColorTarget) await propertySelect.selectOption({ label: "颜色" });
  const colorInput = actionRow.locator('input[type="color"]');
  if (hasColorTarget) await colorInput.fill("#4d96ff");
  const colorPassed = hasColorTarget
    && await colorInput.inputValue() === "#4d96ff"
    && await actionRow.getByText("#4D96FF").isVisible()
    && await actionRow.locator('input[type="number"]').count() === 0;
  addCheck("color-picker-output", colorPassed, await actionRow.innerText());

  const screenshot = path.join(evidenceDir, `${target.id}-controls.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  result.screenshots.push(path.basename(screenshot));
  await opener.click();
  const discardDialog = page.getByRole("dialog", { name: "保留当前更改？" });
  await discardDialog.getByRole("button", { name: "放弃更改" }).click();
  await page.locator('[data-page="scenes"]').waitFor();
}

async function selectTargetWithProperty(row, propertyLabel) {
  const targetSelect = row.locator("select").nth(0);
  const propertySelect = row.locator("select").nth(1);
  const values = await targetSelect.locator("option").evaluateAll((options) => options.map((option) => option.value));
  for (const value of values) {
    await targetSelect.selectOption(value);
    if ((await propertySelect.locator("option").allTextContents()).includes(propertyLabel)) return true;
  }
  return false;
}

async function waitForAttribute(locator, name, predicate) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate(await locator.getAttribute(name))) return;
    await delay(50);
  }
  throw new Error(`等待属性 ${name} 更新超时`);
}

async function waitForValue(locator, predicate) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate(await locator.inputValue())) return;
    await delay(50);
  }
  throw new Error("等待控件值更新超时");
}

async function waitForEnabled(locator) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await locator.isEnabled()) return;
    await delay(50);
  }
  throw new Error("等待控件恢复可用超时");
}

async function waitForFocusWithin(locator) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await locator.evaluate((element) => element.contains(document.activeElement))) return;
    await delay(25);
  }
  throw new Error("等待弹层初始焦点超时");
}

async function waitForFocused(locator) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await locator.evaluate((element) => document.activeElement === element)) return;
    await delay(25);
  }
  throw new Error("等待焦点恢复超时");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
