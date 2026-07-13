import path from "node:path";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "desktop-1024", width: 1024, height: 900 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runKnobBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(), checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#panels`, { waitUntil: "networkidle" });
      await waitReady(page);

      await checkDirectory(page, report, viewport.id);
      const directoryScreenshot = path.join(evidenceDir, `${viewport.id}-knob-directory.png`);
      await page.screenshot({ path: directoryScreenshot, fullPage: true });

      await openKnob(page, baseUrl, "992601", "书房旋钮");
      await checkEditableDetail(page, report, viewport.id);
      const detailLayout = await inspectLayout(page);
      recordLayoutChecks(report, `${viewport.id}:editable`, detailLayout);
      const detailScreenshot = path.join(evidenceDir, `${viewport.id}-knob-editable.png`);
      await page.screenshot({ path: detailScreenshot, fullPage: true });

      const scaledLayout = await inspectScaledText(page);
      recordLayoutChecks(report, `${viewport.id}:text-200`, scaledLayout);
      const scaledScreenshot = path.join(evidenceDir, `${viewport.id}-knob-editable-200-text.png`);
      await page.screenshot({ path: scaledScreenshot, fullPage: true });
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

      await openKnob(page, baseUrl, "992602", "影音室旋钮");
      await checkReadOnlyDetail(page, report, viewport.id);
      const readonlyScreenshot = path.join(evidenceDir, `${viewport.id}-knob-readonly.png`);
      await page.screenshot({ path: readonlyScreenshot, fullPage: true });
      recordLayoutChecks(report, `${viewport.id}:readonly`, await inspectLayout(page));

      if (viewport.id === "mobile-375") {
        await openKnob(page, baseUrl, "992601", "书房旋钮");
        await runInteractionFlows({ page, report, bridgeOrigin, mockServer, diagnostics, evidenceDir });
      }

      const bodyText = await page.locator("body").innerText();
      check(report, `${viewport.id}:sensitive-copy`, !/(CLI|Bridge|intent|capability|endpoint|Authorization|localToken)/i.test(bodyText), bodyText.match(/CLI|Bridge|intent|capability|endpoint|Authorization|localToken/gi) || []);
      check(report, `${viewport.id}:reduced-motion`, await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), "reduced motion active");
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      const unexpectedHttp = diagnostics.httpErrors.filter((item) => !item.expected);
      check(report, `${viewport.id}:http-errors`, unexpectedHttp.length === 0, unexpectedHttp);
      const unexpectedConsole = diagnostics.consoleMessages.filter((item) => item.type === "error" && !item.text.includes("Failed to load resource"));
      check(report, `${viewport.id}:console-errors`, unexpectedConsole.length === 0, unexpectedConsole);
      report.viewports.push({
        ...viewport,
        screenshots: [path.basename(directoryScreenshot), path.basename(detailScreenshot), path.basename(scaledScreenshot), path.basename(readonlyScreenshot)],
        detailLayout,
        scaledLayout,
        ...diagnostics,
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function checkDirectory(page, report, viewportId) {
  check(report, `${viewportId}:directory-content`, await visibleTexts(page, ["墙面面板", "智能旋钮", "书房旋钮", "影音室旋钮"]), "wall device directory");
  check(report, `${viewportId}:directory-navigation`, await page.getByRole("button", { name: /书房旋钮/ }).isVisible() && await page.getByRole("button", { name: /影音室旋钮/ }).isVisible(), "knob rows are navigable");
  check(report, `${viewportId}:directory-no-inline-editor`, await page.getByRole("button", { name: /编辑配置|重置此路/ }).count() === 0, "editing stays in independent detail route");
  recordLayoutChecks(report, `${viewportId}:directory`, await inspectLayout(page));
}

async function checkEditableDetail(page, report, viewportId) {
  check(report, `${viewportId}:editable-deep-link`, page.url().endsWith("#panels/knobs/992601"), page.url());
  check(report, `${viewportId}:editable-content`, await visibleTexts(page, ["旋钮详情", "书房旋钮", "在线", "当前绑定", "配置路数", "当前绑定"]), "editable knob content");
  check(report, `${viewportId}:editable-actions`, await page.getByRole("button", { name: "编辑配置", exact: true }).count() === 2 && await page.getByRole("button", { name: "重置此路", exact: true }).count() === 2, "two independently editable rows");
}

async function checkReadOnlyDetail(page, report, viewportId) {
  check(report, `${viewportId}:readonly-deep-link`, page.url().endsWith("#panels/knobs/992602"), page.url());
  check(report, `${viewportId}:readonly-terminal`, await visibleTexts(page, ["影音室旋钮", "离线", "当前不可编辑", "当前旋钮离线，恢复在线后可重新验证配置能力。"]), "offline terminal reason");
  check(report, `${viewportId}:readonly-no-write`, await page.getByRole("button", { name: /编辑配置|重置此路/ }).count() === 0, "no unavailable write controls");
}

async function runInteractionFlows({ page, report, bridgeOrigin, mockServer, diagnostics, evidenceDir }) {
  await runDialogLifecycle(page, report, evidenceDir);
  await runConfigureFlow(page, report, mockServer, evidenceDir);
  await restoreFixture(page, mockServer);
  await runResetFlow(page, report, mockServer, evidenceDir);
  await restoreFixture(page, mockServer);
  await runFailureRetry(page, report, mockServer, diagnostics, evidenceDir);
  await restoreFixture(page, mockServer);

  const legacyRoute = await bridgeRequest(bridgeOrigin, "/api/operations/knob.configure");
  check(report, "bridge:semantic-route-404", legacyRoute.status === 404, legacyRoute);
  const unknownAction = await bridgeRequest(bridgeOrigin, "/api/actions/a_000000000000");
  check(report, "bridge:unknown-action-403", unknownAction.status === 403 && unknownAction.body.status === "blocked", unknownAction);
  check(report, "restore:final", knobDetail(mockServer, "992601").details[0].configType === "device", knobDetail(mockServer, "992601"));
}

async function runDialogLifecycle(page, report, evidenceDir) {
  const opener = page.getByRole("button", { name: "编辑配置", exact: true }).first();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "编辑配置" });
  const type = dialog.getByLabel("配置类型");
  await dialog.waitFor();
  await page.waitForFunction(() => document.activeElement?.parentElement?.textContent?.includes("配置类型"));
  check(report, "dialog:initial-focus", await type.evaluate((element) => document.activeElement === element), "configuration type focused");
  check(report, "dialog:scroll-lock", await page.evaluate(() => document.body.style.overflow === "hidden"), await page.evaluate(() => document.body.style.overflow));
  check(report, "dialog:clean-save-disabled", await dialog.getByRole("button", { name: "预览并保存" }).isDisabled(), "save disabled before change");
  await type.selectOption("scene");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await dialog.getByRole("button", { name: "关闭旋钮设置" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "取消");
  check(report, "dialog:focus-trap-backward", await dialog.getByRole("button", { name: "取消" }).evaluate((element) => document.activeElement === element), "focus wraps to last enabled control");
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-knob-dialog.png"), fullPage: true });
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await page.keyboard.press("Escape");
  check(report, "dialog:unsaved-dismiss", await dialog.isVisible() && await type.inputValue() === "scene", "dirty draft preserved");
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-knob-focus-key") === "configure-1");
  check(report, "dialog:focus-restore", await page.evaluate(() => document.activeElement?.getAttribute("data-knob-focus-key") === "configure-1"), "focus restored to configure-1");
  check(report, "dialog:scroll-restore", await page.evaluate(() => document.body.style.overflow !== "hidden"), await page.evaluate(() => document.body.style.overflow));
}

async function runConfigureFlow(page, report, mockServer, evidenceDir) {
  const before = structuredClone(knobDetail(mockServer, "992601"));
  const dialog = await openConfigure(page);
  const targetSelect = dialog.getByLabel("绑定目标");
  const brightnessTargets = await targetSelect.locator("option").allTextContents();
  check(report, "configure:brightness-targets", brightnessTargets.includes("书房彩光灯带") && !brightnessTargets.includes("影音室只读幕布") && !brightnessTargets.includes("主卧空调温控器"), brightnessTargets);
  await dialog.getByLabel("交互方式").selectOption("colorTemperature");
  const colorTemperatureTargets = await targetSelect.locator("option").allTextContents();
  check(report, "configure:color-temperature-targets", colorTemperatureTargets.includes("餐厅色温吊灯") && !colorTemperatureTargets.includes("客卧只读灯具") && !colorTemperatureTargets.includes("厨房双路继电器"), colorTemperatureTargets);
  await dialog.getByLabel("配置类型").selectOption("scene");
  check(report, "configure:scene-targets", await dialog.getByLabel("绑定目标").locator("option").count() > 1, "scene candidates available");
  await dialog.getByLabel("绑定目标").selectOption("994002");
  await setRange(dialog.getByLabel("灵敏度"), 7);
  await dialog.getByRole("button", { name: "预览并保存" }).click();
  await dialog.waitFor({ state: "hidden" });
  const after = knobDetail(mockServer, "992601");
  check(report, "configure:execute-readback", after.details[0].configType === "scene" && knobSensitivity(after.details[0]) === 7, after.details[0]);
  check(report, "configure:preserves-other-row", sameKnobRow(after.details[1], before.details[1]), { before: before.details[1], after: after.details[1] });
  check(report, "configure:human-readback", await page.getByText(/观影|994002/).first().isVisible(), "updated target visible");
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-knob-configured.png"), fullPage: true });
}

async function runResetFlow(page, report, mockServer, evidenceDir) {
  const before = structuredClone(knobDetail(mockServer, "992601"));
  await page.getByRole("button", { name: "重置此路", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "重置此路" });
  await dialog.waitFor();
  check(report, "reset:impact", await dialog.getByText("将清空第 1 路的当前绑定，旋钮设备本身不会被删除。", { exact: true }).isVisible(), "bounded reset impact");
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-knob-reset-confirm.png"), fullPage: true });
  await dialog.getByRole("button", { name: "确认重置" }).click();
  await dialog.waitFor({ state: "hidden" });
  const after = knobDetail(mockServer, "992601");
  check(report, "reset:execute-readback", after.details[0].configType === "none", after.details[0]);
  check(report, "reset:preserves-other-row", sameKnobRow(after.details[1], before.details[1]), { before: before.details[1], after: after.details[1] });
}

async function runFailureRetry(page, report, mockServer, diagnostics, evidenceDir) {
  const before = structuredClone(knobDetail(mockServer, "992601"));
  const dialog = await openConfigure(page);
  await dialog.getByLabel("配置类型").selectOption("group");
  check(report, "configure:group-targets", await dialog.getByLabel("绑定目标").locator("option").count() > 1, "group candidates available");
  await dialog.getByLabel("绑定目标").selectOption("993001");
  await armFailure(mockServer, "POST", "/apis/iot/v1/multi-knob/update");
  await dialog.getByRole("button", { name: "预览并保存" }).click();
  await dialog.getByRole("alert").waitFor();
  markLatestActionError(diagnostics);
  check(report, "failure:preserves-draft", await dialog.getByLabel("配置类型").inputValue() === "group" && await dialog.getByLabel("绑定目标").inputValue() === "993001", "draft retained");
  check(report, "failure:no-mutation", JSON.stringify(knobDetail(mockServer, "992601")) === JSON.stringify(before), knobDetail(mockServer, "992601"));
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-knob-failure.png"), fullPage: true });
  await dialog.getByRole("button", { name: "预览并保存" }).click();
  await dialog.waitFor({ state: "hidden" });
  check(report, "failure:retry", knobDetail(mockServer, "992601").details[0].configType === "group", knobDetail(mockServer, "992601").details[0]);
}

async function openConfigure(page) {
  await page.getByRole("button", { name: "编辑配置", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "编辑配置" });
  await dialog.waitFor();
  return dialog;
}

async function openKnob(page, baseUrl, id, name) {
  await page.goto(`${baseUrl}#panels/knobs/${id}`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name }).waitFor();
  await waitReady(page);
}

async function restoreFixture(page, mockServer) {
  const response = await fetch(`${mockServer.origin}/__mock/reset`, { method: "POST" });
  if (!response.ok) throw new Error("failed to reset reference home");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "书房旋钮" }).waitFor();
  await waitReady(page);
}

async function setRange(locator, value) {
  await locator.fill(String(value));
}

async function inspectScaledText(page) {
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.waitForTimeout(100);
  return inspectLayout(page);
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const interactive = [...document.querySelectorAll("button, a, input, select")].filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }).map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height }; });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      interactive,
      headings: [...document.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })),
      radii: [...document.querySelectorAll(".knob-summary > span, .knob-section, .knob-action-index strong, .knob-terminal, .knob-dialog, button, input, select")].map((element) => parseFloat(getComputedStyle(element).borderRadius) || 0),
    };
  });
}

function recordLayoutChecks(report, id, layout) {
  check(report, `${id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
  check(report, `${id}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive.filter((item) => item.width < 44 || item.height < 44));
  check(report, `${id}:heading-order`, layout.headings[0]?.level === 1 && layout.headings.every((item, index) => index === 0 || item.level <= layout.headings[index - 1].level + 1), layout.headings);
  check(report, `${id}:radius-contract`, layout.radii.every((radius) => radius <= 8), layout.radii.filter((radius) => radius > 8));
}

function knobDetail(server, id) { return server.fixture.devices.find((device) => device.id === id).knobMulti; }
function knobSensitivity(row) { return Number(row?.sensitivity ?? row?.sens ?? 0); }
function sameKnobRow(actual, expected) { return String(actual?.id) === String(expected?.id) && Number(actual?.index) === Number(expected?.index) && String(actual?.configType || "") === String(expected?.configType || "") && String(actual?.mode || "") === String(expected?.mode || "") && String(actual?.alias || "") === String(expected?.alias || "") && String(actual?.resId ?? actual?.targetId ?? "") === String(expected?.resId ?? expected?.targetId ?? "") && knobSensitivity(actual) === knobSensitivity(expected); }
async function waitReady(page) { await page.waitForFunction(() => !document.querySelector('button[aria-label="重新同步家庭状态"]')?.hasAttribute("disabled")); }
async function armFailure(server, method, apiPath) { const response = await fetch(`${server.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, path: apiPath, status: 503 }) }); if (!response.ok) throw new Error(`failed to arm ${method} ${apiPath}`); }
async function bridgeRequest(origin, pathname) { const response = await fetch(`${origin}${pathname}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); const text = await response.text(); let body = text; try { body = JSON.parse(text); } catch {} return { status: response.status, body }; }
function markLatestActionError(diagnostics) { const item = diagnostics.httpErrors.findLast((entry) => !entry.expected && entry.status === 502 && /^\/api\/actions\/a_[a-f0-9]+$/.test(new URL(entry.url).pathname)); if (item) item.expected = true; }
async function visibleTexts(page, values) { return (await Promise.all(values.map((value) => page.getByText(value, { exact: true }).first().isVisible()))).every(Boolean); }
function collectDiagnostics(page) { const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] }; page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text() })); page.on("pageerror", (error) => value.pageErrors.push(error.message)); page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" })); page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status(), expected: false }); }); return value; }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
