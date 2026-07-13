import fs from "node:fs";
import path from "node:path";

import { opaqueActionId } from "./browser-boundary.mjs";

const pages = [
  ["overview", "总览"], ["spaces", "空间"], ["devices", "设备"], ["lights", "灯光"], ["curtains", "窗帘"],
  ["switches", "开关"], ["climate", "温控"], ["environment", "环境"], ["scenes", "情景"],
  ["automations", "自动化"], ["groups", "设备组"], ["gateways", "网关与协议"], ["panels", "面板旋钮"],
];

export async function runShellCanaryBrowserE2E({ chromium, baseUrl, target, evidenceDir }) {
  const report = { id: target.id, startedAt: new Date().toISOString(), checks: [], routes: [] };
  const browser = await launchBrowser(chromium);
  try {
    const context = await browser.newContext({ viewport: target.viewport, reducedMotion: "reduce", locale: "zh-CN", colorScheme: target.mode });
    const page = await context.newPage();
    const diagnostics = collectDiagnostics(page);
    await page.goto(`${baseUrl}#overview`, { waitUntil: "domcontentloaded" });
    await page.getByText("家庭在线", { exact: true }).waitFor();
    await page.locator('[data-page="overview"]').waitFor();

    await checkShellContract(page, report, target);
    for (const [route, label] of pages) {
      await navigate(page, target, route, label);
      const moduleCount = await page.locator(`[data-page="${route}"] > .module-section`).count();
      check(report, `${target.id}:route:${route}`, new URL(page.url()).hash === `#${route}` && moduleCount > 0, { url: page.url(), moduleCount });
      report.routes.push(route);
    }
    await checkHomeSlots(page, report, target);
    const homeScreenshot = path.join(evidenceDir, `${target.id}-home.png`);
    await page.screenshot({ path: homeScreenshot, fullPage: true });
    report.homeScreenshot = path.basename(homeScreenshot);

    if (target.navigation === "bottom-tabs") await checkMoreSheet(page, report, target);
    if (target.formFactor === "desktop") {
      await checkBusinessDialog(page, report, target);
      await checkPartialFailure(page, report, target, diagnostics);
    }
    await checkHistoryAndRestore(page, report, target, diagnostics);
    await saveAccessibilitySnapshot(page, evidenceDir, target.id);

    const screenshot = path.join(evidenceDir, `${target.id}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    const unexpectedHttpErrors = diagnostics.httpErrors.filter((item) => !item.expected);
    const unexpectedConsoleErrors = diagnostics.consoleMessages.filter((item) => item.type === "error" && !item.expected);
    check(report, `${target.id}:page-errors`, diagnostics.pageErrors.length === 0, diagnostics.pageErrors);
    const unexpectedRequestFailures = diagnostics.failedRequests.filter((item) => !item.expected);
    check(report, `${target.id}:request-failures`, unexpectedRequestFailures.length === 0, diagnostics.failedRequests);
    check(report, `${target.id}:http-errors`, unexpectedHttpErrors.length === 0, diagnostics.httpErrors);
    check(report, `${target.id}:console-errors`, unexpectedConsoleErrors.length === 0, diagnostics.consoleMessages);
    report.screenshot = path.basename(screenshot);
    report.diagnostics = diagnostics;
    await context.close();
  } finally {
    await browser.close();
  }
  report.finishedAt = new Date().toISOString();
  report.status = report.checks.every((item) => item.status === "passed") ? "passed" : "failed";
  return report;
}

async function checkHomeSlots(page, report, target) {
  await navigate(page, target, "overview", "总览");
  const slots = await page.locator('[data-page="overview"] [data-home-slot]').evaluateAll((elements) => elements.map((element) => element.getAttribute("data-home-slot")));
  check(report, `${target.id}:home-slots`, JSON.stringify(slots) === JSON.stringify(["status", "environment", "rooms", "scenes", "issues"]), slots);
  check(report, `${target.id}:home-slot-unique`, new Set(slots).size === slots.length, slots);
}

async function checkShellContract(page, report, target) {
  const audit = await page.evaluate(({ navigation, minimumTarget }) => {
    const shell = document.querySelector(".management-shell");
    const main = document.querySelector(".shell-main");
    const nav = document.querySelector(navigation === "bottom-tabs" ? ".mobile-navigation" : ".desktop-navigation");
    if (!(shell instanceof HTMLElement) || !(main instanceof HTMLElement) || !(nav instanceof HTMLElement)) throw new Error("shell contract is incomplete");
    const visibleControls = [...document.querySelectorAll("button, a, input, select")]
      .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
      .map((element) => { const rect = element.getBoundingClientRect(); return { name: element.getAttribute("aria-label") || element.textContent?.trim() || "", width: rect.width, height: rect.height }; });
    const headings = [...document.querySelectorAll("h1, h2, h3")].filter((element) => element instanceof HTMLElement && element.offsetParent !== null).map((element) => Number(element.tagName.slice(1)));
    const navRect = nav.getBoundingClientRect(); const mainRect = main.getBoundingClientRect();
    const navigationContainer = nav.closest(".shell-navigation") || nav;
    const containerStyle = getComputedStyle(navigationContainer);
    const shellPaddingBottom = Number.parseFloat(getComputedStyle(shell).paddingBottom) || 0;
    return {
      attributes: { formFactor: shell.dataset.formFactor, navigation: shell.dataset.navigation, density: shell.dataset.density, themePack: shell.dataset.themePack, themeMode: shell.dataset.themeMode },
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      visibleControls,
      headings,
      navigationCount: nav.querySelectorAll("a, button").length,
      separated: navigation === "bottom-tabs"
        ? containerStyle.position === "fixed" && shellPaddingBottom >= navigationContainer.getBoundingClientRect().height
        : navRect.right <= mainRect.left + 1,
      reducedMotion: getComputedStyle(document.querySelector(".spin") || nav).animationName,
      minimumTarget,
    };
  }, { navigation: target.navigation, minimumTarget: target.minimumTarget });
  check(report, `${target.id}:target-attributes`, Object.entries(target.expected).every(([key, value]) => audit.attributes[key] === value), audit.attributes);
  check(report, `${target.id}:navigation-count`, audit.navigationCount === (target.navigation === "bottom-tabs" ? 5 : pages.length), audit.navigationCount);
  check(report, `${target.id}:no-horizontal-overflow`, audit.scrollWidth <= audit.clientWidth + 1, audit);
  check(report, `${target.id}:navigation-separated`, audit.separated, audit);
  check(report, `${target.id}:touch-targets`, audit.visibleControls.every((item) => item.width >= target.minimumTarget && item.height >= target.minimumTarget), audit.visibleControls);
  check(report, `${target.id}:heading-order`, audit.headings.every((level, index) => index === 0 || level <= audit.headings[index - 1] + 1), audit.headings);
  check(report, `${target.id}:reduced-motion`, audit.reducedMotion === "none", audit.reducedMotion);
}

async function navigate(page, target, route, label) {
  if (new URL(page.url()).hash === `#${route}`) return;
  const selector = target.navigation === "bottom-tabs" ? ".mobile-navigation" : ".desktop-navigation";
  const directLink = page.locator(selector).getByRole("link", { name: label, exact: true });
  if (target.navigation === "bottom-tabs" && await directLink.count() === 0) {
    await page.locator(".mobile-navigation").getByRole("button", { name: "更多", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "更多" });
    await dialog.waitFor();
    await dialog.getByRole("button", { name: label, exact: true }).click();
  } else {
    await directLink.click();
  }
  await page.locator(`[data-page="${route}"]`).waitFor();
}

async function checkMoreSheet(page, report, target) {
  const trigger = page.locator(".mobile-navigation").getByRole("button", { name: "更多", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "更多" });
  await dialog.waitFor();
  check(report, `${target.id}:more-scroll-lock`, await page.evaluate(() => document.body.style.overflow === "hidden"), await page.evaluate(() => document.body.style.overflow));
  check(report, `${target.id}:more-initial-focus`, await dialog.evaluate((element) => element.contains(document.activeElement)), await page.evaluate(() => document.activeElement?.outerHTML));
  await dialog.getByRole("button", { name: "关闭更多页面" }).focus();
  await page.keyboard.press("Shift+Tab");
  check(report, `${target.id}:more-focus-wrap-backward`, await dialog.getByRole("button", { name: "面板旋钮", exact: true }).evaluate((element) => element === document.activeElement), await page.evaluate(() => document.activeElement?.textContent));
  await page.keyboard.press("Tab");
  check(report, `${target.id}:more-focus-wrap-forward`, await dialog.getByRole("button", { name: "关闭更多页面" }).evaluate((element) => element === document.activeElement), await page.evaluate(() => document.activeElement?.getAttribute("aria-label")));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check(report, `${target.id}:more-focus-restore`, await trigger.evaluate((element) => element === document.activeElement), await page.evaluate(() => document.activeElement?.textContent));
  check(report, `${target.id}:more-scroll-restore`, await page.evaluate(() => document.body.style.overflow !== "hidden"), await page.evaluate(() => document.body.style.overflow));
}

async function checkBusinessDialog(page, report, target) {
  await navigate(page, target, "devices", "设备");
  await page.locator(".managed-device-row").first().click();
  await page.locator(".device-detail").waitFor();
  const trigger = page.getByRole("button", { name: "重命名", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  check(report, `${target.id}:dialog-scroll-lock`, await page.evaluate(() => document.body.style.overflow === "hidden"), "device dialog open");
  check(report, `${target.id}:dialog-initial-focus`, await page.getByRole("button", { name: "关闭设备管理" }).evaluate((element) => element === document.activeElement), await page.evaluate(() => document.activeElement?.getAttribute("aria-label")));
  await page.keyboard.press("Shift+Tab");
  check(report, `${target.id}:dialog-focus-trap`, await dialog.evaluate((element) => element.contains(document.activeElement)), await page.evaluate(() => document.activeElement?.textContent));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.waitForFunction((element) => document.activeElement === element, await trigger.elementHandle());
  check(report, `${target.id}:dialog-focus-restore`, await trigger.evaluate((element) => element === document.activeElement), await page.evaluate(() => document.activeElement?.textContent));
  check(report, `${target.id}:dialog-scroll-restore`, await page.evaluate(() => document.body.style.overflow !== "hidden"), await page.evaluate(() => document.body.style.overflow));
}

async function checkPartialFailure(page, report, target, diagnostics) {
  await navigate(page, target, "devices", "设备");
  const stateQueryPath = `/api/actions/${opaqueActionId("state.query")}`;
  let failed = false;
  await page.route(`**${stateQueryPath}`, async (route) => {
    if (failed) return route.continue();
    failed = true;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: "error", userMessage: "综合 canary 注入的局部失败。" }) });
  });
  const before = await page.locator(".managed-device-row").count();
  await page.getByRole("button", { name: "重新同步家庭状态" }).click();
  const alert = page.getByRole("alert");
  await alert.waitFor();
  diagnostics.httpErrors.forEach((item) => { if (item.status === 503) item.expected = true; });
  diagnostics.consoleMessages.forEach((item) => { if (item.type === "error" && item.text.includes("Failed to load resource")) item.expected = true; });
  check(report, `${target.id}:partial-failure-visible`, await alert.getByText("部分家庭数据同步失败", { exact: true }).isVisible(), await alert.innerText());
  check(report, `${target.id}:partial-failure-retains-content`, await page.locator(".managed-device-row").count() === before && before > 0, before);
  await page.unroute(`**${stateQueryPath}`);
  await alert.getByRole("button", { name: "重新同步" }).click();
  await alert.waitFor({ state: "hidden" });
  await page.getByText("家庭在线", { exact: true }).waitFor();
  check(report, `${target.id}:partial-failure-recovered`, await page.getByRole("alert").count() === 0, "retry completed");
}

async function checkHistoryAndRestore(page, report, target, diagnostics) {
  const failureStart = diagnostics.failedRequests.length;
  await navigate(page, target, "scenes", "情景");
  await navigate(page, target, "automations", "自动化");
  await page.goBack(); await page.locator('[data-page="scenes"]').waitFor();
  check(report, `${target.id}:history-back`, new URL(page.url()).hash === "#scenes", page.url());
  await page.goForward(); await page.locator('[data-page="automations"]').waitFor();
  check(report, `${target.id}:history-forward`, new URL(page.url()).hash === "#automations", page.url());
  await page.reload({ waitUntil: "domcontentloaded" }); await page.locator('[data-page="automations"]').waitFor();
  diagnostics.failedRequests.slice(failureStart).forEach((item) => { if (item.failure === "net::ERR_ABORTED") item.expected = true; });
  check(report, `${target.id}:refresh-route-restore`, new URL(page.url()).hash === "#automations", page.url());
}

async function saveAccessibilitySnapshot(page, evidenceDir, id) {
  const snapshot = await page.locator("body").ariaSnapshot();
  fs.writeFileSync(path.join(evidenceDir, `${id}-accessibility.yml`), `${snapshot}\n`);
}

function collectDiagnostics(page) {
  const value = { consoleMessages: [], pageErrors: [], failedRequests: [], httpErrors: [] };
  page.on("console", (message) => value.consoleMessages.push({ type: message.type(), text: message.text(), expected: false }));
  page.on("pageerror", (error) => value.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    value.failedRequests.push({ url: request.url(), failure, expected: false });
  });
  page.on("response", (response) => { if (response.status() >= 400) value.httpErrors.push({ url: response.url(), status: response.status(), expected: false }); });
  return value;
}

function check(report, id, passed, detail) {
  report.checks.push({ id, status: passed ? "passed" : "failed", detail: detail && typeof detail === "object" ? structuredClone(detail) : detail });
}

async function launchBrowser(chromium) {
  try { return await chromium.launch({ channel: process.env.YPA_PLAYWRIGHT_CHANNEL || "chrome", headless: true }); }
  catch (channelError) {
    try { return await chromium.launch({ headless: true }); }
    catch { throw new Error(`无法启动 Chromium。${channelError instanceof Error ? channelError.message : ""}`); }
  }
}
