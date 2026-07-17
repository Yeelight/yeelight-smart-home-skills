import path from "node:path";

import { requestBridgePath } from "./e2e-browser-boundary.mjs";

const viewports = [
  { id: "mobile-375", width: 375, height: 812 },
  { id: "tablet-768", width: 768, height: 1024 },
  { id: "tablet-landscape-1024", width: 1024, height: 768 },
  { id: "desktop-1440", width: 1440, height: 1000 },
];

export async function runManagementSuiteBrowserE2E({ chromium, baseUrl, bridgeOrigin, mockServer, evidenceDir }) {
  const report = { startedAt: new Date().toISOString(), baseUrl, bridgeOrigin, checks: [], viewports: [] };
  const browser = await launchBrowser(chromium);
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: "reduce", locale: "zh-CN" });
      const page = await context.newPage(); const diagnostics = collectDiagnostics(page);
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.getByText("家庭在线", { exact: true }).waitFor();
      const nav = page.getByRole("navigation", { name: "主导航" });
      const visibleLinks = await nav.getByRole("link").count();
      const visibleLabels = (await nav.getByRole("link").allTextContents()).map((label) => label.trim()).filter(Boolean);
      const mobileNavigation = await page.locator(".mobile-navigation").isVisible();
      const requiredLabels = ["总览", "空间", "情景", "自动化", "设备组"];
      const navigationValid = mobileNavigation
        ? visibleLinks === 4 && await nav.getByRole("button", { name: "更多" }).count() === 1
        : requiredLabels.every((label) => visibleLabels.includes(label)) && new Set(visibleLabels).size === visibleLabels.length;
      check(report, `${viewport.id}:adaptive-navigation`, navigationValid, visibleLabels);
      const homeScenes = page.locator(".home-scene-summary");
      await homeScenes.getByRole("heading", { name: "快捷执行" }).waitFor();
      check(report, `${viewport.id}:home-scene-execution-first`, await homeScenes.getByRole("button", { name: /执行情景/ }).count() > 0 && await homeScenes.getByText(/新建|编辑|删除/).count() === 0, await homeScenes.innerText());

      await page.locator(".home-room-row").filter({ hasText: "客厅" }).click();
      await page.getByRole("heading", { name: "客厅" }).waitFor();
      const roomSummary = page.getByText(/房间包含 \d+ 个可用情景/);
      await roomSummary.waitFor();
      check(report, `${viewport.id}:room-runtime-summary`, new URL(page.url()).hash === "#spaces/rooms/991001" && await roomSummary.isVisible(), windowState(await page.url()));
      check(report, `${viewport.id}:room-no-editor-complexity`, await page.getByText(/新建情景|编辑自动化|管理设备组成员/).count() === 0, await page.locator('[data-page="spaces"]').innerText());

      await openPage(page, "自动化", "automations");
      await page.getByText("日落开启客厅灯", { exact: true }).waitFor();
      check(report, `${viewport.id}:automation-route`, await page.getByText("客厅灯光组", { exact: true }).count() === 0, windowState(await page.url()));
      await openPage(page, "设备组", "groups");
      await page.getByText("客厅灯光组", { exact: true }).waitFor();
      check(report, `${viewport.id}:group-route`, await page.getByText("回家", { exact: true }).count() === 0, windowState(await page.url()));
      await openPage(page, "情景", "scenes");
      await page.getByText("回家", { exact: true }).waitFor();
      check(report, `${viewport.id}:scene-route`, new URL(page.url()).hash === "#scenes", windowState(await page.url()));
      await verifyDeepLinks(page, report, viewport, baseUrl);
      if (viewport.id === "mobile-375") {
        await verifyScrollAndFocusRestore(page, report, baseUrl);
        await verifyUnsavedGuard(page, report, baseUrl, evidenceDir);
        await verifyAutomationUnsavedGuard(page, report, baseUrl, evidenceDir);
        await verifyGroupUnsavedGuard(page, report, baseUrl, evidenceDir);
        await verifyTextResize(page, report, evidenceDir);
      }
      const motion = await inspectReducedMotion(page);
      check(report, `${viewport.id}:reduced-motion`, motion.matches && motion.maxDurationSeconds <= 0.02, motion);

      await openPage(page, "总览", "overview");
      const layout = await page.evaluate(() => { const shell = document.querySelector(".management-shell"); const main = document.querySelector(".shell-main"); const visible = (element) => element.getClientRects().length > 0; const bottomNavigation = [...document.querySelectorAll(".bottom-nav")].find(visible); const nav = bottomNavigation?.getBoundingClientRect(); const reservedBottom = shell ? parseFloat(getComputedStyle(shell).paddingBottom) || 0 : 0; const contentBottomPadding = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0; const rgb = (value) => { const channels = (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number); return value.startsWith("color(srgb ") ? channels.map((channel) => channel * 255) : channels; }; const luminance = (color) => color.map((part) => { const channel = part / 255; return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, part, index) => sum + part * [0.2126, 0.7152, 0.0722][index], 0); const contrast = (foreground, background) => { const values = [luminance(rgb(foreground)), luminance(rgb(background))].sort((left, right) => right - left); return (values[0] + 0.05) / (values[1] + 0.05); }; const body = getComputedStyle(document.body); const activeNavigation = [...document.querySelectorAll('[aria-current="page"]')].find(visible); const activeStyle = activeNavigation ? getComputedStyle(activeNavigation) : body; return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, links: [...document.querySelectorAll(".bottom-nav a, .bottom-nav button, .desktop-navigation a")].filter(visible).map((element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }), current: [...document.querySelectorAll('.bottom-nav [aria-current="page"], .desktop-navigation a[aria-current="page"]')].filter(visible).length, reservedBottom, contentBottomPadding, separated: !nav || Boolean(nav.bottom <= window.innerHeight && contentBottomPadding >= nav.height + 10), contrast: { body: contrast(body.color, body.backgroundColor), activeNavigation: contrast(activeStyle.color, activeStyle.backgroundColor) } }; });
      check(report, `${viewport.id}:no-overflow`, layout.scrollWidth <= layout.clientWidth + 1, layout);
      check(report, `${viewport.id}:touch-navigation`, layout.links.every((item) => item.width >= 44 && item.height >= 44), layout.links);
      check(report, `${viewport.id}:single-current-tab`, layout.current === 1, layout.current);
      check(report, `${viewport.id}:navigation-does-not-cover-content`, layout.separated, layout);
      check(report, `${viewport.id}:contrast`, layout.contrast.body >= 4.5 && layout.contrast.activeNavigation >= 4.5, layout.contrast);
      const screenshot = path.join(evidenceDir, `${viewport.id}.png`); await page.screenshot({ path: screenshot, fullPage: true });
      check(report, `${viewport.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
      check(report, `${viewport.id}:request-failures`, diagnostics.failedRequests.length === 0, diagnostics.failedRequests);
      check(report, `${viewport.id}:http-errors`, diagnostics.httpErrors.length === 0, diagnostics.httpErrors);
      check(report, `${viewport.id}:console-errors`, diagnostics.consoleMessages.filter((item) => item.type === "error").length === 0, diagnostics.consoleMessages);
      report.viewports.push({ ...viewport, screenshot: path.basename(screenshot), layout, ...diagnostics });
      await context.close();
    }
    check(report, "home:scene-execution-does-not-open-editor", Object.keys(mockServer.fixture.sceneExecutions).length === 0, mockServer.fixture.sceneExecutions);
    const legacyRoute = await bridgeRequest(bridgeOrigin, "/api/operations/device.property.set");
    check(report, "bridge:semantic-route-404", legacyRoute.status === 404, legacyRoute);
    const unknownAction = await bridgeRequest(bridgeOrigin, "/api/actions/a_000000000000");
    check(report, "bridge:unknown-action-403", unknownAction.status === 403 && unknownAction.body.status === "blocked", unknownAction);
  } finally { await browser.close(); }
  report.finishedAt = new Date().toISOString(); report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed"; return report;
}

async function openPage(page, label, route) {
  await requestPageNavigation(page, label);
  await page.waitForFunction((value) => window.location.hash === "#" + value || (value === "overview" && ["", "#overview"].includes(window.location.hash)), route);
}

async function requestPageNavigation(page, label) {
  const nav = page.getByRole("navigation", { name: "主导航" });
  const link = nav.getByRole("link", { name: label, exact: true });
  if (await link.count() && await link.isVisible()) await link.click();
  else {
    await nav.getByRole("button", { name: "更多" }).click();
    await page.getByRole("dialog", { name: "更多" }).getByRole("button", { name: label, exact: true }).click();
  }
}

async function bridgeRequest(origin, pathname) { const response = await requestBridgePath(origin, pathname); const text = await response.text(); let body = text; try { body = JSON.parse(text); } catch {} return { status: response.status, body }; }

async function verifyDeepLinks(page, report, viewport, baseUrl) {
  for (const item of [
    { route: "scenes/994001", selector: "#scene-detail-title", text: "回家" },
    { route: "automations/995001", selector: "#automation-detail-title", text: "日落开启客厅灯" },
    { route: "groups/993001", selector: ".group-detail h3", text: "客厅灯光组" },
  ]) {
    await page.goto(`${baseUrl}#${item.route}`, { waitUntil: "domcontentloaded" });
    await page.locator(item.selector).filter({ hasText: item.text }).waitFor();
    check(report, `${viewport.id}:deep-link-${item.route.split("/")[0]}`, new URL(page.url()).hash === "#" + item.route, windowState(await page.url()));
  }
  await page.goBack();
  check(report, `${viewport.id}:history-back`, new URL(page.url()).hash === "#automations/995001", windowState(await page.url()));
}

async function verifyScrollAndFocusRestore(page, report, baseUrl) {
  await page.goto(`${baseUrl}#scenes`, { waitUntil: "domcontentloaded" });
  const last = page.locator(".scene-list-row").last().locator(".scene-open-button");
  await last.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const before = await page.locator(".shell-content").evaluate((element) => element.scrollTop);
  await last.click();
  await page.getByRole("button", { name: "返回情景" }).click();
  await page.waitForFunction(() => document.activeElement?.matches(".scene-list-row:last-child .scene-open-button") === true);
  const after = await page.locator(".shell-content").evaluate((element) => element.scrollTop);
  check(report, "mobile-375:scroll-focus-restore", before > 0 && after >= before - 80, { before, after, focus: await page.evaluate(() => document.activeElement?.textContent?.trim() || "") });
}

async function verifyUnsavedGuard(page, report, baseUrl, evidenceDir) {
  await page.goto(`${baseUrl}#scenes/new`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("情景名称").fill("未保存的组合测试情景");
  const footer = await page.locator(".scene-editor-footer").evaluate((element) => { const rect = element.getBoundingClientRect(); const navigation = document.querySelector(".mobile-navigation")?.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, height: rect.height, navigationTop: navigation?.top || window.innerHeight, buttons: [...element.querySelectorAll("button")].map((button) => { const value = button.getBoundingClientRect(); return { width: value.width, height: value.height }; }) }; });
  check(report, "mobile-375:stable-editor-footer", footer.bottom <= footer.navigationTop && footer.buttons.every((button) => button.width >= 44 && button.height >= 44), footer);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-scene-editor.png"), fullPage: true });
  await requestPageNavigation(page, "自动化");
  const guard = page.getByRole("dialog", { name: "保留当前更改？" });
  await guard.waitFor();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const initialState = await page.evaluate(() => ({ hash: window.location.hash, focusInside: document.querySelector('[role="dialog"]')?.contains(document.activeElement) === true, overflow: document.body.style.overflow, moreDialogs: [...document.querySelectorAll('[role="dialog"]')].filter((element) => element.getAttribute("aria-labelledby") === "more-sheet-title").length }));
  check(report, "mobile-375:unsaved-guard", initialState.hash === "#scenes/new" && await guard.getByRole("button", { name: "继续编辑" }).isVisible() && initialState.moreDialogs === 0 && initialState.focusInside && initialState.overflow === "hidden", initialState);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-scene-unsaved-dialog.png"), fullPage: true });
  const continueEditing = guard.getByRole("button", { name: "继续编辑" });
  const cancelLeaving = guard.getByRole("button", { name: "取消离开" });
  await continueEditing.focus();
  await page.keyboard.press("Shift+Tab");
  check(report, "mobile-375:unsaved-focus-wrap-backward", await cancelLeaving.evaluate((element) => element === document.activeElement), await page.evaluate(() => document.activeElement?.textContent || ""));
  await page.keyboard.press("Tab");
  check(report, "mobile-375:unsaved-focus-wrap-forward", await continueEditing.evaluate((element) => element === document.activeElement), await page.evaluate(() => document.activeElement?.textContent || ""));
  await continueEditing.click();
  await guard.waitFor({ state: "detached" });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const resumed = await page.evaluate(() => ({ focus: document.activeElement?.outerHTML || "", focusRestored: document.activeElement?.matches('[aria-label="情景名称"], #scene-field-name') === true, overflow: document.body.style.overflow, dialogs: document.querySelectorAll('[role="dialog"]').length }));
  check(report, "mobile-375:unsaved-continue-restore", resumed.focusRestored && resumed.overflow !== "hidden" && resumed.dialogs === 0, resumed);
  await requestPageNavigation(page, "自动化");
  await page.getByRole("dialog", { name: "保留当前更改？" }).getByRole("button", { name: "放弃更改" }).click();
  await page.waitForFunction(() => window.location.hash === "#automations");
  await page.waitForFunction(() => document.activeElement?.matches("#automation-title") === true);
  check(report, "mobile-375:unsaved-discard-focus", await page.evaluate(() => document.activeElement?.matches('#automation-title') === true), await page.evaluate(() => document.activeElement?.outerHTML || ""));
}

async function verifyAutomationUnsavedGuard(page, report, baseUrl, evidenceDir) {
  await page.goto(`${baseUrl}#automations/new`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("自动化名称").fill("未保存的组合自动化");
  await requestPageNavigation(page, "情景");
  const guard = page.getByRole("dialog", { name: "保留当前更改？" });
  await guard.waitFor();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const state = await guard.evaluate((element) => ({ hash: window.location.hash, focusInside: element.contains(document.activeElement), overflow: document.body.style.overflow, dialogs: document.querySelectorAll('[role="dialog"]').length }));
  check(report, "mobile-375:automation-unsaved-guard", state.hash === "#automations/new" && state.focusInside && state.overflow === "hidden" && state.dialogs === 1, state);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-automation-unsaved-dialog.png"), fullPage: true });
  await page.keyboard.press("Escape");
  await guard.waitFor({ state: "detached" });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const escapeState = await page.evaluate(() => ({ hash: window.location.hash, focus: document.activeElement?.id || "", overflow: document.body.style.overflow }));
  check(report, "mobile-375:automation-unsaved-escape", escapeState.hash === "#automations/new" && escapeState.focus === "automation-field-name" && escapeState.overflow !== "hidden", escapeState);
  await requestPageNavigation(page, "情景");
  const reopened = page.getByRole("dialog", { name: "保留当前更改？" });
  await reopened.waitFor();
  await reopened.getByRole("button", { name: "放弃更改" }).click();
  await page.waitForFunction(() => window.location.hash === "#scenes" && document.activeElement?.matches("#scene-title") === true);
}

async function verifyGroupUnsavedGuard(page, report, baseUrl, evidenceDir) {
  await page.goto(`${baseUrl}#groups/new`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("设备组名称").fill("未保存的组合设备组");
  await requestPageNavigation(page, "情景");
  const guard = page.getByRole("dialog", { name: "保留当前更改？" });
  await guard.waitFor();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
  const state = await guard.evaluate((element) => ({ hash: window.location.hash, focusInside: element.contains(document.activeElement), overflow: document.body.style.overflow, dialogs: document.querySelectorAll('[role="dialog"]').length }));
  check(report, "mobile-375:group-unsaved-guard", state.hash === "#groups/new" && state.focusInside && state.overflow === "hidden" && state.dialogs === 1, state);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-group-unsaved-dialog.png"), fullPage: true });
  await guard.getByRole("button", { name: "放弃更改" }).click();
  await page.waitForFunction(() => window.location.hash === "#scenes" && document.activeElement?.matches("#scene-title") === true);
}

async function verifyTextResize(page, report, evidenceDir) {
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await page.waitForTimeout(100);
  const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, clipped: [...document.querySelectorAll("button, a, h1, h2, h3, p, strong, small")].filter((element) => element.getClientRects().length > 0 && element.scrollWidth > element.clientWidth + 1).map((element) => ({ text: element.textContent?.trim() || "", scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })) }));
  check(report, "mobile-375:text-200-percent", layout.scrollWidth <= layout.clientWidth + 1 && layout.clipped.length === 0, layout);
  await page.screenshot({ path: path.join(evidenceDir, "mobile-375-text-200-percent.png"), fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
}

async function inspectReducedMotion(page) { return page.evaluate(() => { const durations = [...document.querySelectorAll("button, a, [role=dialog], .page-stack")].filter((element) => element.getClientRects().length > 0).flatMap((element) => [getComputedStyle(element).animationDuration, getComputedStyle(element).transitionDuration]).flatMap((value) => value.split(",")).map((value) => value.trim().endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value) || 0); return { matches: matchMedia("(prefers-reduced-motion: reduce)").matches, maxDurationSeconds: Math.max(0, ...durations) }; }); }

function windowState(url) { return { hash: new URL(url).hash }; }
function collectDiagnostics(page) { const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] }; page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text() })); page.on("pageerror", (error) => value.pageErrors.push(error.message)); page.on("requestfailed", (request) => value.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText || "unknown" })); page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status() }); }); return value; }
function check(report, id, passed, detail) { report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail }); }
async function launchBrowser(chromium) { try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); } catch (channelError) { try { return await chromium.launch({ headless: true }); } catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); } } }
