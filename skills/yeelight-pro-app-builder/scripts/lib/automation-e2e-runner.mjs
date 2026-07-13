import path from "node:path";
import { browserActionPaths, classifyExpectedFailures, probeBrowserBoundary, requestBrowserAction, routeNavigationIsValid } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runAutomationBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage();
      const diagnostics = collectDiagnostics(page);
      await page.goto(`${baseUrl}#automations`, { waitUntil: "domcontentloaded" });
      await page.getByText("家庭在线", { exact: true }).waitFor();
      await page.getByRole("heading", { name: "家庭自动化", level: 2 }).waitFor();

      check(report, `${viewport.id}:navigation-contract`, await routeNavigationIsValid(page, "自动化"), page.url());
      check(report, `${viewport.id}:automation-list`, await automationNamesVisible(page) && await page.locator(".automation-row").count() === 12, await page.locator(".automation-row").allTextContents());
      check(report, `${viewport.id}:proven-switches`, await page.getByRole("switch").count() === mockServer.fixture.automations.length, "every automation exposes an independently proven status control");
      await verifyDirectoryFlow({ page, report, viewport, baseUrl });
      await verifyReducedMotion({ page, report, viewport });
      if (viewport.id === "mobile-375") await verifyTextResize({ page, report, evidenceDir });

      const layout = await inspectLayout(page);
      check(report, `${viewport.id}:no-horizontal-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
      check(report, `${viewport.id}:touch-targets`, layout.interactive.every((item) => item.width >= 44 && item.height >= 44), layout.interactive);
      check(report, `${viewport.id}:heading-order`, noSkippedHeadingLevel(layout.headings), layout.headings);
      check(report, `${viewport.id}:radius-contract`, layout.radii.every((radius) => radius <= 8), layout.radii);
      check(report, `${viewport.id}:contrast`, layout.contrast.every((ratio) => ratio >= 4.5), layout.contrast);
      const screenshot = path.join(evidenceDir, `${viewport.id}-detail.png`);
      await page.screenshot({ path: screenshot, fullPage: true });

      if (viewport.id === "mobile-375") await runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir, baseUrl });
      const expectedPaths = browserActionPaths(["entity.list", "automation.enable", "automation.disable", "automation.list", "automation.detail.get", "automation.supported.list", "automation.supported.v2.list", "automation.create", "automation.update", "automation.delete", "scene.execute"]);
      const { unexpectedHttpErrors, unexpectedConsoleErrors } = classifyExpectedFailures(diagnostics, { expectedHttpErrorPaths: expectedPaths });
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, unexpectedHttpErrors.length === 0, unexpectedHttpErrors);
      check(report, `${viewport.id}:console-errors`, unexpectedConsoleErrors.length === 0, unexpectedConsoleErrors);
      report.viewports.push({ ...viewport, screenshot: path.basename(screenshot), layout, ...diagnostics });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function verifyDirectoryFlow({ page, report, viewport, baseUrl }) {
  const search = page.getByRole("textbox", { name: "搜索自动化" });
  const status = page.getByRole("combobox", { name: "状态" });
  await search.fill("无人");
  check(report, `${viewport.id}:search`, await visibleAutomationRows(page) === 1 && await automationRow(page, "无人关闭公共区域").isVisible(), await page.locator(".automation-list").innerText());
  await search.fill("");
  await status.selectOption("disabled");
  const disabledRows = await page.locator(".automation-row:visible").allTextContents();
  check(report, `${viewport.id}:status-filter`, disabledRows.length === 3 && disabledRows.every((text) => text.includes("已停用")), disabledRows);
  await status.selectOption("all");

  await search.fill("无人");
  await openAutomation(page, "无人关闭公共区域");
  const andDetail = await page.locator(".automation-detail").innerText();
  check(report, `${viewport.id}:detail-deep-link`, page.url().endsWith("#automations/995002"), page.url());
  check(report, `${viewport.id}:and-detail`, /全部条件成立/.test(andDetail) && /2 项/.test(andDetail) && /玄关人体照度传感器/.test(andDetail) && /区域无人/.test(andDetail), andDetail);
  check(report, `${viewport.id}:schedule-summary`, /00:00 - 23:59/.test(andDetail) && /每天/.test(andDetail) && /V3/.test(andDetail), andDetail);
  check(report, `${viewport.id}:adaptive-detail`, viewport.width <= 720 ? await page.locator(".automation-master:visible").count() === 0 : await page.locator(".automation-master:visible").count() === 1, viewport);
  await page.goBack();
  await page.locator("#automation-detail-title").waitFor({ state: "hidden" });
  check(report, `${viewport.id}:filter-restored`, await search.inputValue() === "无人", await search.inputValue());
  check(report, `${viewport.id}:focus-restored`, await page.evaluate(() => document.activeElement?.textContent?.includes("无人关闭公共区域") === true), await page.evaluate(() => document.activeElement?.textContent || ""));
  await search.fill("");

  await page.goto(`${baseUrl}#automations/995007`, { waitUntil: "domcontentloaded" });
  await page.locator("#automation-detail-title").filter({ hasText: "儿童房空气提醒" }).waitFor();
  await page.locator(".automation-schedule-grid").waitFor();
  const orDetail = await page.locator(".automation-detail").innerText();
  check(report, `${viewport.id}:or-deep-link`, /任一条件成立/.test(orDetail) && /PM2\.5 高于 75/.test(orDetail) && /二氧化碳 高于 1200 ppm/.test(orDetail), orDetail);
}

async function verifyReducedMotion({ page, report, viewport }) {
  const motion = await page.evaluate(() => {
    const durations = [...document.querySelectorAll(".automation-detail, .automation-rule-row, button")]
      .filter((element) => element.getClientRects().length > 0)
      .flatMap((element) => {
        const style = getComputedStyle(element);
        return [style.animationDuration, style.transitionDuration]
          .flatMap((value) => value.split(","))
          .map((value) => value.trim().endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value) || 0);
      });
    return { matches: matchMedia("(prefers-reduced-motion: reduce)").matches, maxDurationSeconds: Math.max(0, ...durations) };
  });
  check(report, `${viewport.id}:reduced-motion`, motion.matches && motion.maxDurationSeconds <= 0.02, motion);
}

async function verifyTextResize({ page, report, evidenceDir }) {
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.waitForTimeout(100);
  const textLayout = await page.evaluate(() => {
    const clipped = [...document.querySelectorAll("button, label, h1, h2, h3, p, strong, small, .automation-rule-row")]
      .filter((element) => element.getClientRects().length > 0 && getComputedStyle(element).overflowX !== "hidden")
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => ({ text: element.textContent?.trim() || "", scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, clipped };
  });
  check(report, "mobile-375:text-200-percent", textLayout.scrollWidth <= textLayout.clientWidth + 1 && textLayout.clipped.length === 0, textLayout);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-text-200-percent.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
}

async function runPrimaryFlow({ page, report, bridgeOrigin, mockServer, evidenceDir, baseUrl }) {
  check(report, "fixture:automation-equivalence-classes", mockServer.fixture.automations.length === 12 && ["timer", "event", "threshold", "change", "and", "or"].every((kind) => mockServer.fixture.automations.some((item) => item.equivalenceClass === kind)), mockServer.fixture.automations.map(({ id, equivalenceClass }) => ({ id, equivalenceClass })));
  await page.goto(`${baseUrl}#automations`, { waitUntil: "domcontentloaded" });
  await page.getByText("家庭在线", { exact: true }).waitFor();

  const detailPath = `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/automation/995010/r/info`;
  await armFailure(mockServer, detailPath, "GET");
  await openAutomation(page, "厨房水浸告警", false);
  const detailAlert = page.getByRole("alert").filter({ hasText: "此自动化详情暂时不可用" });
  await detailAlert.waitFor();
  const detailFailureText = await detailAlert.innerText();
  check(report, "failure:detail-scoped", /列表和状态管理仍可使用/.test(detailFailureText), detailFailureText);
  check(report, "failure:detail-no-technical-leak", !/invoke:|HTTP 503|Runtime|Bridge|endpoint/i.test(detailFailureText), detailFailureText);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-detail-failure.png"), fullPage: true });
  await detailAlert.getByRole("button", { name: "重试" }).click();
  await page.getByRole("heading", { name: "动作摘要" }).waitFor();
  check(report, "failure:detail-recovered", /检测到水浸/.test(await page.locator(".automation-detail").innerText()), await page.locator(".automation-detail").innerText());

  const representatives = [
    ["日落开启客厅灯", /每天 18:30/, /亮度：68%/, "timer"],
    ["回家自动亮灯", /门窗打开/, /执行情景/, "event"],
    ["湿度过高开启通风", /湿度 高于 70%/, /回路开关：开启/, "threshold"],
    ["观影联动幕布", /开关变为 开启/, /执行情景/, "change"],
    ["无人关闭公共区域", /全部条件成立/, /2 项/, "and"],
    ["儿童房空气提醒", /任一条件成立/, /二氧化碳 高于 1200 ppm/, "or"],
  ];
  for (const [name, condition, action, kind] of representatives) {
    await page.goto(`${baseUrl}#automations`, { waitUntil: "domcontentloaded" });
    await openAutomation(page, name);
    const text = await page.locator(".automation-detail").innerText();
    check(report, `detail:${kind}`, condition.test(text) && action.test(text), text);
  }

  await page.goto(`${baseUrl}#automations`, { waitUntil: "domcontentloaded" });
  const firstRow = automationRow(page, "日落开启客厅灯");
  await firstRow.waitFor();
  const first = firstRow.getByRole("switch");
  await first.waitFor();
  await first.press("Space");
  await waitForSwitch(first, "false");
  check(report, "toggle:disable-verified", statusOf(mockServer, "995001") === "disabled" && await automationRow(page, "日落开启客厅灯").locator(".automation-feedback.success").isVisible(), statusOf(mockServer, "995001"));
  await first.click();
  await waitForSwitch(first, "true");
  check(report, "toggle:restore-enabled", statusOf(mockServer, "995001") === "enabled", statusOf(mockServer, "995001"));

  const third = automationRow(page, "湿度过高开启通风").getByRole("switch");
  await armFailure(mockServer, "/apis/iot/v1/automations/w/enable/995003");
  await third.click();
  const statusError = automationRow(page, "湿度过高开启通风").locator(".automation-feedback.error");
  await statusError.waitFor();
  const statusFailureText = await statusError.innerText();
  check(report, "failure:status-visible", statusOf(mockServer, "995003") === "disabled" && !/invoke:|HTTP 503|Runtime|Bridge|endpoint/i.test(statusFailureText), statusFailureText);
  await third.click();
  await waitForSwitch(third, "true");
  check(report, "failure:status-recovered", statusOf(mockServer, "995003") === "enabled", statusOf(mockServer, "995003"));
  await third.click();
  await waitForSwitch(third, "false");
  check(report, "restore:third-disabled", statusOf(mockServer, "995003") === "disabled", statusOf(mockServer, "995003"));

  await armFailure(mockServer, "/apis/iot/v1/automations/r/list");
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  const listAlert = page.getByRole("alert").filter({ hasText: "部分家庭数据同步失败" });
  await listAlert.waitFor();
  check(report, "failure:list-preserves-items", await automationNamesVisible(page), await listAlert.innerText());
  await listAlert.getByRole("button", { name: "重新同步" }).click();
  await listAlert.waitFor({ state: "hidden" });
  check(report, "failure:list-recovered", await automationNamesVisible(page), "automation list restored");

  await verifyEditorFlow({ page, report, mockServer, evidenceDir, baseUrl });
  await verifyPublicRegistry({ report, bridgeOrigin, mockServer });
  verifyStrictContracts({ report, mockServer });
  const boundary = await probeBrowserBoundary(bridgeOrigin, "scene.execute");
  check(report, "bridge:semantic-route-404", boundary.semanticRoute.status === 404, boundary.semanticRoute);
  check(report, "bridge:unknown-action-403", boundary.unknownAction.status === 403 && boundary.unknownAction.body.status === "blocked", boundary.unknownAction);
  await fetch(`${mockServer.origin}/__mock/reset`, { method: "POST" });
  check(report, "restore:deterministic", statusOf(mockServer, "995001") === "enabled" && statusOf(mockServer, "995003") === "disabled" && mockServer.fixture.automations.length === 12, mockServer.fixture.automations);
}

async function verifyEditorFlow({ page, report, mockServer, evidenceDir, baseUrl }) {
  const createdName = "E2E晚间照明";
  const updatedName = "E2E晚间照明已更新";
  await page.goto(`${baseUrl}#automations`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "新建自动化" }).click();
  await page.locator(".automation-editor").waitFor();
  check(report, "editor:create-route", page.url().endsWith("#automations/new"), page.url());
  await page.locator("#automation-field-name").fill(createdName);
  await page.getByRole("button", { name: "取消" }).click();
  const guard = page.getByRole("dialog", { name: "保留当前更改？" });
  await guard.waitFor();
  check(report, "editor:unsaved-guard", await page.locator("#automation-field-name").inputValue() === createdName, await guard.innerText());
  await guard.getByRole("button", { name: "继续编辑" }).click();
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("heading", { name: "触发方式" }).waitFor();
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("heading", { name: "条件" }).waitFor();
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("heading", { name: "执行动作" }).waitFor();
  const addAction = page.getByRole("button", { name: "添加动作" });
  await addAction.waitFor();
  await addAction.click();
  check(report, "editor:writable-targets-only", await page.locator(".automation-action-edit").count() === 1 && await page.locator(".automation-action-edit select").first().locator("option").count() > 0, await page.locator(".automation-action-edit").innerText());
  await page.getByRole("button", { name: /下一步/ }).click();
  await page.getByRole("heading", { name: createdName, level: 3 }).waitFor();
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-automation-editor-review.png"), fullPage: true });
  await armFailure(mockServer, `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/automation/w/create`, "PUT", 504, 25);
  await page.getByRole("button", { name: "预览并保存" }).click();
  const createError = page.locator(".automation-editor-feedback");
  await createError.waitFor();
  check(report, "editor:create-failure-preserves-draft", await page.locator("#automation-editor-title").getByText(createdName).isVisible() && !/invoke:|HTTP 503|Runtime|Bridge|endpoint/i.test(await createError.innerText()), await createError.innerText());
  await page.getByRole("button", { name: "预览并保存" }).click();
  await page.locator(".automation-editor").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: createdName, level: 2 }).waitFor();
  const created = mockServer.fixture.automations.find((item) => item.name === createdName);
  check(report, "editor:create-readback", Boolean(created) && mockServer.fixture.automations.length === 13, created);

  if (!page.url().includes("#automations/" + created?.id)) await openAutomation(page, createdName);
  await page.getByRole("button", { name: "编辑自动化" }).click();
  await page.locator("#automation-field-name").fill(updatedName);
  for (let index = 0; index < 4; index += 1) await page.getByRole("button", { name: /下一步/ }).click();
  await armFailure(mockServer, `/apis/iot/v1/automations/${created?.id}/w/update`, "PUT");
  await page.getByRole("button", { name: "预览并保存" }).click();
  const updateError = page.locator(".automation-editor-feedback");
  await updateError.waitFor();
  check(report, "editor:update-failure-preserves-draft", await page.locator("#automation-editor-title").getByText(updatedName).isVisible() && mockServer.fixture.automations.find((item) => item.id === created?.id)?.name === createdName, await updateError.innerText());
  await armNoop(mockServer, `/apis/iot/v1/automations/${created?.id}/w/update`, "PUT");
  await page.getByRole("button", { name: "预览并保存" }).click();
  await updateError.waitFor({ state: "hidden" });
  await updateError.waitFor();
  check(report, "editor:update-mismatch-preserves-resource", mockServer.fixture.automations.find((item) => item.id === created?.id)?.name === createdName, await updateError.innerText());
  await page.getByRole("button", { name: "预览并保存" }).click();
  await page.locator(".automation-editor").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: updatedName, level: 2 }).waitFor();
  check(report, "editor:update-readback", mockServer.fixture.automations.find((item) => item.id === created?.id)?.name === updatedName, mockServer.fixture.automations.find((item) => item.id === created?.id));

  await page.getByRole("button", { name: "删除自动化" }).click();
  const dialog = page.getByRole("dialog", { name: new RegExp(updatedName) });
  await dialog.waitFor();
  await armFailure(mockServer, `/apis/iot/v2/thing/manage/house/${mockServer.homeId}/automation/${created?.id}/w/info`, "DELETE");
  await dialog.getByRole("button", { name: "确认删除" }).click();
  const deleteError = dialog.getByRole("alert");
  await deleteError.waitFor();
  check(report, "editor:delete-failure-preserves-resource", mockServer.fixture.automations.some((item) => item.id === created?.id), await deleteError.innerText());
  await dialog.getByRole("button", { name: "确认删除" }).click();
  await dialog.waitFor({ state: "hidden" });
  check(report, "editor:delete-absence", !mockServer.fixture.automations.some((item) => item.id === created?.id) && mockServer.fixture.automations.length === 12, mockServer.fixture.automations.map((item) => item.id));
}

async function verifyPublicRegistry({ report, bridgeOrigin, mockServer }) {
  const request = (intent) => requestBrowserAction(bridgeOrigin, intent, { locale: "zh-CN", utterance: "验证自动化条件能力", parameters: { houseId: mockServer.homeId } });
  const v1Response = await request("automation.supported.list");
  const v2Response = await request("automation.supported.v2.list");
  const v1 = await v1Response.json();
  const v2 = await v2Response.json();
  const publicText = JSON.stringify({ v1: v1?.result?.data, v2: v2?.result?.data });
  check(report, "registry:public-supported-v1-v2", v1Response.ok && v2Response.ok && v1?.result?.data?.supported?.length === 4 && v2?.result?.data?.supportedV2?.length === 2, { v1: v1?.result?.data, v2: v2?.result?.data });
  check(report, "registry:no-raw-cloud-fields", !/\"(?:pid|actions|argsDesc|supportVersion)\"/.test(publicText), publicText);
}

function verifyStrictContracts({ report, mockServer }) {
  const calls = mockServer.requestLog();
  const details = calls.filter((entry) => /\/automation\/\d+\/r\/info$/.test(entry.path));
  const supported = calls.filter((entry) => /\/automations\/r\/supported(?:\/v2)?$/.test(entry.path));
  const writes = calls.filter((entry) => /\/automations\/w\/(?:enable|disable)\//.test(entry.path));
  check(report, "api:strict-detail-contract", details.length >= 8 && details.every((entry) => entry.method === "GET" && entry.body == null), details.map(contractEntry));
  check(report, "api:strict-supported-contract", supported.length >= 4 && supported.every((entry) => entry.method === "POST" && Object.keys(entry.body || {}).length === 0), supported.map(contractEntry));
  check(report, "api:strict-status-contract", writes.length === 5 && writes.every((entry) => entry.method === "POST" && (entry.body == null || Object.keys(entry.body).length === 0)), writes.map(contractEntry));
}

function contractEntry({ path, method, body, status }) { return { path, method, body, status }; }
function statusOf(server, id) { return server.fixture.automations.find((item) => item.id === id)?.status; }
function automationRow(page, name) { return page.locator(".automation-row").filter({ hasText: name }); }
async function visibleAutomationRows(page) { return page.locator(".automation-row:visible").count(); }
async function automationNamesVisible(page) { return (await Promise.all(["日落开启客厅灯", "无人关闭公共区域", "湿度过高开启通风", "儿童房空气提醒", "DALI夜间节能"].map((name) => page.getByText(name, { exact: true }).isVisible()))).every(Boolean); }
async function openAutomation(page, name, waitForDetail = true) {
  await automationRow(page, name).locator(".automation-open-button").click();
  await page.locator("#automation-detail-title").filter({ hasText: name }).waitFor();
  if (waitForDetail) await page.locator(".automation-schedule-grid").waitFor();
}
async function waitForSwitch(locator, state, timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await locator.getAttribute("aria-checked") === state) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`timed out waiting for automation switch state ${state}`);
}
async function armFailure(server, apiPath, method = "POST", status = 503, delayMs = 0) { const response = await fetch(`${server.origin}/__mock/fail-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, path: apiPath, status, delayMs }) }); if (!response.ok) throw new Error(`failed to arm ${apiPath}`); }
async function armNoop(server, apiPath, method) { const response = await fetch(`${server.origin}/__mock/succeed-without-mutation-next`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method, path: apiPath }) }); if (!response.ok) throw new Error(`failed to arm noop ${apiPath}`); }
function noSkippedHeadingLevel(headings) { return headings.every((heading, index) => index === 0 || heading.level <= headings[index - 1].level + 1); }
function collectDiagnostics(page) { const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] }; page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text() })); page.on("pageerror", (error) => value.pageErrors.push(error.message)); page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" })); page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status() }); }); return value; }
async function inspectLayout(page) { return page.evaluate(() => { const rgb = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number); const lum = (color) => color.map((part) => { const c = part / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, part, index) => sum + part * [0.2126, 0.7152, 0.0722][index], 0); const ratio = (foreground, background) => { const values = [lum(rgb(foreground)), lum(rgb(background))].sort((a, b) => b - a); return (values[0] + 0.05) / (values[1] + 0.05); }; const effectiveBackground = (element) => { let current = element; while (current) { const color = getComputedStyle(current).backgroundColor; const parts = color.match(/[\d.]+/g) || []; if (parts.length < 4 || Number(parts[3]) > 0) return color; current = current.parentElement; } return getComputedStyle(document.body).backgroundColor; }; const body = getComputedStyle(document.body); const muted = document.querySelector(".automation-rule-row small"); return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, interactive: [...document.querySelectorAll("button, a, input, select")].filter((element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden"; }).map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height }; }), headings: [...document.querySelectorAll("h1, h2, h3")].filter((heading) => heading.getClientRects().length > 0).map((heading) => ({ level: Number(heading.tagName.slice(1)), text: heading.textContent?.trim() || "" })), radii: [...document.querySelectorAll(".automation-directory, .automation-switch, .automation-back-button, .automation-rule-row > span")].map((element) => parseFloat(getComputedStyle(element).borderRadius) || 0), contrast: [ratio(body.color, body.backgroundColor), ...(muted ? [ratio(getComputedStyle(muted).color, effectiveBackground(muted))] : [])] }; }); }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
