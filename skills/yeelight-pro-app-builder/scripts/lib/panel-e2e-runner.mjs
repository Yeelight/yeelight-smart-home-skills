import path from "node:path";

import { requestBridgePath } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "desktop-1024", width: 1024, height: 900 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runPanelBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { schemaVersion: 2, startedAt: new Date().toISOString(), checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#panels`, { waitUntil: "networkidle" });
      await waitReady(page);

      await checkDirectory(page, report, viewport.id);
      const directoryScreenshot = path.join(evidenceDir, `${viewport.id}-directory.png`);
      await page.screenshot({ path: directoryScreenshot, fullPage: true });

      await openPanelDetail(page, baseUrl);
      await checkDetail(page, report, viewport.id);
      const detailLayout = await inspectLayout(page);
      recordLayoutChecks(report, `${viewport.id}:detail`, detailLayout);
      const detailScreenshot = path.join(evidenceDir, `${viewport.id}-detail.png`);
      await page.screenshot({ path: detailScreenshot, fullPage: true });

      const scaledLayout = await inspectScaledText(page);
      recordLayoutChecks(report, `${viewport.id}:text-200`, scaledLayout);
      const scaledScreenshot = path.join(evidenceDir, `${viewport.id}-detail-200-text.png`);
      await page.screenshot({ path: scaledScreenshot, fullPage: true });
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

      if (viewport.id === "mobile-375") {
        await runInteractionFlows({ page, report, bridgeOrigin, mockServer, diagnostics, evidenceDir });
      }

      check(report, `${viewport.id}:reduced-motion`, await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), "reduced motion active");
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      const unexpectedHttp = diagnostics.httpErrors.filter((item) => !item.expected);
      check(report, `${viewport.id}:http-errors`, unexpectedHttp.length === 0, unexpectedHttp);
      const unexpectedConsole = diagnostics.consoleMessages.filter((item) => item.type === "error" && !item.text.includes("Failed to load resource"));
      check(report, `${viewport.id}:console-errors`, unexpectedConsole.length === 0, unexpectedConsole);
      report.viewports.push({
        ...viewport,
        screenshots: [path.basename(directoryScreenshot), path.basename(detailScreenshot), path.basename(scaledScreenshot)],
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
  check(report, `${viewportId}:directory-content`, await visibleTexts(page, [
    "墙面面板", "客厅智能面板", "主卧床头面板", "智能旋钮", "书房旋钮", "影音室旋钮",
  ]), "panel directory and independent knob detail entries are visible");
  check(report, `${viewportId}:directory-count`, await page.getByText("2 个面板", { exact: true }).isVisible(), "two panels");
  check(report, `${viewportId}:directory-no-inline-knob-actions`, await page.getByRole("button", { name: /编辑旋钮|重置旋钮/ }).count() === 0, "knob editing remains in its independent detail route");
  recordLayoutChecks(report, `${viewportId}:directory`, await inspectLayout(page));
}

async function openPanelDetail(page, baseUrl) {
  await page.goto(`${baseUrl}#panels/992501`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "客厅智能面板" }).waitFor();
  await waitReady(page);
}

async function checkDetail(page, report, viewportId) {
  check(report, `${viewportId}:deep-link`, page.url().endsWith("#panels/992501"), page.url());
  check(report, `${viewportId}:detail-content`, await visibleTexts(page, [
    "设备身份", "按键类型", "事件绑定", "面板设置", "当前目标详情未提供", "面板测试",
  ]), "panel detail sections and safe target terminal are visible");
  check(report, `${viewportId}:detail-actions`, await visibleButtons(page, ["编辑别名", "编辑事件", "批量编辑事件", "清空绑定"]), "all proven panel actions are visible");
  check(report, `${viewportId}:no-commissioning-action`, await page.getByRole("button", { name: /面板测试|测试按键/ }).count() === 0, "panel.click remains terminal-only");
}

async function runInteractionFlows({ page, report, bridgeOrigin, mockServer, diagnostics, evidenceDir }) {
  await page.getByRole("button", { name: "返回面板" }).click();
  await page.getByRole("heading", { name: "墙面面板" }).waitFor();
  check(report, "navigation:back", page.url().endsWith("#panels"), page.url());
  await page.getByRole("button", { name: /客厅智能面板/ }).click();
  await page.getByRole("heading", { name: "客厅智能面板" }).waitFor();
  check(report, "navigation:directory-detail", page.url().endsWith("#panels/992501"), page.url());

  await runDialogLifecycle(page, report, evidenceDir);
  await runAliasFlow(page, report, mockServer, diagnostics, evidenceDir);
  await runEventFlow(page, report, mockServer, diagnostics, evidenceDir);
  await runBatchFlow(page, report, mockServer);
  await runResetFlow(page, report, mockServer, evidenceDir);
  await runFailureRecovery(page, report, mockServer, diagnostics, evidenceDir);

  const legacyRoute = await bridgeRequest(bridgeOrigin, "/api/operations/panel.click");
  check(report, "bridge:semantic-route-404", legacyRoute.status === 404, legacyRoute);
  const unknownAction = await bridgeRequest(bridgeOrigin, "/api/actions/a_000000000000");
  check(report, "bridge:unknown-action-403", unknownAction.status === 403 && unknownAction.body.status === "blocked", unknownAction);
  check(report, "restore:alias", panelAlias(mockServer, "992501-button-1") === "回家", panelAlias(mockServer, "992501-button-1"));
  check(report, "restore:event-1", eventMatches(mockServer, "992501-event-1", "回家", "994001"), panelEvent(mockServer, "992501-event-1"));
  check(report, "restore:event-2", eventMatches(mockServer, "992501-event-2", "观影", "994002"), panelEvent(mockServer, "992501-event-2"));
}

async function runDialogLifecycle(page, report, evidenceDir) {
  const opener = page.getByRole("button", { name: "编辑别名" }).first();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "编辑别名" });
  const input = dialog.getByLabel("按键别名");
  await dialog.waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === null && document.activeElement?.parentElement?.textContent?.includes("按键别名"));
  check(report, "dialog:initial-focus", await input.evaluate((element) => document.activeElement === element), "alias input focused");
  check(report, "dialog:scroll-lock", await page.evaluate(() => document.body.style.overflow === "hidden"), await page.evaluate(() => document.body.style.overflow));
  check(report, "dialog:clean-save-disabled", await dialog.getByRole("button", { name: "保存配置" }).isDisabled(), "save disabled before change");
  await input.fill("待确认别名");
  const closeButton = dialog.getByRole("button", { name: "关闭面板设置" });
  await closeButton.focus();
  await page.keyboard.press("Shift+Tab");
  check(report, "dialog:focus-trap-backward", await dialog.getByRole("button", { name: "保存配置" }).evaluate((element) => document.activeElement === element), "focus wraps to last control");
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-alias-dialog.png"), fullPage: true });

  await page.keyboard.press("Escape");
  const discardDialog = page.getByRole("dialog", { name: "放弃当前修改？" });
  await discardDialog.waitFor();
  await waitForActive(discardDialog.getByRole("button", { name: "继续编辑", exact: true }));
  check(report, "dialog:discard-first-focus", await discardDialog.getByRole("button", { name: "继续编辑", exact: true }).evaluate((element) => document.activeElement === element), "continue editing receives focus");
  check(report, "dialog:discard-scroll-lock", await page.evaluate(() => document.body.style.overflow === "hidden"), await page.evaluate(() => document.body.style.overflow));
  await discardDialog.getByRole("button", { name: "继续编辑", exact: true }).click();
  await dialog.getByLabel("按键别名").waitFor();
  check(report, "dialog:unsaved-dismiss", await input.inputValue() === "待确认别名", "dirty input preserved after continuing editing");
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-alias-discard-dialog.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await discardDialog.waitFor();
  await discardDialog.getByRole("button", { name: "放弃修改" }).click();
  await dialog.waitFor({ state: "hidden" });
  await waitForActive(opener);
  check(report, "dialog:escape-focus-restore", await opener.evaluate((element) => document.activeElement === element), "focus restored to current trigger");
  check(report, "dialog:scroll-restore", await page.evaluate(() => document.body.style.overflow !== "hidden"), await page.evaluate(() => document.body.style.overflow));
}

async function runAliasFlow(page, report, mockServer, diagnostics, evidenceDir) {
  await saveAlias(page, "离家");
  check(report, "alias:execute-readback", panelAlias(mockServer, "992501-button-1") === "离家" && await page.getByText("离家", { exact: true }).first().isVisible(), panelAlias(mockServer, "992501-button-1"));
  await saveAlias(page, "回家");
  check(report, "alias:restore", panelAlias(mockServer, "992501-button-1") === "回家", panelAlias(mockServer, "992501-button-1"));

  const dialog = await openEditor(page, "编辑别名", "编辑别名");
  const input = dialog.getByLabel("按键别名");
  await input.fill("失败验证");
  await armFailure(mockServer, "POST", "/apis/iot/v1/panel/w/button/update/992501");
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await dialog.getByRole("alert").waitFor();
  markLatestActionError(diagnostics);
  check(report, "alias:failure-preserves-input", await input.inputValue() === "失败验证" && panelAlias(mockServer, "992501-button-1") === "回家", await input.inputValue());
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-alias-failure.png"), fullPage: true });
  await dialog.getByRole("button", { name: "取消" }).click();
  const discardDialog = page.getByRole("dialog", { name: "放弃当前修改？" });
  await discardDialog.waitFor();
  await discardDialog.getByRole("button", { name: "放弃修改" }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function runEventFlow(page, report, mockServer, diagnostics, evidenceDir) {
  let dialog = await openEditor(page, "编辑事件", "编辑事件");
  const target = dialog.getByLabel("绑定目标");
  check(report, "event:no-implicit-target", await target.inputValue() === "" && await dialog.getByRole("button", { name: "保存配置" }).isDisabled(), await target.inputValue());
  await dialog.getByLabel("事件名称").fill("到家照明");
  await target.selectOption("994002");
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await dialog.waitFor({ state: "hidden" });
  check(report, "event:execute", eventMatches(mockServer, "992501-event-1", "到家照明", "994002"), panelEvent(mockServer, "992501-event-1"));
  check(report, "event:safe-readback", await page.getByText("当前目标详情未提供", { exact: true }).first().isVisible(), "runtime projection does not invent target details");

  dialog = await openEditor(page, "编辑事件", "编辑事件");
  await dialog.getByLabel("事件名称").fill("回家");
  await dialog.getByLabel("绑定目标").selectOption("994001");
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await dialog.waitFor({ state: "hidden" });
  check(report, "event:restore", eventMatches(mockServer, "992501-event-1", "回家", "994001"), panelEvent(mockServer, "992501-event-1"));

  dialog = await openEditor(page, "编辑事件", "编辑事件");
  await dialog.getByLabel("事件名称").fill("失败事件");
  await dialog.getByLabel("绑定目标").selectOption("994002");
  await armFailure(mockServer, "POST", "/apis/iot/v1/panel/w/button/event/update");
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await dialog.getByRole("alert").waitFor();
  markLatestActionError(diagnostics);
  check(report, "event:failure-preserves-input", await dialog.getByLabel("事件名称").inputValue() === "失败事件" && eventMatches(mockServer, "992501-event-1", "回家", "994001"), panelEvent(mockServer, "992501-event-1"));
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-event-failure.png"), fullPage: true });
  await dialog.getByRole("button", { name: "取消" }).click();
  const discardDialog = page.getByRole("dialog", { name: "放弃当前修改？" });
  await discardDialog.waitFor();
  await discardDialog.getByRole("button", { name: "放弃修改" }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function runBatchFlow(page, report, mockServer) {
  let dialog = await openEditor(page, "批量编辑事件", "批量编辑事件");
  await dialog.getByLabel("绑定目标").selectOption("994003");
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await dialog.waitFor({ state: "hidden" });
  check(report, "batch:execute", eventTarget(mockServer, "992501-event-1") === "994003" && eventTarget(mockServer, "992501-event-2") === "994003", [panelEvent(mockServer, "992501-event-1"), panelEvent(mockServer, "992501-event-2")]);

  await saveEventAt(page, 0, "回家", "994001");
  await saveEventAt(page, 1, "观影", "994002");
  check(report, "batch:restore", eventMatches(mockServer, "992501-event-1", "回家", "994001") && eventMatches(mockServer, "992501-event-2", "观影", "994002"), [panelEvent(mockServer, "992501-event-1"), panelEvent(mockServer, "992501-event-2")]);
}

async function runResetFlow(page, report, mockServer, evidenceDir) {
  const dialog = await openEditor(page, "清空绑定", "清空绑定");
  check(report, "reset:impact-summary", await dialog.getByText(/面板按键本身不会被删除/).isVisible(), "bounded reset impact visible");
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-reset-confirmation.png"), fullPage: true });
  await dialog.getByRole("button", { name: "确认清空" }).click();
  await dialog.waitFor({ state: "hidden" });
  check(report, "reset:execute-readback", eventMatches(mockServer, "992501-event-1", "单击", ""), panelEvent(mockServer, "992501-event-1"));
  await saveEventAt(page, 0, "回家", "994001");
  check(report, "reset:restore", eventMatches(mockServer, "992501-event-1", "回家", "994001"), panelEvent(mockServer, "992501-event-1"));
}

async function runFailureRecovery(page, report, mockServer, diagnostics, evidenceDir) {
  await page.getByRole("button", { name: "返回面板" }).click();
  await page.getByRole("heading", { name: "墙面面板" }).waitFor();
  await armFailure(mockServer, "GET", `/apis/iot/v1/panel/r/list/${mockServer.homeId}`);
  await sync(page);
  await recoverPanelError(page, report, "list", "面板列表同步失败");
  markLatestActionError(diagnostics);

  await armFailure(mockServer, "POST", "/apis/iot/v1/panel/r/detail/992501");
  await page.getByRole("button", { name: /客厅智能面板/ }).click();
  await recoverPanelError(page, report, "detail", "面板详情同步失败");
  markLatestActionError(diagnostics);

  await page.getByRole("button", { name: "返回面板" }).click();
  await armFailure(mockServer, "POST", "/apis/iot/v1/panel/r/button/info/992501/2");
  await page.getByRole("button", { name: /客厅智能面板/ }).click();
  await recoverPanelError(page, report, "type", "按键类型同步失败");
  markLatestActionError(diagnostics);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-recovered-detail.png"), fullPage: true });
}

async function recoverPanelError(page, report, id, text) {
  const alert = page.locator(".panel-error[role=alert]").filter({ hasText: text }).first();
  await alert.waitFor();
  check(report, `failure:${id}-localized`, await alert.isVisible(), await alert.innerText());
  check(report, `failure:${id}-preserves-data`, await page.getByText("客厅智能面板", { exact: true }).first().isVisible(), "last good panel data remains visible");
  await alert.getByRole("button", { name: "重试" }).click();
  await alert.waitFor({ state: "hidden" });
}

async function saveAlias(page, value) {
  const dialog = await openEditor(page, "编辑别名", "编辑别名");
  await dialog.getByLabel("按键别名").fill(value);
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function saveEventAt(page, index, alias, targetId) {
  const trigger = page.getByRole("button", { name: "编辑事件", exact: true }).nth(index);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "编辑事件" });
  await dialog.getByLabel("事件名称").fill(alias);
  await dialog.getByLabel("绑定目标").selectOption(targetId);
  await dialog.getByRole("button", { name: "保存配置" }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function openEditor(page, buttonName, dialogName) {
  await page.getByRole("button", { name: buttonName, exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await dialog.waitFor();
  return dialog;
}

async function waitForActive(locator) {
  const element = await locator.elementHandle();
  if (!element) throw new Error("Cannot wait for focus on a missing element");
  await locator.page().waitForFunction((target) => document.activeElement === target, element);
}

async function inspectScaledText(page) {
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.waitForTimeout(100);
  return inspectLayout(page);
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const rgb = (value) => { const values = (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number); return value.startsWith("color(srgb") ? values.map((part) => part * 255) : values; };
    const luminance = (color) => color.map((part) => { const c = part / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, part, index) => sum + part * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (foreground, background) => { const values = [luminance(rgb(foreground)), luminance(rgb(background))].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); };
    const effectiveBackground = (element) => { let current = element; while (current) { const value = getComputedStyle(current).backgroundColor; if (value && value !== "rgba(0, 0, 0, 0)") return value; current = current.parentElement; } return getComputedStyle(document.body).backgroundColor; };
    const interactive = [...document.querySelectorAll("button, a, input:not([type=checkbox]), select")].filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }).map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height }; });
    const contrast = [...document.querySelectorAll("h1, h2, h3, p, strong, small, button")].filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }).slice(0, 80).map((element) => ({ text: element.textContent?.trim().slice(0, 40) || "", ratio: ratio(getComputedStyle(element).color, effectiveBackground(element)) }));
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      interactive,
      headings: [...document.querySelectorAll("h1, h2, h3")].map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })),
      radii: [...document.querySelectorAll(".panel-summary > span, .panel-list, .panel-row, .panel-section, .panel-knob-terminal, .panel-dialog, button, input, select")].map((element) => parseFloat(getComputedStyle(element).borderRadius) || 0),
      contrast,
    };
  });
}

function recordLayoutChecks(report, id, layout) {
  check(report, `${id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
  check(report, `${id}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive.filter((item) => item.width < 44 || item.height < 44));
  check(report, `${id}:heading-order`, layout.headings[0]?.level === 1 && layout.headings.every((item, index) => index === 0 || item.level <= layout.headings[index - 1].level + 1), layout.headings);
  check(report, `${id}:radius-contract`, layout.radii.every((radius) => radius <= 8), layout.radii.filter((radius) => radius > 8));
  check(report, `${id}:contrast`, layout.contrast.every((item) => item.ratio >= 4.5), layout.contrast.filter((item) => item.ratio < 4.5));
}

function panelAlias(server, id) { return panelRows(server).find((button) => button.id === id)?.alias; }
function panelEvent(server, id) { return panelRows(server).flatMap((button) => button.buttonEvents || []).find((event) => String(event.id || event.buttonEventId) === id); }
function panelRows(server) { return Object.values(server.fixture.devices.find((device) => device.id === "992501").panelButtons).flat(); }
function eventTarget(server, id) { const event = panelEvent(server, id); return String(event?.details?.[0]?.resId || event?.resId || ""); }
function eventMatches(server, id, alias, targetId) { const event = panelEvent(server, id); return event?.alias === alias && eventTarget(server, id) === targetId; }
async function sync(page) { await page.getByRole("button", { name: "重新同步家庭状态" }).click(); await waitReady(page); }
async function waitReady(page) { await page.waitForFunction(() => !document.querySelector('button[aria-label="重新同步家庭状态"]')?.hasAttribute("disabled")); }
async function armFailure(server, method, apiPath) { const response = await fetch(`${server.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, path: apiPath, status: 503 }) }); if (!response.ok) throw new Error(`failed to arm ${method} ${apiPath}`); }
async function bridgeRequest(origin, pathname) { const response = await requestBridgePath(origin, pathname); const text = await response.text(); let body = text; try { body = JSON.parse(text); } catch {} return { status: response.status, body }; }
function markLatestActionError(diagnostics) { const item = diagnostics.httpErrors.findLast((entry) => !entry.expected && entry.status === 502 && /^\/api\/actions\/a_[a-f0-9]+$/.test(new URL(entry.url).pathname)); if (item) item.expected = true; }
async function visibleTexts(page, values) { return (await Promise.all(values.map((value) => page.getByText(value, { exact: true }).first().isVisible()))).every(Boolean); }
async function visibleButtons(page, values) { return (await Promise.all(values.map((value) => page.getByRole("button", { name: value, exact: true }).first().isVisible()))).every(Boolean); }
function collectDiagnostics(page) { const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] }; page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text() })); page.on("pageerror", (error) => value.pageErrors.push(error.message)); page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" })); page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status(), expected: false }); }); return value; }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
